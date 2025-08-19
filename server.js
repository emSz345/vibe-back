const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const eventBotRoutes = require('./routes/eventBotRoutes');


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

app.use(cors());
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
app.use('/api', eventRoutes);
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
