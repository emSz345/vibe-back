// routes/eventRoutes.ts

import { Router, Request, Response, NextFunction } from 'express';
// ADICIONE 'Types' à importação do mongoose
import mongoose, { Types } from 'mongoose';
import multer, { StorageEngine } from 'multer';
import path from 'path';
import Event, { IEvent } from '../models/Event';
import User, { IUser } from '../models/User';
import Ingresso, { IIngresso } from '../models/ingresso';
import Perfil, { IPerfil } from '../models/Perfil';
import {
  enviarEmailConfirmacaoEvento,
  enviarEmailRejeicaoEvento,
  enviarEmailAprovacaoEvento
} from '../utils/emailService';
import { protect } from '../authMiddleware';
import type { ITokenPayload } from '../authMiddleware'; // Importa o TIPO

const router = Router();

// ... (Configuração do Multer e escapeRegex - sem mudanças) ...
const uploadPath = path.join(__dirname, '..', 'uploads');
const storage: StorageEngine = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadPath);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });
function escapeRegex(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}
interface AprovadosQuery {
  status: 'aprovado';
  $and?: any[];
  estado?: RegExp;
}

// Rota para listar estados
router.get('/estados', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const estados: string[] = await Event.distinct('estado', { status: 'aprovado' });
    res.status(200).json(estados);
  } catch (error) {
    next(error);
  }
});

// Rota de busca /aprovados (com segurança)
router.get('/aprovados', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query: AprovadosQuery = { status: 'aprovado' };
    const searchTerm = req.query.search as string | undefined;
    const estadoTerm = req.query.estado as string | undefined;

    const MAX_QUERY_LENGTH = 200;

    if (searchTerm && searchTerm.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ message: 'O termo de busca é muito longo.' });
    }
    if (estadoTerm && estadoTerm.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ message: 'O termo de estado é muito longo.' });
    }

    if (searchTerm) {
      const searchWords = searchTerm.split(/\s+/).filter(word => word.length > 0);
      const searchConditions = searchWords.map(word => {
        const sanitizedWord = escapeRegex(word);
        const regex = new RegExp(sanitizedWord, 'i');
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
      if (searchConditions.length > 0) {
        query.$and = searchConditions;
      }
    }

    if (estadoTerm) {
      const sanitizedEstado = escapeRegex(estadoTerm);
      query.estado = new RegExp(sanitizedEstado, 'i');
    }

    const eventos: IEvent[] = await Event.find(query)
      .populate('criadoPor', 'nome cpf email')
      .sort({ dataInicio: 1, createdAt: -1 });

    res.status(200).json(eventos);

  } catch (error) {
    next(error);
  }
});

// Rota para o usuário ver os próprios eventos
router.get('/meus-eventos', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as ITokenPayload).userId;
    if (!userId) {
      return res.status(400).json({ message: 'ID do usuário não encontrado no token' });
    }
    const eventos: IEvent[] = await Event.find({ criadoPor: userId });
    res.status(200).json(eventos);
  } catch (error) {
    next(error);
  }
});

// Rota para deletar um evento
router.delete('/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = (req.user as ITokenPayload).userId;

    const evento: IEvent | null = await Event.findById(id);
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }

    if (evento.criadoPor.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const ingressoVendido: IIngresso | null = await Ingresso.findOne({
      eventoId: id,
      status: 'Pago'
    });

    if (ingressoVendido) {
      return res.status(400).json({
        message: 'Este evento não pode ser excluído, pois já possui ingressos vendidos.'
      });
    }

    await Ingresso.deleteMany({ eventoId: id });
    await Event.findByIdAndDelete(id);

    res.status(200).json({ message: 'Evento deletado com sucesso' });

  } catch (error) {
    next(error);
  }
});

// Rota /aprovados-carrossel
router.get('/aprovados-carrossel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventosAprovados: IEvent[] = await Event.find({ status: 'aprovado' })
      .populate('criadoPor', 'nome imagemPerfil');
    res.status(200).json(eventosAprovados);
  } catch (error) {
    next(error);
  }
});

// Rota /listar/:status (com agregação de perfil)
router.get('/listar/:status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.params;

    const eventos: any[] = await Event.find({ status: status })
      .populate('criadoPor', 'nome email')
      .sort({ createdAt: -1 })
      .lean();

    if (!eventos || eventos.length === 0) {
      return res.status(200).json([]);
    }

    const criadorIds = [...new Set(eventos.map(e => e.criadoPor?._id).filter(id => id))];
    if (criadorIds.length === 0) {
      return res.status(200).json(eventos);
    }

    // 🔥 CORREÇÃO 1: Removido o .lean() daqui.
    // Isso garante que 'perfis' é IPerfil[] (Documentos Mongoose)
    // e o 'perfilMap' vai funcionar corretamente.
    const perfis: IPerfil[] = await Perfil.find({ userId: { $in: criadorIds } })
      .select('userId dadosPessoais.cpf dadosPessoais.cnpj tipoPessoa');
    // .lean() FOI REMOVIDO

    // O mapa agora espera IPerfil (Document), o que está correto.
    const perfilMap = new Map<string, IPerfil>();
    perfis.forEach(p => perfilMap.set(p.userId.toString(), p));

    const eventosComDadosCriador = eventos.map(evento => {
      if (evento.criadoPor && evento.criadoPor._id) {
        const perfilCriador = perfilMap.get(evento.criadoPor._id.toString());
        if (perfilCriador) {
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



// Rota /publico/:id
router.get('/publico/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const evento: IEvent | null = await Event.findById(req.params.id).populate('criadoPor', 'nome email imagemPerfil');
    if (!evento || evento.status !== 'aprovado') {
      return res.status(404).json({ message: 'Evento não encontrado!' });
    }
    res.status(200).json(evento);
  } catch (error) {
    next(error);
  }
});

// Rota /:id (protegida)
router.get('/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const evento: IEvent | null = await Event.findById(req.params.id).populate('criadoPor', 'nome email imagemPerfil');
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado.' });
    }

    const userId = (req.user as ITokenPayload).userId;

    // 🔥 CORREÇÃO 3 e 4: Agora 'criadoPor' é (Types.ObjectId | IUser).
    // O 'as IUser' funciona porque *sabemos* que foi populado.
    if ((evento.criadoPor as IUser)._id.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado - você não é o dono deste evento' });
    }

    res.status(200).json(evento);
  } catch (error) {
    next(error);
  }
});

// Rota /atualizar-status/:id
router.patch('/atualizar-status/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status, motivo } = req.body as { status: IEvent['status'], motivo?: { titulo: string, descricao: string } };

    const evento: IEvent | null = await Event.findById(id).populate('criadoPor');
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado.' });
    }

    const statusAntigo = evento.status;
    evento.status = status;
    await evento.save();

    // 🔥 CORREÇÃO 3 e 4: O tipo 'criador' agora é (Types.ObjectId | IUser)
    const criador = evento.criadoPor;

    // Verificação de tipo: Se 'criador' não for um objeto populado, pule.
    if (!criador || typeof (criador as IUser)._id === 'undefined') {
      console.warn('Evento sem criador populado, pulando e-mail:', evento._id);
      return res.status(200).json(evento);
    }

    // Agora é seguro usar 'criador as IUser'
    if (status === 'rejeitado' && statusAntigo !== 'rejeitado' && motivo) {
      await enviarEmailRejeicaoEvento(criador as IUser, evento, motivo).catch(err => console.error(err));
    } else if (status === 'aprovado' && statusAntigo !== 'aprovado') {
      await enviarEmailAprovacaoEvento(criador as IUser, evento).catch(err => console.error(err));
    }

    res.status(200).json(evento);

  } catch (error) {
    next(error);
  }
});

// Rota /:id/editar
router.put('/:id/editar', protect, upload.single('imagem'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventoId = req.params.id;
    const userId = (req.user as ITokenPayload).userId;

    const eventoExistente: IEvent | null = await Event.findById(eventoId);
    if (!eventoExistente) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }
    if (eventoExistente.criadoPor.toString() !== userId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    // ================================================================
    // 🔥 CORREÇÃO 1: Extrair as variáveis do req.body PRIMEIRO
    // ================================================================
    const {
      nome, categoria, descricao, cep, rua, bairro, numero, complemento, cidade,
      estado, linkMaps, dataInicio, horaInicio, horaTermino, dataFimVendas,
      dataInicioVendas, valorIngressoInteira, valorIngressoMeia,
      quantidadeInteira, quantidadeMeia, temMeia, querDoar, valorDoacao,
    } = req.body;


    const MAX_FIELD_LENGTH = 500; // Um limite de 500 caracteres para campos normais
    const MAX_PRICE_LENGTH = 20;  // Um limite para campos de preço
    const MAX_CEP_LENGTH = 15;    // Um limite para CEP

    // ================================================================
    // 🔥 Agora este bloco de validação funciona, pois as
    //    variáveis 'cep', 'nome', etc., existem.
    // ================================================================
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
    // 🔥 CORREÇÃO 2: Aplicar a mesma lógica de sanitização
    //    da rota /criar (com .replace() e parseInt)
    // ================================================================
    const camposAtualizados: any = {
      nome, // usar a variável extraída
      categoria,
      descricao,
      cep: cep ? cep.replace(/\D/g, '') : '', // Aplicar .replace()
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
      dataFimVendas,
      dataInicioVendas,
      // Aplicar .replace() e parseFloat()
      valorIngressoInteira: valorIngressoInteira ? parseFloat(valorIngressoInteira.replace(',', '.')) : 0,
      valorIngressoMeia: valorIngressoMeia ? parseFloat(valorIngressoMeia.replace(',', '.')) : 0,
      quantidadeInteira: quantidadeInteira ? parseInt(quantidadeInteira) : 0,
      quantidadeMeia: quantidadeMeia ? parseInt(quantidadeMeia) : 0,
      temMeia: temMeia,
      querDoar: querDoar === 'true',
      // Aplicar .replace() e parseFloat()
      valorDoacao: querDoar === 'true' ? parseFloat(valorDoacao.replace(',', '.')) : 0,
      status: 'em_reanalise'
    };

    if (req.file) {
      camposAtualizados.imagem = req.file.filename;
    }

    const eventoAtualizado: IEvent | null = await Event.findByIdAndUpdate(
      eventoId,
      { $set: camposAtualizados },
      { new: true }
    );

    res.json({ message: 'Evento atualizado e enviado para reanálise', evento: eventoAtualizado });
  } catch (error) {
    next(error);
  }
});

// Rota /criar
router.post('/criar', protect, upload.single('imagem'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req.user as ITokenPayload);
    if (user.role === 'SUPER_ADMIN' || user.role === 'MANAGER_SITE') {
      return res.status(403).json({ message: 'Administradores não podem criar eventos.' });
    }

    const criadoPor = user.userId;

    const perfilUsuario: IPerfil | null = await Perfil.findOne({ userId: criadoPor });
    if (!perfilUsuario || !perfilUsuario.mercadoPagoAccountId) {
      return res.status(403).json({
        message: 'Ação bloqueada. É necessário vincular sua conta do Mercado Pago.'
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'A imagem do evento é obrigatória.' });
    }

    const usuario: IUser | null = await User.findById(criadoPor);
    if (!usuario) {
      return res.status(404).json({ message: 'Usuário criador não encontrado.' });
    }

    const {
      nome, categoria, descricao, cep, rua, bairro, numero, complemento, cidade,
      estado, linkMaps, dataInicio, horaInicio, horaTermino, dataFimVendas,
      dataInicioVendas, valorIngressoInteira, valorIngressoMeia,
      quantidadeInteira, quantidadeMeia, temMeia, querDoar, valorDoacao,
    } = req.body;

    const MAX_FIELD_LENGTH = 500; // Um limite de 500 caracteres para campos normais
    const MAX_PRICE_LENGTH = 20;  // Um limite para campos de preço
    const MAX_CEP_LENGTH = 15;    // Um limite para CEP

    // Valida os campos que usarão .replace()
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
    // Adicione mais validações para outros campos (nome, descricao, etc.)
    if (nome && nome.length > MAX_FIELD_LENGTH) {
      return res.status(400).json({ message: "O campo 'nome' é muito longo." });
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
      criadoPor // 'criadoPor' (string) é aceito pelo construtor
    });

    if (querDoar === 'true' && parseFloat(valorDoacao.replace(',', '.')) > 0) {
      novoEvento.doadores.push({
        // 🔥 CORREÇÃO 5: Converter a string 'criadoPor' para ObjectId
        usuarioId: new Types.ObjectId(criadoPor),
        imagemPerfil: usuario.imagemPerfil,
        nome: usuario.nome,
        valorDoacao: parseFloat(valorDoacao.replace(',', '.'))
      });
    }

    await novoEvento.save();

    await enviarEmailConfirmacaoEvento(usuario, novoEvento).catch(emailError => {
      console.error("Falha ao enviar e-mail de confirmação.", emailError);
    });

    res.status(201).json({ message: 'Evento criado com sucesso!', evento: novoEvento });
  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: `O ID '${error.value}' fornecido não é válido.`, error: error.message });
    }
    next(error);
  }
});

export default router;