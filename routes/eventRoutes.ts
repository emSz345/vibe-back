// routes/eventRoutes.ts

// Importação de módulos e dependências
import { Router, Request, Response, NextFunction } from 'express';
// Importação do mongoose com Types para trabalhar com ObjectId do MongoDB
import mongoose, { Types } from 'mongoose';
// Multer para upload de arquivos
import multer, { StorageEngine } from 'multer';
// Path para manipulação de caminhos de arquivo
import path from 'path';

// Importação dos modelos de dados
import Event, { IEvent } from '../models/Event';
import User, { IUser } from '../models/User';
import Ingresso, { IIngresso } from '../models/ingresso';
import Perfil, { IPerfil } from '../models/Perfil';

// Importação dos serviços de e-mail
import {
  enviarEmailConfirmacaoEvento,
  enviarEmailRejeicaoEvento,
  enviarEmailAprovacaoEvento
} from '../utils/emailService';

// Importação do middleware de autenticação e tipos
import { protect } from '../authMiddleware';
import type { ITokenPayload } from '../authMiddleware'; // Importa apenas o tipo, não o valor

// Criação do router do Express
const router = Router();

// ================================================================
// CONFIGURAÇÃO DO MULTER PARA UPLOAD DE IMAGENS
// ================================================================

// Define o caminho onde as imagens serão salvas (diretório uploads na raiz do projeto)
const uploadPath = path.join(__dirname, '..', 'uploads');

// Configuração do storage do multer para salvar arquivos no disco
const storage: StorageEngine = multer.diskStorage({
  // Define o diretório de destino
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadPath); // Retorna o caminho sem erro
  },
  // Define o nome do arquivo (timestamp + extensão original)
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Nome único baseado no timestamp
  }
});

// Inicializa o multer com a configuração de storage
const upload = multer({ storage });

/**
 * FUNÇÃO escapeRegex - Sanitiza texto para uso em expressões regulares
 * Previne RegExp injection attacks escapando caracteres especiais
 * @param text - Texto a ser sanitizado
 * @returns Texto com caracteres especiais escapados
 */
function escapeRegex(text: string): string {
  // Verifica se o parâmetro é realmente uma string
  if (typeof text !== 'string') {
    return ''; // Retorna string vazia se não for string
  }
  // Escapa caracteres especiais de regex
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * INTERFACE AprovadosQuery - Define a estrutura para queries de eventos aprovados
 * Usada para tipar a query de busca com segurança
 */
interface AprovadosQuery {
  status: 'aprovado'; // Status fixo para eventos aprovados
  $and?: any[]; // Condições adicionais para busca (opcional)
  estado?: RegExp; // Filtro por estado usando regex (opcional)
}

// ================================================================
// ROTAS PÚBLICAS (ACESSÍVEIS SEM AUTENTICAÇÃO)
// ================================================================

/**
 * ROTA GET /estados - Lista todos os estados brasileiros que possuem eventos aprovados
 * Útil para filtros e seleção de localização
 */
router.get('/estados', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Busca valores distintos do campo 'estado' onde status é 'aprovado'
    const estados: string[] = await Event.distinct('estado', { status: 'aprovado' });
    // Retorna array de estados
    res.status(200).json(estados);
  } catch (error) {
    // Passa erro para middleware de tratamento
    next(error);
  }
});

/**
 * ROTA GET /aprovados - Busca eventos aprovados com sistema de filtros
 * Suporta busca por texto e filtro por estado
 */
router.get('/aprovados', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Query base: apenas eventos aprovados
    const query: AprovadosQuery = { status: 'aprovado' };
    
    // Extrai parâmetros de query da URL
    const searchTerm = req.query.search as string | undefined; // Termo de busca textual
    const estadoTerm = req.query.estado as string | undefined; // Filtro por estado

    // Configuração de segurança: tamanho máximo para queries
    const MAX_QUERY_LENGTH = 200;

    // Validação contra queries muito longas (prevenção de DoS)
    if (searchTerm && searchTerm.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ message: 'O termo de busca é muito longo.' });
    }
    if (estadoTerm && estadoTerm.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ message: 'O termo de estado é muito longo.' });
    }

    // Processamento do termo de busca textual
    if (searchTerm) {
      // Divide o termo em palavras individuais e remove espaços vazios
      const searchWords = searchTerm.split(/\s+/).filter(word => word.length > 0);
      
      // Cria condições de busca para cada palavra
      const searchConditions = searchWords.map(word => {
        const sanitizedWord = escapeRegex(word); // Sanitiza cada palavra
        const regex = new RegExp(sanitizedWord, 'i'); // Cria regex case-insensitive
        
        // Busca em múltiplos campos do evento
        return {
          $or: [
            { nome: { $regex: regex } },        // Nome do evento
            { cidade: { $regex: regex } },      // Cidade
            { estado: { $regex: regex } },      // Estado
            { descricao: { $regex: regex } },   // Descrição
            { categoria: { $regex: regex } }    // Categoria
          ]
        };
      });
      
      // Adiciona condições à query se houver termos válidos
      if (searchConditions.length > 0) {
        query.$and = searchConditions;
      }
    }

    // Filtro por estado específico
    if (estadoTerm) {
      const sanitizedEstado = escapeRegex(estadoTerm); // Sanitiza o estado
      query.estado = new RegExp(sanitizedEstado, 'i'); // Cria regex para estado
    }

    // Executa a query no banco de dados
    const eventos: IEvent[] = await Event.find(query)
      .populate('criadoPor', 'nome cpf email') // Popula dados do criador
      .sort({ dataInicio: 1, createdAt: -1 }); // Ordena por data de início (mais antigos primeiro) e criação (mais recentes primeiro)

    // Retorna resultados
    res.status(200).json(eventos);

  } catch (error) {
    next(error); // Tratamento de erro
  }
});

/**
 * ROTA GET /aprovados-carrossel - Eventos aprovados para exibição em carrossel
 * Retorna dados mínimos para otimização de performance
 */
router.get('/aprovados-carrossel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Busca eventos aprovados com informações básicas do criador
    const eventosAprovados: IEvent[] = await Event.find({ status: 'aprovado' })
      .populate('criadoPor', 'nome imagemPerfil'); // Apenas nome e imagem do criador
    
    res.status(200).json(eventosAprovados);
  } catch (error) {
    next(error);
  }
});

/**
 * ROTA GET /publico/:id - Detalhes públicos de um evento específico
 * Acessível sem autenticação, mas apenas para eventos aprovados
 */
router.get('/publico/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Busca evento por ID e popula dados do criador
    const evento: IEvent | null = await Event.findById(req.params.id)
      .populate('criadoPor', 'nome email imagemPerfil');
    
    // Verifica se evento existe e está aprovado
    if (!evento || evento.status !== 'aprovado') {
      return res.status(404).json({ message: 'Evento não encontrado!' });
    }
    
    res.status(200).json(evento);
  } catch (error) {
    next(error);
  }
});

// ================================================================
// ROTAS PROTEGIDAS (REQUEREM AUTENTICAÇÃO JWT)
// ================================================================

/**
 * ROTA GET /meus-eventos - Lista todos os eventos do usuário autenticado
 * Acesso restrito ao próprio usuário
 */
router.get('/meus-eventos', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extrai ID do usuário do token JWT
    const userId = (req.user as ITokenPayload).userId;
    
    // Validação de segurança: verifica se userId existe no token
    if (!userId) {
      return res.status(400).json({ message: 'ID do usuário não encontrado no token' });
    }
    
    // Busca eventos onde o usuário é o criador
    const eventos: IEvent[] = await Event.find({ criadoPor: userId });
    
    res.status(200).json(eventos);
  } catch (error) {
    next(error);
  }
});

/**
 * ROTA GET /:id - Detalhes completos de um evento específico
 * Apenas o criador do evento pode acessar
 */
router.get('/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Busca evento por ID com dados do criador
    const evento: IEvent | null = await Event.findById(req.params.id)
      .populate('criadoPor', 'nome email imagemPerfil');
    
    // Verifica se evento existe
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado.' });
    }

    // Extrai ID do usuário do token
    const userId = (req.user as ITokenPayload).userId;

    // Verificação de propriedade: usuário deve ser o criador do evento
    // Note: criadoPor foi populado, então podemos acessar como IUser
    if ((evento.criadoPor as IUser)._id.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado - você não é o dono deste evento' });
    }

    res.status(200).json(evento);
  } catch (error) {
    next(error);
  }
});

/**
 * ROTA DELETE /:id - Remove um evento do sistema
 * Apenas o criador pode deletar, e apenas se não houver ingressos vendidos
 */
router.delete('/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // ID do evento a ser deletado
    const userId = (req.user as ITokenPayload).userId; // ID do usuário do token

    // Busca evento no banco
    const evento: IEvent | null = await Event.findById(id);
    
    // Verifica se evento existe
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }

    // Verificação de propriedade: usuário deve ser o criador
    if (evento.criadoPor.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    // Verifica se existem ingressos vendidos para este evento
    // Impede exclusão se houver transações financeiras
    const ingressoVendido: IIngresso | null = await Ingresso.findOne({
      eventoId: id,
      status: 'Pago' // Apenas ingressos com pagamento confirmado
    });

    // Se existirem ingressos vendidos, bloqueia a exclusão
    if (ingressoVendido) {
      return res.status(400).json({
        message: 'Este evento não pode ser excluído, pois já possui ingressos vendidos.'
      });
    }

    // Deleta todos os ingressos associados ao evento (caso existam não pagos)
    await Ingresso.deleteMany({ eventoId: id });
    
    // Deleta o evento
    await Event.findByIdAndDelete(id);

    res.status(200).json({ message: 'Evento deletado com sucesso' });

  } catch (error) {
    next(error);
  }
});

/**
 * ROTA PUT /:id/editar - Atualiza informações de um evento existente
 * Após edição, evento volta para status "em_reanalise" para aprovação
 */
router.put('/:id/editar', protect, upload.single('imagem'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventoId = req.params.id; // ID do evento a ser editado
    const userId = (req.user as ITokenPayload).userId; // ID do usuário do token

    // Verifica se evento existe
    const eventoExistente: IEvent | null = await Event.findById(eventoId);
    if (!eventoExistente) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }
    
    // Verifica se usuário é o criador do evento
    if (eventoExistente.criadoPor.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    // ================================================================
    // EXTRAÇÃO E VALIDAÇÃO DOS DADOS DO REQUEST
    // ================================================================

    // Extrai todos os campos do body de uma vez para validação
    const {
      nome, categoria, descricao, cep, rua, bairro, numero, complemento, cidade,
      estado, linkMaps, dataInicio, horaInicio, horaTermino, dataFimVendas,
      dataInicioVendas, valorIngressoInteira, valorIngressoMeia,
      quantidadeInteira, quantidadeMeia, temMeia, querDoar, valorDoacao,
    } = req.body;

    // Configurações de segurança para prevenção de ataques
    const MAX_FIELD_LENGTH = 500; // Limite para campos de texto normais
    const MAX_PRICE_LENGTH = 20;  // Limite para campos monetários
    const MAX_CEP_LENGTH = 15;    // Limite para CEP

    // Validações individuais de cada campo
    if (cep && cep.length > MAX_CEP_LENGTH) {
      return res.status(400).json({ message: "O campo CEP é muito longo." });
    }
    if (valorIngressoInteira && valorIngressoInteira.length > MAX_PRICE_LENGTH) {
      return res.status(400).json({ message: "O campo 'valorIngressoInteira' é muito longo." });
    }
    if (valorIngressoMeia && valorIngressoMeia.length > MAX_PRICE_LENGTH) {
      return res.status(400).json({ message: "O campo 'valorIngressoMeia' é muito longo." });
    }
    if (valorDoacao && valorDoacao.length > MAX_PRICE_LENGTH) {
      return res.status(400).json({ message: "O campo 'valorDoacao' é muito longo." });
    }
    if (nome && nome.length > MAX_FIELD_LENGTH) {
      return res.status(400).json({ message: "O campo 'nome' é muito longo." });
    }

    // ================================================================
    // PREPARAÇÃO DOS CAMPOS ATUALIZADOS COM SANITIZAÇÃO
    // ================================================================

    const camposAtualizados: any = {
      nome,
      categoria,
      descricao,
      cep: cep ? cep.replace(/\D/g, '') : '', // Remove não-numéricos do CEP
      rua,
      bairro,
      numero,
      complemento: complemento || '', // Garante que complemento seja string
      cidade,
      estado,
      linkMaps,
      dataInicio,
      horaInicio,
      horaTermino,
      dataFimVendas,
      dataInicioVendas,
      // Converte valores monetários de string para float
      valorIngressoInteira: valorIngressoInteira ? parseFloat(valorIngressoInteira.replace(',', '.')) : 0,
      valorIngressoMeia: valorIngressoMeia ? parseFloat(valorIngressoMeia.replace(',', '.')) : 0,
      // Converte quantidades para inteiro
      quantidadeInteira: quantidadeInteira ? parseInt(quantidadeInteira) : 0,
      quantidadeMeia: quantidadeMeia ? parseInt(quantidadeMeia) : 0,
      temMeia: temMeia,
      querDoar: querDoar === 'true', // Converte string para boolean
      // Converte valor de doação se aplicável
      valorDoacao: querDoar === 'true' ? parseFloat(valorDoacao.replace(',', '.')) : 0,
      status: 'em_reanalise' // Muda status para reanálise após edição
    };

    // Se uma nova imagem foi enviada, atualiza o campo
    if (req.file) {
      camposAtualizados.imagem = req.file.filename;
    }

    // Atualiza o evento no banco de dados
    const eventoAtualizado: IEvent | null = await Event.findByIdAndUpdate(
      eventoId,
      { $set: camposAtualizados }, // Apenas os campos fornecidos
      { new: true } // Retorna o documento atualizado
    );

    res.json({ 
      message: 'Evento atualizado e enviado para reanálise', 
      evento: eventoAtualizado 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ROTA POST /criar - Cria um novo evento na plataforma
 * Requer autenticação e conta do Mercado Pago vinculada
 */
router.post('/criar', protect, upload.single('imagem'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extrai informações do usuário do token JWT
    const user = (req.user as ITokenPayload);
    
    // Impede que administradores criem eventos (apenas usuários normais)
    if (user.role === 'SUPER_ADMIN' || user.role === 'MANAGER_SITE') {
      return res.status(403).json({ message: 'Administradores não podem criar eventos.' });
    }

    const criadoPor = user.userId; // ID do usuário criador

    // Verifica se usuário tem conta do Mercado Pago vinculada
    const perfilUsuario: IPerfil | null = await Perfil.findOne({ userId: criadoPor });
    if (!perfilUsuario || !perfilUsuario.mercadoPagoAccountId) {
      return res.status(403).json({
        message: 'Ação bloqueada. É necessário vincular sua conta do Mercado Pago.'
      });
    }

    // Validação: imagem é obrigatória para criação de evento
    if (!req.file) {
      return res.status(400).json({ message: 'A imagem do evento é obrigatória.' });
    }

    // Busca dados completos do usuário criador
    const usuario: IUser | null = await User.findById(criadoPor);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuário criador não encontrado.' });
    }

    // Extrai todos os campos do formulário
    const {
      nome, categoria, descricao, cep, rua, bairro, numero, complemento, cidade,
      estado, linkMaps, dataInicio, horaInicio, horaTermino, dataFimVendas,
      dataInicioVendas, valorIngressoInteira, valorIngressoMeia,
      quantidadeInteira, quantidadeMeia, temMeia, querDoar, valorDoacao,
    } = req.body;

    // Configurações de segurança
    const MAX_FIELD_LENGTH = 500;
    const MAX_PRICE_LENGTH = 20;
    const MAX_CEP_LENGTH = 15;

    // Validações de segurança para cada campo
    if (cep && cep.length > MAX_CEP_LENGTH) {
      return res.status(400).json({ message: "O campo CEP é muito longo." });
    }
    if (valorIngressoInteira && valorIngressoInteira.length > MAX_PRICE_LENGTH) {
      return res.status(400).json({ message: "O campo 'valorIngressoInteira' é muito longo." });
    }
    if (valorIngressoMeia && valorIngressoMeia.length > MAX_PRICE_LENGTH) {
      return res.status(400).json({ message: "O campo 'valorIngressoMeia' é muito longo." });
    }
    if (valorDoacao && valorDoacao.length > MAX_PRICE_LENGTH) {
      return res.status(400).json({ message: "O campo 'valorDoacao' é muito longo." });
    }
    if (nome && nome.length > MAX_FIELD_LENGTH) {
      return res.status(400).json({ message: "O campo 'nome' é muito longo." });
    }

    // ================================================================
    // CRIAÇÃO DO NOVO EVENTO
    // ================================================================

    const novoEvento = new Event({
      nome,
      imagem: req.file.filename, // Nome do arquivo salvo pelo multer
      categoria,
      descricao,
      cep: cep.replace(/\D/g, ''), // Sanitiza CEP
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
      // Converte e sanitiza valores monetários
      valorIngressoInteira: valorIngressoInteira ? parseFloat(valorIngressoInteira.replace(',', '.')) : 0,
      valorIngressoMeia: valorIngressoMeia ? parseFloat(valorIngressoMeia.replace(',', '.')) : 0,
      // Converte quantidades para inteiro
      quantidadeInteira: quantidadeInteira ? parseInt(quantidadeInteira) : 0,
      quantidadeMeia: quantidadeMeia ? parseInt(quantidadeMeia) : 0,
      temMeia: temMeia,
      querDoar: querDoar === 'true', // Converte string para boolean
      valorDoacao: querDoar === 'true' ? parseFloat(valorDoacao.replace(',', '.')) : 0,
      criadoPor // Referência ao usuário criador
    });

    // Se o usuário optou por doação, adiciona como primeiro doador
    if (querDoar === 'true' && parseFloat(valorDoacao.replace(',', '.')) > 0) {
      novoEvento.doadores.push({
        // Converte string ID para ObjectId do MongoDB
        usuarioId: new Types.ObjectId(criadoPor),
        imagemPerfil: usuario.imagemPerfil, // Imagem do perfil do usuário
        nome: usuario.nome, // Nome do usuário
        valorDoacao: parseFloat(valorDoacao.replace(',', '.')) // Valor da doação
      });
    }

    // Salva o novo evento no banco de dados
    await novoEvento.save();

    // Envia e-mail de confirmação de forma não-bloqueante
    await enviarEmailConfirmacaoEvento(usuario, novoEvento).catch(emailError => {
      // Log do erro sem interromper o fluxo
      console.error("Falha ao enviar e-mail de confirmação.", emailError);
    });

    // Retorna sucesso com dados do evento criado
    res.status(201).json({ 
      message: 'Evento criado com sucesso!', 
      evento: novoEvento 
    });
  } catch (error: any) {
    // Tratamento específico para erros de cast (IDs inválidos)
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: `O ID '${error.value}' fornecido não é válido.`, 
        error: error.message 
      });
    }
    // Outros erros passam para o middleware de tratamento
    next(error);
  }
});

// ================================================================
// ROTAS ADMINISTRATIVAS (GERALMENTE ACESSADAS POR ADMINS)
// ================================================================

/**
 * ROTA GET /listar/:status - Lista eventos por status para administração
 * Usada pelo painel admin para revisão de eventos
 */
router.get('/listar/:status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.params; // Status dos eventos a listar

    // Busca eventos com o status especificado
    const eventos: any[] = await Event.find({ status: status })
      .populate('criadoPor', 'nome email') // Dados básicos do criador
      .sort({ createdAt: -1 }) // Ordena por criação (mais recentes primeiro)
      .lean(); // Retorna objetos JavaScript simples (mais performance)

    // Retorna array vazio se não encontrar eventos
    if (!eventos || eventos.length === 0) {
      return res.status(200).json([]);
    }

    // Extrai IDs únicos dos criadores para busca de perfis
    const criadorIds = [...new Set(eventos.map(e => e.criadoPor?._id).filter(id => id))];
    
    // Se não há criadores, retorna eventos sem dados adicionais
    if (criadorIds.length === 0) {
      return res.status(200).json(eventos);
    }

    // Busca perfis dos criadores para dados fiscais (CPF/CNPJ)
    const perfis: IPerfil[] = await Perfil.find({ userId: { $in: criadorIds } })
      .select('userId dadosPessoais.cpf dadosPessoais.cnpj tipoPessoa');

    // Cria mapa para acesso rápido aos perfis pelos IDs de usuário
    const perfilMap = new Map<string, IPerfil>();
    perfis.forEach(p => perfilMap.set(p.userId.toString(), p));

    // Enriquece os eventos com dados fiscais dos criadores
    const eventosComDadosCriador = eventos.map(evento => {
      if (evento.criadoPor && evento.criadoPor._id) {
        const perfilCriador = perfilMap.get(evento.criadoPor._id.toString());
        if (perfilCriador) {
          // Adiciona dados fiscais ao objeto do criador
          evento.criadoPor.cpf = perfilCriador.dadosPessoais?.cpf;
          evento.criadoPor.cnpj = perfilCriador.dadosPessoais?.cnpj;
          evento.criadoPor.tipoPessoa = perfilCriador.tipoPessoa;
        }
      }
      return evento;
    });

    res.status(200).json(eventosComDadosCriador);

  } catch (error) {
    next(error);
  }
});

/**
 * ROTA PATCH /atualizar-status/:id - Atualiza status de aprovação de evento
 * Usada por administradores para aprovar/rejeitar eventos
 */
router.patch('/atualizar-status/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // ID do evento
    const { status, motivo } = req.body as { 
      status: IEvent['status'], 
      motivo?: { titulo: string, descricao: string } 
    };

    // Busca evento e popula dados do criador
    const evento: IEvent | null = await Event.findById(id).populate('criadoPor');
    
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado.' });
    }

    // Guarda status anterior para verificar mudanças
    const statusAntigo = evento.status;
    
    // Atualiza status
    evento.status = status;
    await evento.save();

    const criador = evento.criadoPor; // Criador do evento (pode ser ObjectId ou IUser)

    // Verifica se o criador foi populado corretamente
    if (!criador || typeof (criador as IUser)._id === 'undefined') {
      console.warn('Evento sem criador populado, pulando e-mail:', evento._id);
      return res.status(200).json(evento);
    }

    // Lógica de envio de e-mails baseada na mudança de status
    if (status === 'rejeitado' && statusAntigo !== 'rejeitado' && motivo) {
      // Envia e-mail de rejeição com motivo
      await enviarEmailRejeicaoEvento(criador as IUser, evento, motivo)
        .catch(err => console.error('Erro ao enviar e-mail de rejeição:', err));
    } else if (status === 'aprovado' && statusAntigo !== 'aprovado') {
      // Envia e-mail de aprovação
      await enviarEmailAprovacaoEvento(criador as IUser, evento)
        .catch(err => console.error('Erro ao enviar e-mail de aprovação:', err));
    }

    res.status(200).json(evento);

  } catch (error) {
    next(error);
  }
});

// Exporta o router configurado
export default router;