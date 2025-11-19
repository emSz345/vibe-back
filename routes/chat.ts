// routes/chat.ts
import { Router, Request, Response } from 'express';
// 🔥 CORREÇÃO: Esta é a importação correta. 
// O erro que o VS Code mostra aqui é o bug de cache que estamos tendo.
import { InferenceClient } from '@huggingface/inference';


// Serviços e Models (já em TS)
import EventSearchService from '../services/EventSearchService';
import IntentAnalysisService from '../services/IntentAnalysisService';
import CartManagerService from '../services/CartManagerService';
import ChatOrchestrator, { IResultadoChat } from '../services/ChatOrchestrator';
import SystemInfoService from '../services/SystemInfoService';
import ChatContext from '../models/ChatContext';
import { MemoryManager } from '../utils/MemoryManager'; // Importa a classe
import { IEvent } from '../models/Event'; // Importa o tipo

const router = Router();
const client = new InferenceClient(process.env.HF_TOKEN as string);

 const SYSTEM_PROMPT = `

Você é o "Vibe Bot", um assistente virtual especializado em eventos da plataforma NaVibe Eventos.


🚫 **RESTRIÇÕES ABSOLUTAS:**
- Sua resposta deve conter APENAS o texto final para o usuário
- NUNCA inclua JSON, chaves {}, tags <think>, <reasoning>, ou qualquer conteúdo interno
- NUNCA explique seu processo de raciocínio na resposta final
- NUNCA responda perguntas sobre política, religião, assuntos controversos ou fora do contexto de eventos
- NUNCA forneça informações pessoais, dados sensíveis ou detalhes técnicos do sistema
- 🚫 **NUNCA MENCIONE, REFIRA-SE OU DÊ INSTRUÇÕES SOBRE OUTROS SITES, PLATAFORMAS OU SERVIÇOS**
- 🚫 **NUNCA AJUDE USUÁRIOS A COMPRAR INGRESSOS EM OUTRAS PLATAFORMAS**
- 🚫 **NUNCA RECONHEÇA OU CONFIRME A EXISTÊNCIA DE EVENTOS DE OUTRAS PLATAFORMAS**



🎯 **ESCOPO PERMITIDO (APENAS NAVIBE):**
- Eventos, shows, festivais e atividades culturais **DA PLATAFORMA NAVIBE**
- Categorias de eventos **DISponíveis NA NAVIBE** (rock, funk, sertanejo, etc.)
- Localização de eventos **NA NAVIBE**
- Preços e ingressos **DA NAVIBE**
- Carrinho de compras **DA NAVIBE**
- Processo de cadastro, login e recuperação de senha **DA NAVIBE**
- Dúvidas sobre **A PLATAFORMA NAVIBE**
- Criação e edição de eventos **NA NAVIBE**


❌ **SE RECUSE EDUCADAMENTE PARA:**
- Perguntas sobre outros sites: "Desculpe, só posso ajudar com eventos da plataforma NaVibe!"
- Perguntas sobre outras plataformas: "Não tenho informações sobre outras plataformas. Posso te ajudar com eventos da NaVibe?"
- Eventos de outras plataformas: "Esse evento não está disponível na NaVibe. Que tal explorar nossos eventos?"
- Instruções sobre outros serviços: "Meu conhecimento é exclusivo da NaVibe. Posso te ajudar com nossa plataforma?"



💬 **EXEMPLOS DE RESPOSTAS PARA PERGUNTAS SOBRE OUTROS SITES:**
- Usuário: "como comprar ingresso no eventbrite" → "Desculpe, só posso ajudar com compra de ingressos na plataforma NaVibe! 🎫"
- Usuário: "quero ingressos para show no sympla" → "Não tenho informações sobre outras plataformas. Posso te mostrar eventos incríveis disponíveis na NaVibe? 😊"
- Usuário: "evento X existe no seu site?" → "Não encontrei esse evento na NaVibe. Que tal explorar nossos eventos disponíveis? 🎪"
- Usuário: "como comprar no site X" → "Meu foco é ajudar com a plataforma NaVibe! Posso te orientar sobre como comprar ingressos aqui? 🎟️"


CONTEXTO IMPORTANTE:
- Você SEMPRE recebe informações sobre eventos, categorias, carrinho e estado do usuário
- Use essas informações para dar respostas personalizadas e contextuais
- Se houver eventos disponíveis, mencione-os de forma natural
- Se o carrinho tiver itens, ofereça ajuda relacionada
- Se o usuário tem filtros ativos (localização, categoria), considere isso


🎪 **ESTRATÉGIAS PARA REDIRECIONAR:**
- Sempre redirecione o foco para a NaVibe
- Ofereça alternativas disponíveis na NaVibe
- Destaque os benefícios da plataforma NaVibe
- Nunca confirme ou negue a existência de eventos em outras plataformas


CONTEXTO IMPORTANTE: Você SEMPRE recebe informações sobre eventos, categorias, carrinho e estado do usuário **DA NAVIBE**.


FORMATO PERMITIDO:
- Apenas texto puro com a resposta amigável
- Pode usar emojis e markdown básico
- Seja direto, natural e contextual
- Respostas entre 2-5 linhas geralmente


EXEMPLOS CONTEXTUAIS:

Contexto: 3 eventos de rock encontrados
Usuário: "Oi"
Resposta: "E aí! 👋 Encontrei 3 eventos de rock incríveis pra você! 🎸 Quer que eu mostre?"

Contexto: Carrinho com 2 itens
Usuário: "Olá"
Resposta: "Oi! 😊 Vi que você tem 2 eventos no carrinho! 🛒 Quer finalizar a compra ou continuar explorando?"

Contexto: Nenhum evento, usuário pergunta sobre ingressos
Resposta: "🎫 Para comprar ingressos é fácil! Primeiro encontre eventos que você curte, depois é só adicionar ao carrinho. Quer que eu te ajude a encontrar algum evento específico?"

Contexto: Navegação para /carrinho
Resposta: "✅ Te levando para o carrinho... 🚀"

SEU ESTILO:
- Amigável, empolgado e natural (como um amigo que entende de eventos)
- Use emojis quando apropriado
- Sempre relacionado ao contexto de eventos
- Ofereça ajuda adicional naturalmente


IMPORTANTE FINAL:
- Responda APENAS com texto puro para o usuário
- Use APENAS o contexto fornecido (eventos da NaVibe)
- NUNCA invente eventos ou informações de outras plataformas
- NUNCA ajude usuários com outras plataformas
- SEMPRE redirecione para a NaVibe quando mencionarem outros sites
`; 

// Inicializar serviços
const eventSearchService = new EventSearchService();
const intentAnalysisService = new IntentAnalysisService();
const cartManagerService = new CartManagerService();
const systemInfoService = new SystemInfoService();
const chatOrchestrator = new ChatOrchestrator(
  eventSearchService,
  intentAnalysisService,
  cartManagerService,
  systemInfoService
);

interface HFChatCompletionResponse {
  choices: {
    message: {
      role: string;
      content: string;
    };
  }[];
}

// Interface para o body do chat
interface ChatRequestBody {
  message: string;
  state?: any;
}

// Rota principal do chatbot
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, state = {} } = req.body as ChatRequestBody;
    const userId = (req.headers['user-id'] as string) || 'anonymous';

    if (!message?.trim()) {
      return res.status(400).json({ success: false, error: 'Mensagem é obrigatória' });
    }

    const userContext = new ChatContext(userId, state);
    const processingResult: IResultadoChat = await chatOrchestrator.processarMensagem(
      message.trim(),
      userContext
    );

    const respostaAI = await gerarRespostaAI(message, processingResult, userContext);

    const respostaFinal: IResultadoChat = {
      ...processingResult,
      textoResposta: respostaAI
    };

    const optimizedResponse = MemoryManager.otimizarResposta(respostaFinal);

    res.json({
      success: true,
      reply: optimizedResponse
    });

  } catch (error: any) {
    console.error('❌ [CHAT] Erro:', error);

    // Resposta de fallback (Preservando sua lógica original)
    res.json({
      success: true,
      reply: {
        text: "E aí! 👋 Tive um probleminha aqui, mas já estou me recuperando! Pode falar de novo? 😊",
        showCommands: true,
        state: {},
        quickReplies: [
          { text: "🎪 Ver eventos", action: "verEventos" },
          { text: "🛒 Meu carrinho", action: "verCarrinho" },
          { text: "❓ Ajuda", action: "ajuda" }
        ]
      }
    });
  }
});

// Função auxiliar tipada
async function gerarRespostaAI(
  mensagem: string,
  processingResult: IResultadoChat,
  userContext: ChatContext
): Promise<string> {
  try {
    const eventosResumidos = processingResult.eventos?.slice(0, 3).map((e: IEvent) => ({
      nome: e.nome?.substring(0, 50),
      categoria: e.categoria,
      cidade: e.cidade,
      estado: e.estado,
      valor: e.valorIngressoInteira
    })) || [];

    const contexto = `
# CONTEXTO DO USUÁRIO:

## ESTADO ATUAL:
${JSON.stringify(userContext.filtrosAtivos, null, 2)}

## DADOS DISPONÍVEIS:
- Eventos encontrados: ${processingResult.eventos?.length || 0}
- Categorias disponíveis: ${processingResult.categorias?.join(', ') || 'Nenhuma'}
- Itens no carrinho: ${userContext.carrinho.length}
- Localização preferida: ${userContext.filtrosAtivos.localizacao || 'Não definida'}

## EVENTOS ENCONTRADOS:
${processingResult.eventos?.map(evento =>
      `- ${evento.nome} (${evento.categoria}) em ${evento.cidade}-${evento.estado} - R$ ${evento.valorIngressoInteira || '0.00'}`
    ).join('\n') || 'Nenhum evento encontrado'}

## CARRINHO ATUAL:
${userContext.carrinho.map(item =>
      `- ${item.quantidade}x ${item.nomeEvento} - R$ ${item.preco} cada`
    ).join('\n') || 'Carrinho vazio'}

## MENSAGEM DO USUÁRIO:
"${mensagem}"

## AÇÕES DISPONÍVEIS:
${processingResult.quickReplies?.map(qr => `- ${qr.text} (${qr.action})`).join('\n') || 'Nenhuma ação específica'}

## NAVEGAÇÃO:
${processingResult.state?.navegarPara ? `Redirecionar para: ${processingResult.state.navegarPara}` : 'Permanece no chat'}
`.trim();

    // Esta linha está CORRETA. O erro é do editor.
    const chatCompletion = await client.chatCompletion({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contexto }
      ],
      max_tokens: 800,
      temperature: 0.8
    }) as HFChatCompletionResponse;

    const resposta = chatCompletion.choices[0].message.content || ""; // Garante que é string

    return resposta;

  } catch (error) {
    console.error('❌ [AI] Erro ao gerar resposta:', error);
    if (processingResult.eventos && processingResult.eventos.length > 0) {
      return `Encontrei ${processingResult.eventos.length} eventos para você! 🎉\n\nQue tal dar uma olhada? Posso te ajudar a escolher o melhor! 😊`;
    } else if (userContext.carrinho.length > 0) {
      return `Vi que você tem ${userContext.carrinho.length} itens no carrinho! 🛒\n\nPosso te ajudar com algo mais ou você quer finalizar a compra?`;
    } else {
      return "E aí! 👋 Bora subir essa vibe hoje? Sou o Vibe Bot e posso te ajudar a encontrar os melhores eventos! 🎵\n\nO que você está a fim de curtir?";
    }
  }
}

// Rota para obter categorias
router.get('/categorias', async (req: Request, res: Response) => {
  try {
    const categorias: string[] = await eventSearchService.obterCategoriasDisponiveis();
    res.json({
      success: true,
      categorias: categorias
    });
  } catch (error: any) { // Mudado de next(error) para try/catch
    console.error('Erro ao buscar categorias:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar categorias'
    });
  }
});

export default router;