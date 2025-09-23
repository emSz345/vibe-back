const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const { enviarEmailConfirmacaoEvento, enviarEmailRejeicaoEvento } = require('../utils/emailService');

// IMPORTA O MIDDLEWARE CORRETO QUE LÊ COOKIES
const authMiddleware = require('../authMiddleware');

// A FUNÇÃO 'authenticateToken' FOI REMOVIDA.

// Configuração do multer para salvar arquivos na pasta 'uploads'
const uploadPath = path.join(__dirname, '..', 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Rota para listar eventos com status 'aprovado'
router.get('/estados', async (req, res) => {
  try {
    // O método distinct() do Mongoose retorna um array com todos os valores únicos para o campo 'estado'.
    const estados = await Event.distinct('estado', { status: 'aprovado' });
    res.status(200).json(estados);
  } catch (error) {
    console.error("Erro ao buscar lista de estados:", error);
    res.status(500).json({ message: 'Erro ao buscar lista de estados.' });
  }
});

// 2. ROTA '/aprovados' MODIFICADA para aceitar um filtro de estado
router.get('/aprovados', async (req, res) => {
  try {
    const query = { status: 'aprovado' };
    const searchTerm = req.query.search?.trim();

    if (searchTerm) {
      // Divide o termo de busca em palavras individuais
      const searchWords = searchTerm.split(/\s+/).filter(word => word.length > 0);
      
      // Cria um array de regex para cada palavra
      const searchRegexes = searchWords.map(word => new RegExp(word, 'i'));
      
      // Cria condições de busca para cada campo
      const searchConditions = searchRegexes.map(regex => ({
        $or: [
          { nome: { $regex: regex } },
          { cidade: { $regex: regex } },
          { estado: { $regex: regex } },
          { descricao: { $regex: regex } },
          { categoria: { $regex: regex } }
        ]
      }));

      // Adiciona todas as condições com operador $and
      query.$and = searchConditions;
    }

    if (req.query.estado) {
      query.estado = new RegExp(req.query.estado, 'i');
    }

    // Adiciona ordenação por relevância e data
    const eventos = await Event.find(query)
      .sort({ 
        dataInicio: 1, // Eventos mais próximos primeiro
        createdAt: -1  // Eventos mais recentes
      });

    res.status(200).json(eventos);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar eventos aprovados', error: error.message });
  }
});

// Rota para o usuário ver os próprios eventos
router.get('/meus-eventos', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId; // ID do usuário vindo do cookie/token
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

// Rota para deletar um evento
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId; // ID do usuário vindo do cookie/token

    const evento = await Event.findById(id);
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }

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

router.get('/aprovados-carrossel', async (req, res) => {
  try {
    const eventosAprovados = await Event.find({
      status: 'aprovado'
    }).populate('criadoPor', 'nome imagemPerfil');

    res.status(200).json(eventosAprovados);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar eventos aprovados', error: error.message });
  }
});

router.get('/listar/:status', async (req, res) => {
  try {
    const statusDesejado = req.params.status;
    const eventos = await Event.find({ status: statusDesejado });
    res.status(200).json(eventos);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar eventos por status', error: error.message });
  }
});

router.get('/doadores/pendentes', async (req, res) => {
  try {
    const eventosComDoadores = await Event.find({
      'doadores.aprovadoParaCarrossel': false,
      'doadores.0': { $exists: true }
    }).populate('doadores.usuarioId', 'nome imagemPerfil');

    const doadoresPendentes = [];
    eventosComDoadores.forEach(evento => {
      evento.doadores.forEach(doador => {
        if (!doador.aprovadoParaCarrossel) {
          doadoresPendentes.push({
            _id: doador._id,
            eventoId: evento._id,
            nome: doador.nome,
            imagemPerfil: doador.imagemPerfil,
            valorDoacao: doador.valorDoacao,
            dataDoacao: doador.dataDoacao,
            nomeEvento: evento.nome
          });
        }
      });
    });

    res.status(200).json(doadoresPendentes);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar doadores', error: error.message });
  }
});

router.patch('/doadores/:doadorId/aprovar', async (req, res) => {
  try {
    const { doadorId } = req.params;
    const { aprovado } = req.body;

    const evento = await Event.findOne({ 'doadores._id': doadorId });

    if (!evento) {
      return res.status(404).json({ message: 'Doador não encontrado' });
    }

    const doador = evento.doadores.id(doadorId);
    doador.aprovadoParaCarrossel = aprovado;

    await evento.save();

    res.status(200).json({ message: `Doador ${aprovado ? 'aprovado' : 'rejeitado'} com sucesso` });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao processar doador', error: error.message });
  }
});

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

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const evento = await Event.findById(req.params.id).populate('criadoPor', 'nome email imagemPerfil');
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado.' });
    }

    const userId = req.userId; // ID do usuário vindo do cookie/token
    if (evento.criadoPor._id.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado - você não é o dono deste evento' });
    }

    res.status(200).json(evento);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar evento por ID', error: error.message });
  }
});

router.patch('/atualizar-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, motivo } = req.body;

    const evento = await Event.findById(id).populate('criadoPor');
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado.' });
    }

    evento.status = status;
    await evento.save();

    if (status === 'rejeitado' && motivo && motivo.titulo && motivo.descricao) {
      if (!evento.criadoPor) {
        console.warn('Evento não tem criador associado, pulando envio de email:', evento._id);
        return res.status(200).json(evento);
      }
      await enviarEmailRejeicaoEvento(evento.criadoPor, evento, motivo).catch(emailError => {
        console.error("Erro ao enviar email de rejeição:", emailError);
      });
    }
    res.status(200).json(evento);
  } catch (error) {
    console.error('Erro detalhado:', error);
    res.status(500).json({ message: 'Erro ao atualizar o status do evento', error: error.message });
  }
});

router.put('/:id/editar', authMiddleware, upload.single('imagem'), async (req, res) => {
  try {
    const eventoId = req.params.id;
    const userId = req.userId; // ID do usuário vindo do cookie/token

    const eventoExistente = await Event.findById(eventoId);
    if (!eventoExistente) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }
    if (eventoExistente.criadoPor.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

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
      dataFimVendas: req.body.dataFimVendas,
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

    if (req.file) {
      camposAtualizados.imagem = req.file.filename;
    }

    const eventoAtualizado = await Event.findByIdAndUpdate(
      eventoId,
      { $set: camposAtualizados },
      { new: true }
    );

    res.json({ message: 'Evento atualizado e enviado para reanálise', evento: eventoAtualizado });
  } catch (error) {
    console.error('Erro ao atualizar evento:', error);
    res.status(500).json({ message: 'Erro ao editar evento', error: error.message });
  }
});

router.post('/criar', authMiddleware, upload.single('imagem'), async (req, res) => {
  try {
    const criadoPor = req.userId; // ID do usuário vindo do cookie/token, mais seguro!

    const {
      nome, categoria, descricao, cep, rua, bairro, numero, complemento, cidade,
      estado, linkMaps, dataInicio, horaInicio, horaTermino, dataFimVendas,
      dataInicioVendas, valorIngressoInteira, valorIngressoMeia,
      quantidadeInteira, quantidadeMeia, temMeia, querDoar, valorDoacao,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'A imagem do evento é obrigatória.' });
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
      dataFimVendas: dataFimVendas,
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

    if (querDoar === 'true' && parseFloat(valorDoacao.replace(',', '.')) > 0) {
      novoEvento.doadores.push({
        usuarioId: criadoPor,
        imagemPerfil: usuario.imagemPerfil,
        nome: usuario.nome,
        valorDoacao: parseFloat(valorDoacao.replace(',', '.'))
      });
    }

    await novoEvento.save();

    await enviarEmailConfirmacaoEvento(usuario, novoEvento).catch(emailError => {
      console.error("Falha ao enviar e-mail de confirmação de evento, mas o evento foi criado.", emailError);
    });

    res.status(201).json({ message: 'Evento criado com sucesso!', evento: novoEvento });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: `O ID '${error.value}' fornecido para o criador do evento não é válido.`, error: error.message });
    }
    console.error('Erro ao criar evento:', error);
    res.status(500).json({ message: 'Erro ao criar evento', error: error.message });
  }
});

module.exports = router;