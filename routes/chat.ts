// routes/chat.ts
import { Router, Request, Response } from 'express';
import { InferenceClient } from '@huggingface/inference';

// Importação dos serviços necessários
import IntentAnalysisService from '../services/IntentAnalysisService';
import ChatOrchestrator, { IResultadoChat } from '../services/ChatOrchestrator';
import SystemInfoService from '../services/SystemInfoService';
import ChatContext from '../models/ChatContext';

const router = Router();
// Inicializa o cliente de inferência do Hugging Face com o token da variável de ambiente
const client = new InferenceClient(process.env.HF_TOKEN as string);

/**
 * PROMPT DO SISTEMA - Define a personalidade e restrições do bot
 * - Papel: Assistente virtual da plataforma NaVibe
 * - Restrições: Não pode vender ingressos ou gerenciar carrinho
 * - Escopo: Informações gerais sobre a plataforma
 * - Formato: Texto puro com respostas amigáveis
 */
const SYSTEM_PROMPT = `
Você é o "Vibe Bot", um assistente virtual da plataforma NaVibe.
Seu papel é ajudar usuários com informações gerais sobre a plataforma.

🚫 **RESTRIÇÕES:**
- NÃO faça vendas de ingressos
- NÃO gerencie carrinho de compras
- NÃO mostre eventos específicos
- Foque em informações gerais e suporte

💬 **ESCOPO PERMITIDO:**
- Explicar sobre a plataforma
- Tirar dúvidas sobre funcionalidades
- Ajudar com cadastro e login
- Informações sobre categorias de eventos

FORMATO:
- Apenas texto puro com a resposta amigável
- Use emojis quando apropriado
- Seja direto e natural
`;

// Inicialização dos serviços
const intentAnalysisService = new IntentAnalysisService();
const systemInfoService = new SystemInfoService();
const chatOrchestrator = new ChatOrchestrator(
  intentAnalysisService,
  systemInfoService
);

// Interface para tipagem do corpo da requisição
interface ChatRequestBody {
  message: string;
}

/**
 * ROTA /chat - Endpoint principal para conversação
 * Método: POST
 * 
 * Fluxo:
 * 1. Recebe mensagem do usuário
 * 2. Valida dados de entrada
 * 3. Processa através do ChatOrchestrator
 * 4. Gera resposta via IA
 * 5. Retorna resposta formatada
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    // Extrai mensagem e user-id do cabeçalho
    const { message } = req.body as ChatRequestBody;
    const userId = (req.headers['user-id'] as string) || 'anonymous';

    // Validação básica da mensagem
    if (!message?.trim()) {
      return res.status(400).json({ success: false, error: 'Mensagem é obrigatória' });
    }

    // Cria contexto do usuário para manter estado da conversa
    const userContext = new ChatContext(userId, {});
    
    // Processa a mensagem através do orquestrador
    const processingResult: IResultadoChat = await chatOrchestrator.processarMensagem(
      message.trim(),
      userContext
    );

    // Gera resposta usando modelo de linguagem
    const respostaAI = await gerarRespostaAI(message);

    // Combina resultado do processamento com resposta da IA
    const respostaFinal: IResultadoChat = {
      ...processingResult,
      textoResposta: respostaAI
    };

    // Retorna resposta com sucesso
    res.json({
      success: true,
      reply: respostaFinal
    });

  } catch (error: any) {
    // Log detalhado do erro em ambiente de desenvolvimento
    console.error('❌ [CHAT] Erro:', error);

    // Resposta de fallback em caso de erro
    res.json({
      success: true,
      reply: {
        textoResposta: "E aí! 👋 Tive um probleminha aqui, mas já estou me recuperando! Pode falar de novo? 😊",
        showCommands: true,
        state: {},
        quickReplies: [
          { text: "❓ Ajuda", action: "ajuda" },
          { text: "ℹ️ Sobre", action: "sobre" }
        ]
      }
    });
  }
});

/**
 * FUNÇÃO gerarRespostaAI - Gera resposta usando modelo de linguagem
 * @param mensagem - Texto enviado pelo usuário
 * @returns Resposta gerada pela IA
 */
async function gerarRespostaAI(
  mensagem: string,
): Promise<string> {
  try {
    // Contexto formatado para o modelo de linguagem
    const contexto = `
MENSAGEM DO USUÁRIO: "${mensagem}"

CONTEXTO: Apenas conversação geral sobre a plataforma NaVibe.
`.trim();

    // Chamada para o modelo de linguagem
    const chatCompletion = await client.chatCompletion({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contexto }
      ],
      max_tokens: 800,
      temperature: 0.8
    }) as any;

    // Extrai resposta do completion
    const resposta = chatCompletion.choices[0].message.content || "";
    return resposta;

  } catch (error) {
    // Fallback em caso de erro na geração da resposta
    console.error('❌ [AI] Erro ao gerar resposta:', error);
    return "E aí! 👋 Como posso te ajudar hoje com a plataforma NaVibe? 😊";
  }
}

export default router;