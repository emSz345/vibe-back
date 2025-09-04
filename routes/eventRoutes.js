const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const { enviarEmailConfirmacaoEvento, enviarEmailRejeicaoEvento } = require('../utils/emailService');



const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token de acesso necessário' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido' });
    }

    if (!decoded.userId && !decoded.id) {
      return res.status(403).json({ message: 'Estrutura do token inválida' });
    }

    // CORREÇÃO TEMPORÁRIA: Use decoded.id se userId não existir
    req.user = {
      userId: decoded.userId
    };

    next();
  });
};

// Configuração do multer para salvar arquivos na pasta 'uploads'
const uploadPath = path.join(__dirname, '..', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Rota para listar eventos com status 'aprovado'
// Esta rota corresponde à chamada do seu frontend: /api/eventos/aprovados
router.get('/aprovados', async (req, res) => {
  try {
    const eventos = await Event.find({ status: 'aprovado' });
    res.status(200).json(eventos);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar eventos aprovados', error: error.message });
  }
});


router.get('/meus-eventos', authenticateToken, async (req, res) => {
  try {
    // O userId agora vem do token JWT decodificado
    const userId = req.user.userId;

    if (!userId) {
      return res.status(400).json({ message: 'ID do usuário não encontrado no token' });
    }

    const eventos = await Event.find({ criadoPor: userId });
    res.status(200).json(eventos);
  } catch (error) {
    console.error('Erro ao buscar eventos:', error);
    res.status(500).json({ message: 'Erro ao buscar eventos do usuário', error: error.message });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Verifique se o evento existe
    const evento = await Event.findById(id);
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }

    // Verifique se o usuário é o dono do evento
    if (evento.criadoPor.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado - você não é o dono deste evento' });
    }

    await Event.findByIdAndDelete(id);
    res.status(200).json({ message: 'Evento deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar evento:', error);
    res.status(500).json({ message: 'Erro ao deletar evento', error: error.message });
  }
});




// Rota para listar eventos por status (mantida para flexibilidade)
router.get('/listar/:status', async (req, res) => {
  try {
    const statusDesejado = req.params.status;
    const eventos = await Event.find({ status: statusDesejado });
    res.status(200).json(eventos);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar eventos por status', error: error.message });
  }
});


// Rota pública para visualizar um evento (sem exigir token)
router.get('/publico/:id', async (req, res) => {
   try {
    const evento = await Event.findById(req.params.id).populate('criadoPor', 'nome email imagemPerfil');
    if (!evento || evento.status !== 'aprovado') {
      return res.status(404).json({ message: 'Evento não encontrado!' });
    }
    res.status(200).json(evento);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar evento', error: error.message });
  }
});


router.get('/:id', authenticateToken, async (req, res) => {
   try {
    const evento = await Event.findById(req.params.id).populate('criadoPor', 'nome email imagemPerfil');
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado.' });
    }

    // Verificar se o usuário é o dono do evento
    const userId = req.user.userId;
    if (evento.criadoPor.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado - você não é o dono deste evento' });
    }

    res.status(200).json(evento);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar evento por ID', error: error.message });
  }
});

// Rota para atualização de status do evento
router.patch('/atualizar-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, motivo } = req.body;

    console.log('Recebido:', { id, status, motivo });

    const evento = await Event.findById(id).populate('criadoPor');

    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado.' });
    }

    evento.status = status;
    await evento.save();

    // Se for rejeição e houver motivo, envia email
    if (status === 'rejeitado' && motivo && motivo.titulo && motivo.descricao) {
      try {
        // ✅ VERIFICAÇÃO ADICIONAL: Checar se criadoPor existe
        if (!evento.criadoPor) {
          console.warn('Evento não tem criador associado, pulando envio de email:', evento._id);
          return res.status(200).json(evento);
        }

        await enviarEmailRejeicaoEvento(evento.criadoPor, evento, motivo);
        console.log('Email de rejeição enviado para:', evento.criadoPor.email);
      } catch (emailError) {
        console.error("Erro ao enviar email de rejeição:", emailError);
        // Não falha a operação principal por erro de email
      }
    }

    res.status(200).json(evento);
  } catch (error) {
    console.error('Erro detalhado:', error);
    res.status(500).json({ message: 'Erro ao atualizar o status do evento', error: error.message });
  }
});


// No arquivo de rotas de eventos (eventos.js)
// Substitua as duas rotas /editar por esta única rota correta:
router.put('/:id/editar', authenticateToken, upload.single('imagem'), async (req, res) => {
  try {
    const eventoId = req.params.id;
    const userId = req.user.userId; // Use userId do token

    // Verificar se o evento existe e pertence ao usuário
    const eventoExistente = await Event.findById(eventoId);

    if (!eventoExistente) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }

    if (eventoExistente.criadoPor.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    // Preparar campos para atualização
    const camposAtualizados = {
      nome: req.body.nome,
      categoria: req.body.categoria,
      descricao: req.body.descricao,
      cep: req.body.cep,
      rua: req.body.rua,
      bairro: req.body.bairro,
      numero: req.body.numero,
      complemento: req.body.complemento,
      cidade: req.body.cidade,
      estado: req.body.estado,
      linkMaps: req.body.linkMaps,
      dataInicio: req.body.dataInicio,
      horaInicio: req.body.horaInicio,
      horaTermino: req.body.horaTermino,
      dataFimVendas: req.body.dataFimVendas, // Corrigir mapeamento
      dataInicioVendas: req.body.dataInicioVendas,
      valorIngressoInteira: parseFloat(req.body.valorIngressoInteira),
      valorIngressoMeia: parseFloat(req.body.valorIngressoMeia),
      quantidadeInteira: parseInt(req.body.quantidadeInteira),
      quantidadeMeia: parseInt(req.body.quantidadeMeia),
      temMeia: req.body.temMeia,
      querDoar: req.body.querDoar === 'true',
      valorDoacao: parseFloat(req.body.valorDoacao),
      status: 'em_reanalise'
    };

    // Se uma nova imagem foi enviada
    if (req.file) {
      camposAtualizados.imagem = req.file.filename;
    }

    const eventoAtualizado = await Event.findByIdAndUpdate(
      eventoId,
      { $set: camposAtualizados },
      { new: true }
    );

    res.json({
      message: 'Evento atualizado e enviado para reanálise',
      evento: eventoAtualizado
    });
  } catch (error) {
    console.error('Erro ao atualizar evento:', error);
    res.status(500).json({ message: 'Erro ao editar evento', error: error.message });
  }
});


// Rota para criação de evento com imagem
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
      dataFimVendas: dataFimVendas, // ← CORRIGIDO: use o mesmo nome do schema
      dataInicioVendas,
      valorIngressoInteira: valorIngressoInteira ? parseFloat(valorIngressoInteira.replace(',', '.')) : 0,
      valorIngressoMeia: valorIngressoMeia ? parseFloat(valorIngressoMeia.replace(',', '.')) : 0,
      quantidadeInteira: quantidadeInteira ? parseInt(quantidadeInteira) : 0,
      quantidadeMeia: quantidadeMeia ? parseInt(quantidadeMeia) : 0,
      temMeia: temMeia,
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