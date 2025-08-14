const express = require('express');
const mongoose = require('mongoose');
const { enviarEmail } = require('./utils/emailService');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');


// Garante que a pasta 'uploads/' exista
const uploadBaseDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadBaseDir)) {
    fs.mkdirSync(uploadBaseDir);
    console.log(`Pasta criada: ${uploadBaseDir}`);
}

// Garante que as subpastas 'uploads/perfil-img/' e 'uploads/carrossel/' existam
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


// Rotas
const userRoutes = require('./routes/users');
const eventRoutes = require('./routes/eventRoutes');
const carrosselRoutes = require('./routes/carrosselRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- AQUI ESTÁ A PARTE CORRIGIDA ---
// Middleware para servir arquivos estáticos. A ordem é importante!
// Servimos as pastas mais específicas primeiro.

// Rota para as imagens de perfil
app.use('/uploads/perfil-img', express.static(path.join(__dirname, 'uploads', 'perfil-img')));

// Rota para as imagens do carrossel
app.use('/uploads/carrossel', express.static(path.join(__dirname, 'uploads', 'carrossel')));

// Rota genérica para o diretório de uploads (para arquivos que estejam na raiz)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// --- FIM DA PARTE CORRIGIDA ---


// Conecta ao MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("MongoDB conectado"))
    .catch((err) => console.error("Erro ao conectar MongoDB:", err));

// Rotas
app.use('/api/users', userRoutes);
app.use('/api/eventos', eventRoutes);
app.use('/api/carrossel', carrosselRoutes);

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
