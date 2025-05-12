const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const multer = require('multer');
const path = require('path');

// Caminho absoluto para uploads
const uploadPath = path.join(__dirname, '..', 'uploads');

// Configuração do multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Rota para criação de evento com imagem
router.post('/criar', upload.single('imagem'), async (req, res) => {
  try {
    const {
      nome,
      categoria,
      descricao,
      rua,
      cidade,
      estado,
      linkMaps,
      dataInicio,
      horaInicio,
      querDoar,
      valorDoacao,
      criadoPor
    } = req.body;

    const novoEvento = new Event({
      nome,
      imagem: req.file.filename, // nome do arquivo salvo
      categoria,
      descricao,
      rua,
      cidade,
      estado,
      linkMaps,
      dataInicio,
      horaInicio,
      querDoar: querDoar === 'true',
      valorDoacao: querDoar === 'true' ? valorDoacao : 0,
      criadoPor
    });

    await novoEvento.save();

    res.status(201).json({
      message: 'Evento criado com sucesso!',
      evento: novoEvento
    });
  } catch (error) {
    console.error('Erro ao criar evento:', error);
    res.status(500).json({ message: 'Erro ao criar evento', error: error.message });
  }
});

module.exports = router;
