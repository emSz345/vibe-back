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

// NOVO: Garante que a subpasta 'uploads/perfil-img/' exista
const perfilImgDir = path.join(uploadBaseDir, 'perfil-img');
if (!fs.existsSync(perfilImgDir)) {
  fs.mkdirSync(perfilImgDir, { recursive: true }); // 'recursive: true' garante a criação de pastas aninhadas
  console.log(`Subpasta criada: ${perfilImgDir}`);
}


// Rotas
const userRoutes = require('./routes/users');
const eventRoutes = require('./routes/eventRoutes');
const carrosselRoutes = require('./routes/carrosselRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
// Torna os arquivos acessíveis via URL. Usamos path.join para garantir o caminho correto.
// Isso servirá todos os arquivos dentro de 'uploads', incluindo 'uploads/perfil-img'.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // <--- AJUSTADO AQUI!
app.use(express.json());

// nodemail apos login

app.get('/api/enviar-email-teste', async (req, res) => {
  try {
      await enviarEmail({
          to: 'felipezica7000@exemplo.com',
          subject: 'Teste da API de E-mail ✔',
          html: `<h1>API de E-mail Funcionando!</h1>`
      });
      res.status(200).json({ message: 'E-mail de teste enviado com sucesso!' });
  } catch (error) {
      res.status(500).json({ message: 'Ocorreu um erro ao enviar o e-mail de teste.' });
  }
});

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