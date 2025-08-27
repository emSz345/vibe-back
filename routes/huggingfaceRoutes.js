const express = require('express');
const router = express.Router();
const { InferenceClient } = require('@huggingface/inference');
const Event = require('../models/Event');

// Inicializar cliente do Hugging Face com a nova API
const client = new InferenceClient(process.env.HF_TOKEN);

// Sistema de prompts e contexto
const SYSTEM_PROMPT = `
Você é o "Vibe Bot", um assistente virtual especializado em eventos da plataforma NaVibe Eventos.

REGRA MAIS IMPORTANTE: Sua resposta deve conter APENAS o texto final para o usuário. 
NUNCA inclua tags <think>, <reasoning>, ou qualquer conteúdo interno de pensamento.
NUNCA explique seu processo de raciocínio na resposta final.

Não forneça nenhum texto de pensamento ou raciocínio — apenas o resultado final.
Evite frases como "Estou pensando:", "Meu raciocínio é:", "Pensamento:", etc.


Sua função é ajudar usuários a:
- Encontrar eventos por categoria, localização, data, preço
- Explicar como comprar ingressos
- Ajudar com criação de eventos
- Responder sobre perfis de usuário
- Fornecer informações sobre o sistema

ESTILO DE RESPOSTA:
- Amigável e empolgada (use emojis quando apropriado)
- Direta e útil
- Sempre relacionada ao contexto de eventos
- Se não souber algo, sugira alternativas ou peça mais informações
- Use markdown básico para formatação
- Seja conciso mas completo

INFORMAÇÕES SOBRE O SISTEMA:
- Plataforma: NaVibe Eventos
- Categorias disponíveis: Rock, Sertanejo, Eletrônica, Pop, MPB, Forró, Pagode, Jazz, Blues, Clássica, Teatro, Dança, Stand-up, Festival, Infantil, Esportes, Gastronomia, Workshop, Funk, Outros


`;

// Função para buscar eventos no banco de dados
async function buscarEventos(filtros = {}) {
  try {
    let query = { status: 'aprovado' };

    // Normalizar categoria
    if (filtros.categoria) {
      const categoriaNormalizada = filtros.categoria.trim();
      query.categoria = new RegExp(`^${categoriaNormalizada}$`, 'i');
    }

    // Normalizar localização
    if (filtros.localizacao) {
      const [cidade, estado] = filtros.localizacao.split('-').map(s => s.trim());
      if (estado) {
        query.estado = new RegExp(`^${estado}$`, 'i');
      }
      if (cidade && cidade !== estado) {
        query.cidade = new RegExp(`^${cidade}$`, 'i');
      }
    }

    // Filtro por faixa de preço
    if (filtros.faixaPreco) {
      query.valorIngressoInteira = {
        $gte: filtros.faixaPreco.min || 0,
        $lte: filtros.faixaPreco.max || 1000
      };
    }

    // 🔍 LOGS DE DEBUG
    console.log("🔍 Query construída:", query);

    const eventos = await Event.find(query)
      .sort({ dataInicio: 1 })
      .limit(filtros.quantidade || 10);

    console.log("🎉 Eventos retornados:", eventos.length);
    return eventos;
  } catch (error) {
    console.error('Erro ao buscar eventos:', error);
    return [];
  }
}

// Extrair intenções e parâmetros da mensagem do usuário
function analisarMensagem(mensagem) {
  const mensagemLower = mensagem.toLowerCase();

  const intencoes = {
    saudacao: /(olá|oi|e aí|bom dia|boa tarde|boa noite|hello|hi|saudações)/i,
    agradecimento: /(obrigado|valeu|agradeço|thanks|thank you)/i,
    buscarEventos: /(eventos?|shows?|festas?|encontrar|buscar|procurar|quero ir)/i,
    categorias: /(categorias?|tipos?|gêneros?|estilos?|rock|funk|sertanejo|eletrônica|pop|mpb)/i,
    localizacao: /(em |no |na |de |são paulo|sp|rio|rj|minas|mg|brasília|df|curitiba|pr|porto alegre|rs)/i,
    preco: /(preço|valor|quanto custa|barato|caro|grátis|gratuito|de graça)/i,
    data: /(hoje|amanhã|fim de semana|próximos dias|semana que vem|mês que vem)/i,
    comprarIngresso: /(comprar|ingresso|entrada|bilhete|adquirir|como compro)/i,
    criarEvento: /(criar evento|publicar evento|cadastrar evento|anunciar evento)/i,
    perfil: /(perfil|minha conta|meus dados|editar perfil)/i,
    ajuda: /(ajuda|como funciona|help|suporte|dúvida)/i,
    sobre: /(quem é você|o que você faz|vibe bot|sua função)/i
  };

  const intencaoDetectada = Object.keys(intencoes).find(key =>
    intencoes[key].test(mensagemLower)
  );

  const parametros = {};

  // Lista de categorias aceitas
  const categorias = [
    'rock', 'funk', 'sertanejo', 'eletrônica', 'pop', 'mpb', 'forró',
    'pagode', 'jazz', 'blues', 'clássica', 'teatro', 'dança',
    'stand-up', 'festival', 'infantil', 'esportes', 'gastronomia',
    'workshop', 'outros'
  ];

  // Verificar se alguma categoria aparece inteira na mensagem
  parametros.categoria = categorias.find(cat =>
    new RegExp(`\\b${cat}\\b`, 'i').test(mensagemLower)
  );

  // Extrair localização
  const locRegex = /(em|no|na|de) ([a-záàâãéèêíïóôõöúçñ\s]+)(?:-([a-z]{2}))?/i;
  const matchLoc = mensagem.match(locRegex);

  if (matchLoc) {
    const cidadeDetectada = matchLoc[2].trim();
    // Só define como localização se não for uma categoria
    if (!categorias.includes(cidadeDetectada.toLowerCase())) {
      parametros.localizacao = cidadeDetectada + (matchLoc[3] ? `-${matchLoc[3].toUpperCase()}` : '');
    }
  }

  // 🔍 LOG DE DEBUG
  console.log("🧩 Análise da mensagem:", { intent: intencaoDetectada, parametros });

  return {
    intent: intencaoDetectada || 'outros',
    parameters: parametros,
    confidence: intencaoDetectada ? 0.8 : 0.3
  };
}

// Rota principal do chatbot
router.post('/chat', async (req, res) => {
  try {
    const { message, state = {} } = req.body;
    const userId = req.headers['user-id'];

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Mensagem é obrigatória'
      });
    }

    // Analisar a mensagem do usuário
    const analise = analisarMensagem(message);

    let eventos = [];
    let categoriasDisponiveis = [];
    let showCommands = true;
    let novoEstado = { ...state };

    // Processar com base na intenção detectada
    switch (analise.intent) {
      case 'buscarEventos':
        const filtros = { ...state, ...analise.parameters };
        eventos = await buscarEventos(filtros);
        novoEstado = filtros;

        if (eventos.length > 0) {
          showCommands = false;
        }
        break;

      case 'categorias':
        const categoriasUnicas = await Event.distinct('categoria', { status: 'aprovado' });
        categoriasDisponiveis = categoriasUnicas.filter(cat => cat).sort();
        break;

      case 'localizacao':
        novoEstado.localizacao = analise.parameters.localizacao;
        eventos = await buscarEventos(novoEstado);
        break;

      default:
        if (Object.keys(novoEstado).length > 0) {
          eventos = await buscarEventos(novoEstado);
        }
    }

    // Preparar contexto para o modelo
    const contexto = `
      Estado atual: ${JSON.stringify(novoEstado)}
      Eventos encontrados: ${eventos.length}
      ${eventos.length > 0 ? `Exemplo de evento: ${eventos[0].nome} em ${eventos[0].cidade}` : ''}
      Categorias disponíveis: ${categoriasDisponiveis.join(', ')}
    `.trim();

    // Chamar o modelo usando a nova API InferenceClient
    const chatCompletion = await client.chatCompletion({
      provider: "fireworks-ai",
      model: "deepseek-ai/DeepSeek-V3.1",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT + "\n\nIMPORTANTE: Sua resposta deve conter APENAS o texto final para o usuário, sem tags <think> ou conteúdo interno. Responda diretamente de forma natural."
        },
        {
          role: "user",
          content: `Contexto: ${contexto}\n\nMensagem do usuário: ${message}`
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    let textoResposta = chatCompletion.choices[0].message.content;

    // REMOVER CONTEÚDO INTERNO (pensamentos) da resposta
    // REMOVER QUALQUER TRECHO DE PENSAMENTO
    // Remove blocos <think>...</think>
    // Remover qualquer coisa entre <think> e </think>, inclusive marcações soltas
    textoResposta = textoResposta.replace(/<think>[\s\S]*?<\/think>/gi, '');
    textoResposta = textoResposta.replace(/<\/?think>/gi, '');

    // Excluir padrões de raciocínio explícito
    textoResposta = textoResposta.replace(/(Racioc[ií]nio|Pensamento|Thought|Reasoning)/gi, '');

    // Garantir que não resta nada depois de identificadores
    const idx = textoResposta.search(/reasoning|pensamento|thought/i);
    if (idx !== -1) {
      textoResposta = textoResposta.substring(idx + 1).trim();  // ou até antes disso, conforme preferir
    }


    // Limpar espaços extras
    textoResposta = textoResposta.replace(/\n{2,}/g, '\n').trim();


    // Construir resposta
    const resposta = {
      success: true,
      reply: {
        text: textoResposta,
        intent: analise.intent,
        confidence: analise.confidence,
        eventos: eventos.slice(0, 5),
        categorias: categoriasDisponiveis,
        showCommands: showCommands,
        state: novoEstado
      },
      categorias: categoriasDisponiveis
    };

    res.json(resposta);

  } catch (error) {
    console.error('Erro no processamento do chatbot:', error);

    // Resposta de fallback
    res.json({
      success: true,
      reply: {
        text: "E aí! 👋 Bora subir essa vibe hoje? Sou o Vibe Bot e posso te ajudar a encontrar os melhores eventos! 🎵\n\nO que você está a fim de curtir? Pode me perguntar sobre eventos, categorias, ou como funciona a plataforma! 😎",
        showCommands: true,
        state: state
      }
    });
  }
});

// Rota para obter categorias disponíveis
router.get('/categorias', async (req, res) => {
  try {
    const categorias = await Event.distinct('categoria', { status: 'aprovado' });
    res.json({
      success: true,
      categorias: categorias.filter(cat => cat).sort()
    });
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar categorias'
    });
  }
});

module.exports = router;