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
      // --- Novos campos de endereço recebidos do frontend ---
      cep,
      rua,
      bairro,
      numero,
      complemento,
      // --- Fim dos novos campos de endereço ---
      cidade,
      estado,
      linkMaps,
      dataInicio,
      horaInicio,
      horaTermino,
      dataFimVendas, // Renomeado de dataFim para consistência com o frontend
      dataInicioVendas, // Adicionado dataInicioVendas
      valorIngressoInteira,
      valorIngressoMeia,
      quantidadeInteira,
      quantidadeMeia,
      temMeia,
      querDoar,
      valorDoacao,
      criadoPor
    } = req.body;

    // Verifica se há um arquivo de imagem e se ele está presente
    if (!req.file) {
      return res.status(400).json({ message: 'A imagem do evento é obrigatória.' });
    }

    const novoEvento = new Event({
      nome,
      imagem: req.file.filename,
      categoria,
      descricao,
      // --- Atribuindo os novos campos de endereço ao modelo ---
      cep: cep.replace(/\D/g, ''), // Garante que o CEP seja salvo sem o hífen
      rua,
      bairro,
      numero,
      complemento: complemento || '', // Garante que o complemento seja uma string vazia se não for fornecido
      // --- Fim da atribuição dos novos campos ---
      cidade,
      estado,
      linkMaps,
      dataInicio,
      horaInicio,
      horaTermino,
      dataFim: dataFimVendas, // Mapeando para o campo dataFim existente no modelo
      dataInicioVendas, // Salvando a data de início das vendas
      valorIngressoInteira: valorIngressoInteira ? parseFloat(valorIngressoInteira.replace(',', '.')) : 0, // Definindo default 0 para valores numéricos, se não forem undefined
      valorIngressoMeia: valorIngressoMeia ? parseFloat(valorIngressoMeia.replace(',', '.')) : 0,
      quantidadeInteira: quantidadeInteira ? parseInt(quantidadeInteira) : 0,
      quantidadeMeia: quantidadeMeia ? parseInt(quantidadeMeia) : 0,
      temMeia: temMeia === 'true', // Converte a string 'true'/'false' para booleano
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
