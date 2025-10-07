const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// =================================================================
// 🔑 Middleware de Autenticação JWT (Versão Unificada e Otimizada)
// -> Prioriza a verificação do cookie 'authToken' e limpa-o se for inválido.
// -> Também verifica o cabeçalho 'Authorization' para flexibilidade da API.
// =================================================================
const authenticateToken = (req, res, next) => {
    // 1. Tenta obter o token do COOKIE chamado 'authToken' (Prioridade)
    let token = req.cookies.authToken;

    // 2. Se não estiver no cookie, tenta obtê-lo do cabeçalho Authorization
    if (!token) {
        const authHeader = req.headers['authorization'];
        // Tenta pegar o token após 'Bearer '
        token = authHeader && authHeader.split(' ')[1]; 
    }

    if (!token) {
        // Falha se não encontrar token em cookie nem em header
        return res.status(401).json({ message: 'Token de acesso necessário' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            // Se o token for inválido, limpa o cookie 'authToken' para forçar o logout
            res.clearCookie('authToken');
            return res.status(403).json({ message: 'Token inválido' });
        }

        if (!decoded.userId) {
            return res.status(403).json({ message: 'Estrutura do token inválida (userId ausente)' });
        }

        // Anexa o objeto decodificado ao req.user
        req.user = decoded;
        req.user.userId = decoded.userId; // Garante que a propriedade userId esteja fácil de acessar
        next();
    });
};

// Exporta a instância do Express e o middleware para uso em outros arquivos de rota
module.exports = { app, authenticateToken };

// =================================================================
// 📂 Configuração de Diretórios de Uploads (Versão Limpa)
// =================================================================
const uploadBaseDir = path.join(__dirname, 'uploads');
const perfilImgDir = path.join(uploadBaseDir, 'perfil-img');
const carrosselDir = path.join(uploadBaseDir, 'carrossel');

// Cria todos os diretórios necessários de forma recursiva
[uploadBaseDir, perfilImgDir, carrosselDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Pasta de upload criada: ${dir}`);
    }
});

// =================================================================
// 🔗 Importação de Rotas (Incluindo a nova rota de Carrinho)
// =================================================================
const userRoutes = require('./routes/users');
const eventRoutes = require('./routes/eventRoutes');
const carrosselRoutes = require('./routes/carrosselRoutes');
const huggingfaceRoutes = require('./routes/huggingfaceRoutes');
const compraRoutes = require('./routes/comprasRoutes');
const perfilRoutes = require('./routes/perfilRoutes');
const payRoutes = require('./routes/payRoutes'); // Rota de pagamento (inclui lógica de webhook)
const splitPayRoutes = require('./routes/splitPayRoutes');
const mercadopagoAuthRoutes = require('./routes/mercadopagoAuthRoutes');
const carrinhoRoutes = require('./routes/carrinhoRoutes'); // Nova rota do seu amigo

const PORT = process.env.PORT || 5000;
const front = process.env.FRONTEND_URL;

// =================================================================
// ⚙️ Configuração de Middlewares (Ordem Otimizada)
// =================================================================

// Configuração de CORS (Essencial para Cookies)
app.use(cors({
    origin: front,
    credentials: true 
}));

// 1. COOKIE PARSER: Deve vir primeiro para poder ler cookies
app.use(cookieParser());

// 2. WEBHOOK (RAW): Deve ser o próximo, com parser específico (express.raw),
// e deve vir antes do express.json() para não quebrar a validação de assinatura.
// Usamos payRoutes para lidar com a rota de Webhook.
app.use('/api/pagamento/webhook', express.raw({ type: 'application/json' }), payRoutes); 

// 3. JSON PARSER: Para TODAS AS OUTRAS ROTAS que usam req.body como JSON.
app.use(express.json()); 

// --- Servir Arquivos Estáticos ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
// 💾 Conexão com o Banco de Dados
// =================================================================
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB conectado"))
.catch((err) => console.error("❌ Erro ao conectar MongoDB:", err));

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
app.use('/api/pagamento', payRoutes); 
app.use('/split-pay', splitPayRoutes);
app.use('/api/mercadopago', mercadopagoAuthRoutes);
app.use('/api/carrinho', carrinhoRoutes); // Rota de carrinho adicionada

// ⚠️ Rota temporária de verificação de estoque (Idealmente, mover para eventRoutes.js)
app.get('/api/eventos/verificar-estoque/:id', (req, res) => {
    res.status(200).json({ estoqueDisponivel: true });
});

// --- Middleware de 404 ---
app.use((req, res, next) => {
    res.status(404).send("Desculpe, a página que você procura não foi encontrada.");
});

// =================================================================
// 🚀 Inicialização do Servidor
// =================================================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
