const express = require('express');
const mongoose = require('mongoose');
const { enviarEmail } = require('./utils/emailService');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');


// Garante que a pasta 'uploads/' exista
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Rotas
const userRoutes = require('./routes/users');
const eventRoutes = require('./routes/eventRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use('/uploads', express.static('uploads')); // Torna os arquivos acessíveis via URL
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

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
