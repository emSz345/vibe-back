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


router.get('/listar', async (req, res) => {
  try {
    const eventos = await Event.find();
    res.status(200).json(eventos);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar eventos', error: error.message });
  }
});

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
      dataFim,
      valorIngressoInteira,
      valorIngressoMeia,
      quantidadeInteira,
      quantidadeMeia,
      temMeia,
      querDoar,
      valorDoacao,
      criadoPor
    } = req.body;

    const novoEvento = new Event({
      nome,
      imagem: req.file.filename,
      categoria,
      descricao,
      rua,
      cidade,
      estado,
      linkMaps,
      dataInicio,
      horaInicio,
      dataFim,
      valorIngressoInteira: valorIngressoInteira ? parseFloat(valorIngressoInteira.replace(',', '.')) : undefined,
      valorIngressoMeia: valorIngressoMeia ? parseFloat(valorIngressoMeia.replace(',', '.')) : undefined,
      quantidadeInteira: quantidadeInteira ? parseInt(quantidadeInteira) : undefined,
      quantidadeMeia: quantidadeMeia ? parseInt(quantidadeMeia) : undefined,
      temMeia: temMeia === 'true',
      querDoar: querDoar === 'true',
      valorDoacao: querDoar === 'true' ? parseFloat(valorDoacao.replace(',', '.')) : 0,
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
