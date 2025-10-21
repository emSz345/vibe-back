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
const userRoutes = require('./routes/users');
const eventRoutes = require('./routes/eventRoutes');
const carrosselRoutes = require('./routes/carrosselRoutes');
const huggingfaceRoutes = require('./routes/huggingfaceRoutes');
const compraRoutes = require('./routes/comprasRoutes');
const perfilRoutes = require('./routes/perfilRoutes');
const payRoutes = require('./routes/payRoutes');
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

// 2. WEBHOOK (RAW): Parser específico para a rota de webhook, antes do parser JSON global.
app.use('/api/pagamento/webhook', express.raw({ type: 'application/json' }), payRoutes);

// 3. JSON PARSER (CORRIGIDO): Para todas as outras rotas, com limite de segurança.
//    Esta é a correção principal: apenas UMA chamada, já com o limite.
app.use(express.json({ limit: '10kb' }));

// --- Servir Arquivos Estáticos ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
// 💾 Conexão com o Banco de Dados
// =================================================================
mongoose.connect(process.env.MONGO_URI) // As opções `useNewUrlParser` e `useUnifiedTopology` não são mais necessárias no Mongoose 6+
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
// 🚀 Inicialização do Servidor
// =================================================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
