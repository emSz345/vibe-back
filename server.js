const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const eventBotRoutes = require('./routes/eventBotRoutes');
const jwt = require('jsonwebtoken');



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
    
    // Verifique se userId existe no token decodificado
    if (!decoded.userId) {
      console.log('❌ userId não encontrado no token');
      return res.status(403).json({ message: 'Estrutura do token inválida' });
    }
    
    req.user = decoded;
    next();
  });
};

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
const witaiRoutes = require('./routes/witaiRoutes'); 

const app = express();
const PORT = process.env.PORT || 5000;


const corsOptions = {
    orign: process.env.FRONTEND_URL || 'http://localhost:3000',
     credentials: true, 
    optionsSucessStatus: 20,
}

app.use(cors(corsOptions));
app.use(express.json());

// Middleware para servir arquivos estáticos.
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/perfil-img', express.static(path.join(__dirname, 'uploads', 'perfil-img')));
app.use('/uploads/carrossel', express.static(path.join(__dirname, 'uploads', 'carrossel')));

// Conecta ao MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("MongoDB conectado"))
    .catch((err) => console.error("Erro ao conectar MongoDB:", err));

// Conecte as rotas da sua API usando o prefixo '/api'
app.use('/api/users', userRoutes);
app.use('/api/eventos', eventRoutes);
app.use('/api/carrossel', carrosselRoutes);
app.use('/api/witai', witaiRoutes);
app.use('/api/bot/eventos', eventBotRoutes);


// Rota 404 - Adicione esta rota no final, antes da inicialização do servidor
app.use((req, res, next) => {
    res.status(404).send("Desculpe, a página que você procura não foi encontrada.");
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
