const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const User = require('../models/User'); // Importa o modelo de Usuário
const multer = require('multer');
const path = require('path');
const { enviarEmailConfirmacaoEvento } = require('../utils/emailService'); // Importa a função específica

// Caminho absoluto para uploads
const uploadPath = path.join(__dirname, '..', 'uploads');

// Configuração do multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });


// 1. Rota para listar eventos por status (NOVA ROTA)
// Esta rota é a que o seu front-end está chamando para filtrar.
router.get('/listar/:status', async (req, res) => {
  try {
    const statusDesejado = req.params.status;
    const eventos = await Event.find({ status: statusDesejado });
    res.status(200).json(eventos);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar eventos por status', error: error.message });
  }
});

// A rota original '/listar' foi substituída pela rota com filtro,
// pois o seu front-end não a utiliza mais.

// 2. Rota para atualizar o status do evento (NOVA ROTA)
// Esta rota é a que o seu front-end chama quando um evento é aceito, rejeitado ou enviado para reanálise.
router.patch('/atualizar-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const eventoAtualizado = await Event.findByIdAndUpdate(
      id,
      { status: status },
      { new: true } // Retorna o documento atualizado
    );

    if (!eventoAtualizado) {
      return res.status(404).json({ message: 'Evento não encontrado.' });
    }

    res.status(200).json(eventoAtualizado);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar o status do evento', error: error.message });
  }
});

// Rota para criação de evento com imagem (mantida)
router.post('/criar', upload.single('imagem'), async (req, res) => {
  try {
    const {
      nome,
      categoria,
      descricao,
      cep,
      rua,
      bairro,
      numero,
      complemento,
      cidade,
      estado,
      linkMaps,
      dataInicio,
      horaInicio,
      horaTermino,
      dataFimVendas,
      dataInicioVendas,
      valorIngressoInteira,
      valorIngressoMeia,
      quantidadeInteira,
      quantidadeMeia,
      temMeia,
      querDoar,
      valorDoacao,
      criadoPor
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'A imagem do evento é obrigatória.' });
    }

    if (!criadoPor || criadoPor === 'null') {
      return res.status(400).json({ message: 'O ID do criador do evento é obrigatório. Faça o login para continuar.' });
    }

    const usuario = await User.findById(criadoPor);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuário criador do evento não encontrado.' });
    }

    const novoEvento = new Event({
      nome,
      imagem: req.file.filename,
      categoria,
      descricao,
      cep: cep.replace(/\D/g, ''),
      rua,
      bairro,
      numero,
      complemento: complemento || '',
      cidade,
      estado,
      linkMaps,
      dataInicio,
      horaInicio,
      horaTermino,
      dataFim: dataFimVendas,
      dataInicioVendas,
      valorIngressoInteira: valorIngressoInteira ? parseFloat(valorIngressoInteira.replace(',', '.')) : 0,
      valorIngressoMeia: valorIngressoMeia ? parseFloat(valorIngressoMeia.replace(',', '.')) : 0,
      quantidadeInteira: quantidadeInteira ? parseInt(quantidadeInteira) : 0,
      quantidadeMeia: quantidadeMeia ? parseInt(quantidadeMeia) : 0,
      temMeia: temMeia === 'true',
      querDoar: querDoar === 'true',
      valorDoacao: querDoar === 'true' ? parseFloat(valorDoacao.replace(',', '.')) : 0,
      criadoPor
    });

    await novoEvento.save();

    try {
      await enviarEmailConfirmacaoEvento(usuario, novoEvento);
    } catch (emailError) {
      console.error("Falha ao enviar e-mail de confirmação de evento, mas o evento foi criado.", emailError);
    }

    res.status(201).json({
      message: 'Evento criado com sucesso!',
      evento: novoEvento
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: `O ID '${error.value}' fornecido para o criador do evento não é válido.`, error: error.message });
    }
    console.error('Erro ao criar evento:', error);
    res.status(500).json({ message: 'Erro ao criar evento', error: error.message });
  }
});

module.exports = router;