const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');

// =================================================================
// 📂 Importação de Models
// =================================================================
const Ingresso = require('./models/ingresso');
const Event = require('./models/Event');

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
// 🔗 Importação de Rotas (ATUALIZADO)
// =================================================================
const payRoutes = require('./routes/payRoutes');
const userRoutes = require('./routes/users');
const eventRoutes = require('./routes/eventRoutes');
const carrosselRoutes = require('./routes/carrosselRoutes');
const huggingfaceRoutes = require('./routes/chat');
const perfilRoutes = require('./routes/perfilRoutes');
const splitPayRoutes = require('./routes/splitPayRoutes');
const mercadopagoAuthRoutes = require('./routes/mercadopagoAuthRoutes');
const carrinhoRoutes = require('./routes/carrinhoRoutes');
const ingressoRoutes = require('./routes/ingressoRoutes');
const adminRoutes = require('./routes/adminRoutes');

// 🔥 NOVA ROTA DO CHATBOT REFATORADO
const chatRoutes = require('./routes/chat');

const { iniciarCron: iniciarCronPayout } = require('./services/payoutScheduler');

const PORT = process.env.PORT || 5000;
const front = process.env.FRONTEND_URL;

// =================================================================
// ⚙️ Configuração de Middlewares
// =================================================================
app.use(cors({
    origin: front,
    credentials: true
}));

// 1. COOKIE PARSER
app.use(cookieParser());

// 2. WEBHOOK (RAW)
app.use('/api/pagamento/webhook', express.raw({ type: 'application/json' }), payRoutes);

// 3. JSON PARSER com limite aumentado para o chatbot
app.use(express.json({ limit: '10mb' })); // ← Aumentei para 10mb

// --- Servir Arquivos Estáticos ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
// 🗺️ Rotas da API (ATUALIZADO)
// =================================================================
app.use('/api/users', userRoutes);
app.use('/api/auth', userRoutes);
app.use('/api/eventos', eventRoutes);
app.use('/api/carrossel', carrosselRoutes);
app.use('/api/huggingface', huggingfaceRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api/pagamento', payRoutes);
app.use('/split-pay', splitPayRoutes);
app.use('/api/mercadopago', mercadopagoAuthRoutes);
app.use('/api/carrinho', carrinhoRoutes);
app.use('/api/ingressos', ingressoRoutes);
app.use('/api/admin', adminRoutes);

// 🔥 NOVA ROTA DO CHATBOT REFATORADO
app.use('/api/chat', chatRoutes);

// ⚠️ Rota temporária de verificação de estoque
app.get('/api/eventos/verificar-estoque/:id', (req, res) => {
    res.status(200).json({ estoqueDisponivel: true });
});

// --- Rota de saúde para monitoramento ---
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// --- Middleware de 404 ---
app.use((req, res, next) => {
    res.status(404).json({ 
        success: false,
        error: "Desculpe, a página que você procura não foi encontrada." 
    });
});

// --- Middleware de tratamento de erros ---
app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err);
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
});

// =================================================================
// 🚀 Inicialização do Servidor
// =================================================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB conectado");

        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando na porta ${PORT}`);
            console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🤖 Chatbot refatorado disponível em: /api/chat`);
        });

        // ================== NOVO CRON JOB (PAYOUTS) ==================
        console.log('⏰ Iniciando agendador para Payouts de produtores...');
        iniciarCronPayout(); // <-- CHAMA A FUNÇÃO QUE IMPORTAMOS
        // =============================================================

        // ================== CRON JOB (MANTIDO) ==================
        console.log('⏰ Iniciando agendador para limpar ingressos expirados...');

        cron.schedule('*/5 * * * *', async () => {
            console.log('[Cron Job] Verificando ingressos expirados...');

            const session = await mongoose.startSession();
            try {
                await session.startTransaction();

                const ingressosExpirados = await Ingresso.find({
                    status: 'Pendente',
                    expiresAt: { $lt: new Date() }
                }).session(session);

                if (ingressosExpirados.length === 0) {
                    console.log('[Cron Job] Nenhum ingresso expirado encontrado.');
                    await session.abortTransaction();
                    session.endSession();
                    return;
                }

                console.log(`[Cron Job] ${ingressosExpirados.length} ingressos expirados encontrados. Processando...`);

                const contagemParaDevolver = {};
                const idsParaAtualizar = [];

                for (const ingresso of ingressosExpirados) {
                    const idEvento = ingresso.eventoId.toString();
                    const tipo = ingresso.tipoIngresso;
                    idsParaAtualizar.push(ingresso._id);

                    if (!contagemParaDevolver[idEvento]) {
                        contagemParaDevolver[idEvento] = { Inteira: 0, Meia: 0 };
                    }
                    if (tipo === 'Inteira') contagemParaDevolver[idEvento].Inteira++;
                    if (tipo === 'Meia') contagemParaDevolver[idEvento].Meia++;
                }

                const restockPromises = [];
                for (const eventoId in contagemParaDevolver) {
                    const contagens = contagemParaDevolver[eventoId];
                    const incrementOperation = { $inc: {} };
                    
                    if (contagens.Inteira > 0) incrementOperation.$inc.quantidadeInteira = contagens.Inteira;
                    if (contagens.Meia > 0) incrementOperation.$inc.quantidadeMeia = contagens.Meia;

                    restockPromises.push(
                        Event.updateOne(
                            { _id: eventoId },
                            incrementOperation,
                            { session: session }
                        )
                    );
                }

                await Promise.all(restockPromises);

                await Ingresso.updateMany(
                    { _id: { $in: idsParaAtualizar } },
                    {
                        $set: { status: 'Expirado' },
                        $unset: { expiresAt: "" }
                    },
                    { session: session }
                );

                await session.commitTransaction();
                console.log(`[Cron Job] SUCESSO: ${idsParaAtualizar.length} ingressos atualizados para "Expirado"`);

            } catch (error) {
                await session.abortTransaction();
                console.error('[Cron Job] ERRO:', error);
            } finally {
                session.endSession();
            }
        });
        // =================== FIM DO CRON JOB ===================

    })
    .catch((err) => {
        console.error("❌ Erro ao conectar MongoDB:", err);
        process.exit(1);
    });