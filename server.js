const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cron = require('node-cron'); // Import do Cron

// =================================================================
// 📂 Importação de Models (NECESSÁRIOS PARA O CRON JOB)
// =================================================================
const Ingresso = require('./models/ingresso'); // Seu model
const Event = require('./models/Event');       // Model de Evento

// =================================================================
// 🔑 Middleware de Autenticação JWT
// =================================================================
const authenticateToken = (req, res, next) => {
    let token = req.cookies.authToken;

    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: 'Token de acesso necessário' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            res.clearCookie('authToken');
            return res.status(403).json({ message: 'Token inválido' });
        }

        if (!decoded.userId) {
            return res.status(403).json({ message: 'Estrutura do token inválida (userId ausente)' });
        }

        req.user = decoded;
        req.user.userId = decoded.userId;
        next();
    });
};

module.exports = { app, authenticateToken };

// =================================================================
// 📂 Configuração de Diretórios de Uploads
// =================================================================
const uploadBaseDir = path.join(__dirname, 'uploads');
const perfilImgDir = path.join(uploadBaseDir, 'perfil-img');
const carrosselDir = path.join(uploadBaseDir, 'carrossel');

[uploadBaseDir, perfilImgDir, carrosselDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Pasta de upload criada: ${dir}`);
    }
});

// =================================================================
// 🔗 Importação de Rotas
// =================================================================
// Importa payRoutes PRIMEIRO para usar na regra de webhook raw
const payRoutes = require('./routes/payRoutes');

const userRoutes = require('./routes/users');
const eventRoutes = require('./routes/eventRoutes');
const carrosselRoutes = require('./routes/carrosselRoutes');
const huggingfaceRoutes = require('./routes/huggingfaceRoutes');
const compraRoutes = require('./routes/comprasRoutes');
const perfilRoutes = require('./routes/perfilRoutes');
const splitPayRoutes = require('./routes/splitPayRoutes');
const mercadopagoAuthRoutes = require('./routes/mercadopagoAuthRoutes');
const carrinhoRoutes = require('./routes/carrinhoRoutes');
const ingressoRoutes = require('./routes/ingressoRoutes');
const adminRoutes = require('./routes/adminRoutes');

const PORT = process.env.PORT || 5000;
const front = process.env.FRONTEND_URL;

// =================================================================
// ⚙️ Configuração de Middlewares (Ordem Correta e Otimizada)
// =================================================================

app.use(cors({
    origin: front,
    credentials: true
}));

// 1. COOKIE PARSER: Essencial para ler req.cookies
app.use(cookieParser());

// 2. WEBHOOK (RAW): Parser específico para a rota de webhook, ANTES do parser JSON global.
app.use('/api/pagamento/webhook', express.raw({ type: 'application/json' }), payRoutes);

// 3. JSON PARSER (CORRIGIDO): Para todas as outras rotas.
app.use(express.json({ limit: '10kb' }));

// --- Servir Arquivos Estáticos ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
// 🗺️ Rotas da API
// =================================================================
app.use('/api/users', userRoutes);
app.use('/api/auth', userRoutes);
app.use('/api/eventos', eventRoutes);
app.use('/api/carrossel', carrosselRoutes);
app.use('/api/huggingface', huggingfaceRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api/pagamento', payRoutes); // Rotas principais (iniciar-pagamento, etc.)
app.use('/split-pay', splitPayRoutes);
app.use('/api/mercadopago', mercadopagoAuthRoutes);
app.use('/api/carrinho', carrinhoRoutes);
app.use('/api/ingressos', ingressoRoutes);
app.use('/api/admin', adminRoutes);

// ⚠️ Rota temporária de verificação de estoque
app.get('/api/eventos/verificar-estoque/:id', (req, res) => {
    res.status(200).json({ estoqueDisponivel: true });
});

// --- Middleware de 404 ---
app.use((req, res, next) => {
    res.status(404).send("Desculpe, a página que você procura não foi encontrada.");
});

// =================================================================
// 🚀 Inicialização do Servidor e Conexão com o Banco de Dados
// =================================================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB conectado");

        // 🔥 INICIA O SERVIDOR APENAS DEPOIS DE CONECTAR
        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando na porta ${PORT}`);
        });

        // ================== INÍCIO DO CRON JOB ==================
        // Roda a cada 5 minutos ('*/5 * * * *')
        console.log('Iniciando o agendador (Cron Job) para limpar ingressos expirados.');

        cron.schedule('*/5 * * * *', async () => {
            console.log('[Cron Job] Rodando verificação de ingressos expirados...');

            const session = await mongoose.startSession();
            try {
                await session.startTransaction();

                // 1. Encontra ingressos "Pendentes" que já passaram da data de expiração
                const ingressosExpirados = await Ingresso.find({
                    status: 'Pendente',
                    expiresAt: { $lt: new Date() } // $lt = 'less than' (menor que agora)
                }).session(session);

                if (ingressosExpirados.length === 0) {
                    console.log('[Cron Job] Nenhum ingresso expirado encontrado.');
                    await session.abortTransaction(); // Aborta se não há nada a fazer
                    session.endSession();
                    return;
                }

                console.log(`[Cron Job] ${ingressosExpirados.length} ingressos expirados encontrados. Processando devolução...`);

                // 2. Agrupa para devolução
                const contagemParaDevolver = {};
                const idsParaAtualizar = [];

                for (const ingresso of ingressosExpirados) {
                    const idEvento = ingresso.eventoId.toString();
                    const tipo = ingresso.tipoIngresso;
                    idsParaAtualizar.push(ingresso._id); // Guarda o ID para atualizar o status

                    if (!contagemParaDevolver[idEvento]) {
                        contagemParaDevolver[idEvento] = { Inteira: 0, Meia: 0 };
                    }
                    if (tipo === 'Inteira') contagemParaDevolver[idEvento].Inteira++;
                    if (tipo === 'Meia') contagemParaDevolver[idEvento].Meia++;
                }

                // 3. Devolve (re-incrementa) o estoque
                const restockPromises = [];
                for (const eventoId in contagemParaDevolver) {
                    const contagens = contagemParaDevolver[eventoId];
                    const totalADevolver = contagens.Inteira + contagens.Meia;

                    // 🔥 ATENÇÃO: Verifique se os nomes abaixo estão corretos
                    // de acordo com seu Model 'Event.js'
                    const incrementOperation = { $inc: {} };
                    if (contagens.Inteira > 0) incrementOperation.$inc.quantidadeInteira = contagens.Inteira;
                    if (contagens.Meia > 0) incrementOperation.$inc.quantidadeMeia = contagens.Meia;                      // <-- MUDE AQUI

                    restockPromises.push(
                        Event.updateOne(
                            { _id: eventoId },
                            incrementOperation,
                            { session: session } // Dentro da transação
                        )
                    );
                }

                await Promise.all(restockPromises); // Espera o estoque voltar

                // 4. Atualiza o status dos ingressos para "Expirado"
                await Ingresso.updateMany(
                    { _id: { $in: idsParaAtualizar } },
                    {
                        $set: { status: 'Expirado' }, // Define o novo status
                        $unset: { expiresAt: "" } // Remove o campo de expiração
                    },
                    { session: session } // Dentro da transação
                );

                // 5. Sucesso! Efetiva a transação
                await session.commitTransaction();
                console.log(`[Cron Job] SUCESSO: ${idsParaAtualizar.length} ingressos atualizados para "Expirado" e estoque devolvido.`);

            } catch (error) {
                // Se algo der errado, aborta tudo
                await session.abortTransaction();
                console.error('[Cron Job] ERRO ao processar ingressos expirados:', error);
            } finally {
                session.endSession();
            }
        });
        // =================== FIM DO CRON JOB ===================

    })
    .catch((err) => {
        console.error("❌ Erro ao conectar MongoDB:", err);
        process.exit(1); // Encerra o processo se não conseguir conectar ao DB
    });