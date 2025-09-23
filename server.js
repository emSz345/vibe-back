const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const huggingfaceRoutes = require('./routes/huggingfaceRoutes');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// Exporte o middleware para ser usado em outros arquivos
const authenticateToken = (req, res, next) => {
const authHeader = req.headers['authorization'];
const token = authHeader && authHeader.split(' ')[1];

console.log('🔐 Middleware - Header:', authHeader);
console.log('🔐 Middleware - Token recebido:', token ? 'Presente' : 'Ausente');

if (!token) {
console.log('❌ Token não fornecido');
return res.status(401).json({ message: 'Token de acesso necessário' });
}

jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
if (err) {
console.log('❌ Token inválido:', err.message);
return res.status(403).json({ message: 'Token inválido' });
}

console.log('✅ Token válido - Decoded:', decoded);

if (!decoded.userId) {
console.log('❌ userId não encontrado no token');
return res.status(403).json({ message: 'Estrutura do token inválida' });
}

req.user = decoded;
next();
});
};
module.exports = { app, authenticateToken }; // Exporte o middleware para ser usado nas rotas

const uploadBaseDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadBaseDir)) {
fs.mkdirSync(uploadBaseDir);
console.log(`Pasta criada: ${uploadBaseDir}`);
}

const perfilImgDir = path.join(uploadBaseDir, 'perfil-img');
const carrosselDir = path.join(uploadBaseDir, 'carrossel');
if (!fs.existsSync(perfilImgDir)) {
fs.mkdirSync(perfilImgDir, { recursive: true });
console.log(`Subpasta criada: ${perfilImgDir}`);
}
if (!fs.existsSync(carrosselDir)) {
fs.mkdirSync(carrosselDir, { recursive: true });
console.log(`Subpasta criada: ${carrosselDir}`);
}

const userRoutes = require('./routes/users');
const eventRoutes = require('./routes/eventRoutes');
const carrosselRoutes = require('./routes/carrosselRoutes');
const compraRoutes = require('./routes/comprasRoutes');
const perfilRoutes = require('./routes/perfilRoutes');
const payRoutes = require('./routes/payRoutes');
const splitPayRoutes = require('./routes/splitPayRoutes');
const mercadopagoAuthRoutes = require('./routes/mercadopagoAuthRoutes');

const webhookRouter = require('./routes/webhook'); 

const PORT = process.env.PORT || 5000;
const front = process.env.FRONTEND_URL;

app.use(cors({
origin: front,
credentials: true
}));

app.use(express.json());
// app.use(express.json());
app.use(cookieParser());

app.use('/api/webhook', webhookRouter); 

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/perfil-img', express.static(path.join(__dirname, 'uploads', 'perfil-img')));
app.use('/uploads/carrossel', express.static(path.join(__dirname, 'uploads', 'carrossel')));

mongoose.connect(process.env.MONGO_URI, {
useNewUrlParser: true,
useUnifiedTopology: true,
})
.then(() => console.log("MongoDB conectado"))
.catch((err) => console.error("Erro ao conectar MongoDB:", err));

app.use('/api/users', userRoutes);
app.use('/api/eventos', eventRoutes);
app.use('/api/auth', userRoutes);
app.use('/api/carrossel', carrosselRoutes);
app.use('/api/huggingface', huggingfaceRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api/pagamento', payRoutes);
app.use('/split-pay', splitPayRoutes);
app.use('/api/mercadopago', mercadopagoAuthRoutes);

app.get('/api/eventos/verificar-estoque/:id', (req, res) => {
res.status(200).json({ estoqueDisponivel: true });
});

app.use((req, res, next) => {
res.status(404).send("Desculpe, a página que você procura não foi encontrada.");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
