const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const User = require('../models/User');
const Ingresso = require('../models/ingresso');
const multer = require('multer');
const path = require('path');
const { enviarEmailConfirmacaoEvento, enviarEmailRejeicaoEvento, enviarEmailAprovacaoEvento } = require('../utils/emailService');
const Perfil = require('../models/Perfil');

// IMPORTA O MIDDLEWARE CORRETO QUE LÊ COOKIES
const { protect } = require('../authMiddleware');

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
// segurança 

// Função para escapar caracteres especiais de RegExp
function escapeRegex(text) {
  if (typeof text !== 'string') {
    return '';
  }
  // Escapa caracteres que têm significado especial em expressões regulares
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// 2. ROTA '/aprovados' MODIFICADA para aceitar um filtro de estado
router.get('/aprovados', async (req, res) => {
  try {
    const query = { status: 'aprovado' };
    const searchTerm = req.query.search?.trim();
    const estadoTerm = req.query.estado?.trim();

    // --- CAMADA 1: VALIDAÇÃO DE TAMANHO ---
    // Proteção direta contra o erro de "dump de memória".
    // Rejeita qualquer termo de busca que seja excessivamente longo.
    const MAX_QUERY_LENGTH = 200; // Limite de 200 caracteres (ajuste se necessário)

    if (searchTerm && searchTerm.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ message: 'O termo de busca é muito longo.' });
    }
    if (estadoTerm && estadoTerm.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ message: 'O termo de estado é muito longo.' });
    }

    // --- LÓGICA DE BUSCA COM PROTEÇÃO ---
    if (searchTerm) {
      const searchWords = searchTerm.split(/\s+/).filter(word => word.length > 0);

      const searchConditions = searchWords.map(word => {
        // --- CAMADA 2: SANITIZAÇÃO DA REGEXP ---
        // Escapa o input do usuário ANTES de criar a RegExp.
        const sanitizedWord = escapeRegex(word);
        const regex = new RegExp(sanitizedWord, 'i'); // 'i' para case-insensitive

        return {
          $or: [
            { nome: { $regex: regex } },
            { cidade: { $regex: regex } },
            { estado: { $regex: regex } },
            { descricao: { $regex: regex } },
            { categoria: { $regex: regex } }
          ]
        };
      });

      // Combina as condições: o evento deve conter TODAS as palavras buscadas
      if (searchConditions.length > 0) {
        query.$and = searchConditions;
      }
    }

    if (estadoTerm) {
      // Aplica a mesma sanitização para o filtro de estado
      const sanitizedEstado = escapeRegex(estadoTerm);
      query.estado = new RegExp(sanitizedEstado, 'i');
    }

    const eventos = await Event.find(query)
      .populate('criadoPor', 'nome cpf email') // 🔥 ADICIONADO: Popula 'criadoPor' selecionando apenas nome, cpf e email
      .sort({
        dataInicio: 1,
        createdAt: -1
      });

    res.status(200).json(eventos);

  } catch (error) {
    // Loga o erro real no console para depuração
    console.error('Erro na rota /aprovados:', error);

    // Envia uma resposta genérica para o cliente
    res.status(500).json({ message: 'Ocorreu um erro interno ao buscar os eventos.' });
  }
});

// Rota para o usuário ver os próprios eventos
router.get('/meus-eventos', protect, async (req, res) => {
  try {
    const userId = req.user.userId; // ID do usuário vindo do cookie/token
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
router.delete('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId; // ID do usuário vindo do cookie/token

    const evento = await Event.findById(id);
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }

    if (evento.criadoPor.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado - você não é o dono deste evento' });
    }

    // ==========================================================
    // 🔥 INÍCIO DA NOVA VERIFICAÇÃO DE INGRESSOS
    // ==========================================================

    // 1. Procura se existe PELO MENOS UM ingresso 'Pago' para este evento
    const ingressoVendido = await Ingresso.findOne({
      eventoId: id,
      status: 'Pago'
    });

    // 2. Se encontrar um, bloqueia a exclusão
    if (ingressoVendido) {
      return res.status(400).json({
        message: 'Este evento não pode ser excluído, pois já possui ingressos vendidos.'
      });
    }

    // 3. (Opcional, mas recomendado) Se não há ingressos PAGOS,
    //    limpa os ingressos 'Pendentes', 'Recusados', etc., do banco.
    await Ingresso.deleteMany({ eventoId: id });

    // ==========================================================
    // 🔥 FIM DA NOVA VERIFICAÇÃO
    // ==========================================================

    // 4. Agora, deleta o evento com segurança
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

    // 1. Busca eventos e popula o básico do criador (nome, email)
    // Usamos .lean() para obter objetos JS puros, facilitando a modificação
    const eventos = await Event.find({ status: statusDesejado })
      .populate('criadoPor', 'nome email') // Popula SÓ nome e email do User
      .sort({ createdAt: -1 })
      .lean();

    // Se não encontrou eventos, retorna array vazio
    if (!eventos || eventos.length === 0) {
      return res.status(200).json([]);
    }

    // 2. Coleta os IDs únicos dos criadores dos eventos encontrados
    // Usamos ?. para segurança caso criadoPor seja null/undefined por algum erro
    const criadorIds = [...new Set(eventos.map(e => e.criadoPor?._id).filter(id => id))];

    // Se não houver IDs de criadores (improvável, mas seguro verificar)
    if (criadorIds.length === 0) {
      return res.status(200).json(eventos); // Retorna eventos sem dados do perfil
    }

    // 3. Busca os Perfis correspondentes a esses IDs de usuário
    const perfis = await Perfil.find({ userId: { $in: criadorIds } })
      .select('userId dadosPessoais.cpf dadosPessoais.cnpj tipoPessoa') // Seleciona só o que precisamos do Perfil
      .lean();

    // 4. Cria um mapa (dicionário) para acesso rápido aos dados do perfil pelo userId
    // Chave: ID do usuário (string), Valor: objeto do perfil encontrado
    const perfilMap = new Map();
    perfis.forEach(p => perfilMap.set(p.userId.toString(), p));

    // 5. Junta os dados do perfil aos dados do evento
    // Itera sobre cada evento encontrado
    const eventosComDadosCriador = eventos.map(evento => {
      // Verifica se o evento tem um criador e se o ID existe
      if (evento.criadoPor && evento.criadoPor._id) {
        // Busca o perfil correspondente no mapa que criamos
        const perfilCriador = perfilMap.get(evento.criadoPor._id.toString());

        // Se encontrou um perfil para este criador...
        if (perfilCriador) {
          // Adiciona os campos do perfil diretamente ao objeto 'criadoPor' do evento
          evento.criadoPor.cpf = perfilCriador.dadosPessoais?.cpf;
          evento.criadoPor.cnpj = perfilCriador.dadosPessoais?.cnpj;
          evento.criadoPor.tipoPessoa = perfilCriador.tipoPessoa;
        }
      }
      // Retorna o objeto do evento modificado (ou original se não achou perfil)
      return evento;
    });

    // 6. Envia a lista de eventos com os dados do criador mesclados
    res.status(200).json(eventosComDadosCriador);

  } catch (error) {
    console.error(`Erro ao buscar eventos com status '${req.params.status}':`, error);
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

router.get('/:id', protect, async (req, res) => {
  try {
    const evento = await Event.findById(req.params.id).populate('criadoPor', 'nome email imagemPerfil');
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado.' });
    }

    const userId = req.user.userId; // ID do usuário vindo do cookie/token
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

    // 1. Busca o evento E o criador (seu populate está perfeito)
    const evento = await Event.findById(id).populate('criadoPor');
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado.' });
    }

    // 2. 🔥 Captura o status antigo ANTES de salvar
    const statusAntigo = evento.status;

    // 3. Atualiza e salva o evento
    evento.status = status;
    await evento.save();

    // 4. Verifica se o criador existe
    if (!evento.criadoPor) {
      console.warn('Evento não tem criador associado, pulando envio de email:', evento._id);
      return res.status(200).json(evento); // Sucesso, mas sem e-mail
    }

    // 5. 🔥 LÓGICA DE E-MAIL ATUALIZADA

    // Envia e-mail de REJEIÇÃO (se o status mudou para 'rejeitado')
    if (status === 'rejeitado' && statusAntigo !== 'rejeitado' && motivo && motivo.titulo && motivo.descricao) {

      await enviarEmailRejeicaoEvento(evento.criadoPor, evento, motivo).catch(emailError => {
        console.error("Erro ao enviar email de rejeição:", emailError);
        // Não impede a resposta de sucesso se o e-mail falhar
      });

    }
    // 🔥 BLOCO ADICIONADO: Envia e-mail de APROVAÇÃO (se o status mudou para 'aprovado')
    else if (status === 'aprovado' && statusAntigo !== 'aprovado') {

      await enviarEmailAprovacaoEvento(evento.criadoPor, evento).catch(emailError => {
        console.error("Erro ao enviar email de aprovação:", emailError);
        // Não impede a resposta de sucesso se o e-mail falhar
      });

    }

    // 6. Responde com sucesso
    res.status(200).json(evento);

  } catch (error) {
    console.error('Erro detalhado:', error);
    res.status(500).json({ message: 'Erro ao atualizar o status do evento', error: error.message });
  }
});

router.put('/:id/editar', protect, upload.single('imagem'), async (req, res) => {
  try {
    const eventoId = req.params.id;
    const userId = req.user.userId; // ID do usuário vindo do cookie/token

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

router.post('/criar', protect, upload.single('imagem'), async (req, res) => {
  try {
    // Verificação 1: Garante que administradores não podem criar eventos
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'MANAGER_SITE') {
      return res.status(403).json({ message: 'Administradores não podem criar eventos.' });
    }

    const criadoPor = req.user.userId;

    // 🔥 VERIFICAÇÃO 2: Trava de segurança para a conta do Mercado Pago
    // Busca o perfil do usuário que está tentando criar o evento
    const perfilUsuario = await Perfil.findOne({ userId: criadoPor });

    // Se não houver perfil ou se o ID da conta do MP não estiver salvo, bloqueia a ação.
    if (!perfilUsuario || !perfilUsuario.mercadoPagoAccountId) {
      return res.status(403).json({
        message: 'Ação bloqueada. É necessário vincular sua conta do Mercado Pago em "Meu Perfil" antes de criar um evento.'
      });
    }

    // Se passou na verificação, o resto da lógica continua normalmente...
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