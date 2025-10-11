const express = require('express');
const router = express.Router();
const { InferenceClient } = require('@huggingface/inference');
const Event = require('../models/Event');

// Inicializar cliente do Hugging Face com a nova API
const client = new InferenceClient(process.env.HF_TOKEN);

// Sistema de prompts e contexto
const SYSTEM_PROMPT = `
Você é o "Vibe Bot", um assistente virtual especializado em eventos da plataforma NaVibe Eventos.

REGRA ABSOLUTA: Sua resposta deve conter APENAS o texto final para o usuário. 
NUNCA inclua JSON, chaves {}, tags <think>, <reasoning>, ou qualquer conteúdo interno de pensamento.
NUNCA explique seu processo de raciocínio na resposta final.

FORMATO PROIBIDO: 
- Não use {"s": "pensamento", "answer": "resposta"}
- Não use <think>pensamento</think>
- Não use Raciocínio: texto

FORMATO PERMITIDO:
- Apenas texto puro com a resposta amigável
- Pode usar emojis e markdown básico
- Seja direto e natural

EXEMPLOS ERRADOS:
{"s": "pensamento", "answer": "resposta"}
<think>pensamento</think>resposta
Raciocínio: pensamento → resposta

EXEMPLOS CORRETOS:
Encontrei 2 eventos disponíveis! 🎉

EXEMPLOS CORRETOS PARA PREÇO:
Usuário: "eventos mais baratos em sp"
Resposta: "Encontrei os 3 eventos mais baratos de SP! 🎉\n\n• SHKL - R$ 100,00\n• Evento X - R$ 120,00\n• Evento Y - R$ 150,00"

Usuário: "qual o evento mais barato?"
Resposta: "O evento mais barato no momento é SHKL por R$ 100,00! 🎪"

Sua função é ajudar usuários a:
- Encontrar eventos por categoria, localização, data, preço
- Explicar como comprar ingressos
- Ajudar com criação de eventos
- Responder sobre perfis de usuário
- Fornecer informações sobre o sistema
- Gerenciar carrinho de compras (adicionar, remover, listar, limpar, finalizar compra)

ESTILO DE RESPOSTA:
- Amigável e empolgada (use emojis quando apropriado)
- Direta e útil
- Sempre relacionada ao contexto de eventos

INFORMAÇÕES SOBRE O SISTEMA:
- Plataforma: NaVibe Eventos
- Categorias disponíveis: Rock, Sertanejo, Eletrônica, Pop, MPB, Forró, Pagode, Jazz, Blues, Clássica, Teatro, Dança, Stand-up, Festival, Infantil, Esportes, Gastronomia, Workshop, Funk, Outros

FUNCIONALIDADES DE CARRINHO:
- Quando o usuário pedir para ver o carrinho, liste os itens com preços
- Para remover itens, forneça quick replies com ações
- Sempre mostre o total do carrinho
- Para finalizar compra, redirecione para a página de carrinho

EXEMPLOS CORRETOS PARA CARRINHO:
Usuário: "ver carrinho"
Resposta: "🛒 Seu Carrinho:\n\n1. Show do Rock\n   📅 15/12/2024\n   🎫 2x R$ 50,00\n   💰 Subtotal: R$ 100,00\n\n💰 TOTAL: R$ 100,00"

Usuário: "limpar carrinho"
Resposta: "🧹 Carrinho limpo! Todos os itens foram removidos."

Usuário: "finalizar compra"
Resposta: "✅ Te levando para finalizar sua compra... 🚀"

\n\nIMPORTANTE FINAL: Responda APENAS com texto puro para o usuário, como um assistente natural conversando.
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

    // Normalizar localização - buscar por cidade OU estado
    if (filtros.localizacao) {
      const localizacao = filtros.localizacao.trim().toUpperCase();

      // Lista de siglas de estados
      const siglasEstados = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
        'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
        'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

      // Se for uma sigla de estado (como "SP")
      if (siglasEstados.includes(localizacao)) {
        query.estado = localizacao;
      }
      // Se for no formato "cidade-estado"
      else if (localizacao.includes('-')) {
        const [cidade, estado] = localizacao.split('-').map(s => s.trim());
        if (estado) {
          query.estado = new RegExp(`^${estado}$`, 'i');
        }
        if (cidade && cidade !== estado) {
          query.cidade = new RegExp(`^${cidade}$`, 'i');
        }
      }
      // Se for apenas nome de cidade
      else {
        query.cidade = new RegExp(`^${localizacao}$`, 'i');
      }
    }

    // ✅ ADICIONE ESTE BLOCO PARA VALOR ESPECÍFICO
    if (filtros.valorEspecifico) {
      query.valorIngressoInteira = filtros.valorEspecifico;
    }

    // Filtro por faixa de preço
    else if (filtros.faixaPreco) {
      query.valorIngressoInteira = {
        $gte: filtros.faixaPreco.min || 0,
        $lte: filtros.faixaPreco.max || 1000
      };
    }

    console.log("🔍 Query construída:", query);

    let eventosQuery = Event.find(query);

    if (filtros.intent === 'preco' || filtros.faixaPreco || filtros.valorEspecifico) {
      eventosQuery = eventosQuery.sort({ valorIngressoInteira: 1 });
    } else {
      eventosQuery = eventosQuery.sort({ dataInicio: 1 });
    }

    const limit = (filtros.intent === 'preco' || filtros.valorEspecifico) ? 3 : (filtros.quantidade || 10);
    const eventos = await eventosQuery.limit(limit);

    console.log("🎉 Eventos retornados:", eventos.length);
    return eventos;
  } catch (error) {
    console.error('Erro ao buscar eventos:', error);
    return [];
  }
}

function extrairValorMonetario(mensagem) {
  const regexValor = /(?:R\$\s*)?(\d+[\.,]?\d*)(?:\s*reais)?/i;
  const match = mensagem.match(regexValor);

  if (match && match[1]) {
    // Converter para número (substituir vírgula por ponto se necessário)
    const valor = parseFloat(match[1].replace(',', '.'));
    return isNaN(valor) ? null : valor;
  }
  return null;
}

// Extrair intenções e parâmetros da mensagem do usuário
function analisarMensagem(mensagem) {
  const mensagemLower = mensagem.toLowerCase();

  const intencoes = {
    saudacao: /(olá|oi|e aí|bom dia|boa tarde|boa noite|hello|hi|saudações)/i,
    agradecimento: /(obrigado|valeu|agradeço|thanks|thank you)/i,
    buscarEventos: /(eventos?|shows?|festas?|encontrar|buscar|procurar|quero ir)/i,
    categorias: /(categorias?|tipos?|gêneros?|estilos?|rock|funk|sertanejo|eletrônica|pop|mpb)/i,
    localizacao: /(\b(em|no|na|de)\b |são paulo|sp|rio|rj|minas|mg|brasília|df|curitiba|pr|porto alegre|rs)/i,
    preco: /(preço|valor|quanto custa|barato|caro|grátis|gratuito|de graça|menor preço|mais barato|mais econômico|mais caro|maior preço|\b\d+\s*reais|\bR\$\s*\d+)/i,
    data: /(hoje|amanhã|fim de semana|próximos dias|semana que vem|mês que vem)/i,
    comprarIngresso: /(comprar|ingresso|entrada|bilhete|adquirir|como compro)/i,
    criarEvento: /(criar evento|publicar evento|cadastrar evento|anunciar evento)/i,
    perfil: /(perfil|minha conta|meus dados|editar perfil)/i,
    ajuda: /(ajuda|como funciona|help|suporte|dúvida)/i,
    sobre: /(quem é você|o que você faz|vibe bot|sua função)/i,
    navegacao: /(me leve|me leve para|quero ir|acessar|ir para|ver (meus|o)|como (chego|acesso)) (perfil|carrinho|meus eventos|meus ingressos|cadastro|login|painel|admin|eventos|categorias|termos|dúvidas)/i,
    carrinho: /(carrinho|meu carrinho|itens do carrinho|compras|finalizar compra|remover item|deletar item|ver carrinho|limpar carrinho|esvaziar carrinho)/i,
    adicionarCarrinho: /(adicionar|comprar|colocar no carrinho|quero ingressos?)/i,
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

  const navegacaoRegex = /(me leve|me leve para|quero ir|acessar|ir para|ver (meus|o)|como (chego|acesso))/i;
  if (navegacaoRegex.test(mensagemLower)) {
    // Verificar se contém destino de navegação
    const destino = detectarDestinoNavegacao(mensagem);
    if (destino) {
      return {
        intent: 'navegacao',
        parameters: { destino },
        confidence: 0.9
      };
    }
  }

  const valorEspecifico = extrairValorMonetario(mensagem);
  if (valorEspecifico) {
    return {
      intent: 'preco',
      parameters: { ...parametros, valorEspecifico },
      confidence: 0.9
    };
  }

  const precoRegex = /(menor preço|mais barato|mais econômico|maior preço|mais caro)/i;
  if (precoRegex.test(mensagemLower)) {
    return {
      intent: 'preco',
      parameters: parametros,
      confidence: 0.9
    };
  }

  // Extrair localização
  const locRegex = /(?:em|no|na|de)\s+([a-záàâãéèêíïóôõöúçñ]{3,})(?:\s*-\s*([a-z]{2}))?|(?:em|no|na|de)\s+([a-z]{2})\b/i;
  const matchLoc = mensagem.match(locRegex);

  if (matchLoc) {
    let cidadeDetectada = '';
    let estadoDetectado = '';

    if (matchLoc[1]) {
      cidadeDetectada = matchLoc[1].trim();
      estadoDetectado = matchLoc[2] ? matchLoc[2].toUpperCase() : null;
    }

    else if (matchLoc[3]) {
      estadoDetectado = matchLoc[3].toUpperCase();
    }

    const siglasEstados = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
      'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
      'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

    if (estadoDetectado && siglasEstados.includes(estadoDetectado)) {
      parametros.localizacao = estadoDetectado;
    }

    else if (cidadeDetectada && estadoDetectado) {
      parametros.localizacao = cidadeDetectada + '-' + estadoDetectado;
    } else if (cidadeDetectada && !categorias.includes(cidadeDetectada.toLowerCase())) {
      parametros.localizacao = cidadeDetectada;
    }
  }

  // Processar intenções de carrinho
  if (intencaoDetectada === 'carrinho') {
    // Verificar se é para limpar o carrinho
    if (mensagemLower.includes('limpar') || mensagemLower.includes('esvaziar')) {
      return {
        intent: 'limparCarrinho',
        parameters: {},
        confidence: 0.9
      };
    }
    
    // Verificar se é para finalizar compra
    if (mensagemLower.includes('finalizar') || mensagemLower.includes('comprar') || mensagemLower.includes('checkout')) {
      return {
        intent: 'finalizarCompra',
        parameters: {},
        confidence: 0.9
      };
    }
    
    // Verificar se é para remover item específico
    const removerRegex = /(remover|deletar|excluir).*?(item|ingresso)?\s*(\d+)/i;
    const matchRemover = mensagem.match(removerRegex);
    if (matchRemover && matchRemover[3]) {
      return {
        intent: 'removerItemCarrinho',
        parameters: { itemIndex: parseInt(matchRemover[3]) - 1 },
        confidence: 0.8
      };
    }
    
    return {
      intent: 'verCarrinho',
      parameters: {},
      confidence: 0.9
    };
  }

  if (intencaoDetectada === 'adicionarCarrinho') {
    // Extrair informações do evento para adicionar ao carrinho
    const eventoMatch = mensagem.match(/(?:adicionar|comprar).*?(\d+).*?(ingressos?)?/i);
    const quantidade = eventoMatch && eventoMatch[1] ? parseInt(eventoMatch[1]) : 1;
    
    return {
      intent: 'adicionarCarrinho',
      parameters: { 
        quantidade: quantidade,
      },
      confidence: 0.8
    };
  }

  // 🔍 LOG DE DEBUG
  console.log("🧩 Análise da mensagem:", { intent: intencaoDetectada, parametros });

  return {
    intent: intencaoDetectada || 'outros',
    parameters: parametros,
    confidence: intencaoDetectada ? 0.8 : 0.3
  };
}

function detectarDestinoNavegacao(mensagem) {
  const mensagemLower = mensagem.toLowerCase();

  const mapeamentoDestinos = {
    'perfil': ['perfil', 'minha conta', 'meus dados'],
    'carrinho': ['carrinho', 'meu carrinho', 'compras', 'cesta'],
    'meus-eventos': ['meus eventos', 'eventos criados', 'meus shows'],
    'meus-ingressos': ['meus ingressos', 'ingressos comprados', 'minhas entradas'],
    'cadastro': ['cadastro', 'criar conta', 'registrar'],
    'login': ['login', 'entrar', 'acessar conta'],
    'painel': ['painel', 'admin', 'administração'],
    'home': ['home', 'início', 'página inicial'],
    'categorias': ['categorias', 'tipos de evento'],
    'termos': ['termos', 'condições', 'políticas'],
    'duvidas': ['dúvidas', 'ajuda', 'suporte', 'faq']
  };

  for (const [destino, palavrasChave] of Object.entries(mapeamentoDestinos)) {
    for (const palavra of palavrasChave) {
      if (mensagemLower.includes(palavra)) {
        return `/${destino}`;
      }
    }
  }

  return null;
}

// Funções para gerenciar carrinho
function gerenciarCarrinho(acao, parametros, carrinhoAtual = []) {
  let novoCarrinho = [...carrinhoAtual];
  let quickReplies = [];

  switch (acao) {
    case 'verCarrinho':
      if (novoCarrinho.length === 0) {
        return {
          textoResposta: "🛒 Seu carrinho está vazio! Que tal explorar alguns eventos? 🎪",
          carrinho: novoCarrinho,
          quickReplies: [
            { text: "🎪 Ver eventos", action: "verEventos" }
          ]
        };
      } else {
        const total = novoCarrinho.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
        
        let textoResposta = "🛒 **Seu Carrinho:**\n\n";
        novoCarrinho.forEach((item, index) => {
          textoResposta += `${index + 1}. **${item.nomeEvento}**\n`;
          textoResposta += `   📅 ${item.dataEvento}\n`;
          textoResposta += `   🎫 ${item.quantidade}x R$ ${item.preco.toFixed(2)}\n`;
          textoResposta += `   💰 Subtotal: R$ ${(item.preco * item.quantidade).toFixed(2)}\n\n`;
        });
        textoResposta += `**💰 TOTAL: R$ ${total.toFixed(2)}**`;
        
        return {
          textoResposta: textoResposta,
          carrinho: novoCarrinho,
          quickReplies: [
            { text: "🗑️ Remover item", action: "removerItem" },
            { text: "🧹 Limpar carrinho", action: "limparCarrinho" },
            { text: "✅ Finalizar compra", action: "finalizarCompra" }
          ]
        };
      }

    case 'limparCarrinho':
      novoCarrinho = [];
      return {
        textoResposta: "🧹 Carrinho limpo com sucesso! Todos os itens foram removidos.",
        carrinho: novoCarrinho,
        quickReplies: [
          { text: "🎪 Ver eventos", action: "verEventos" }
        ]
      };

    case 'removerItemCarrinho':
      const itemIndex = parametros.itemIndex;
      if (itemIndex >= 0 && itemIndex < novoCarrinho.length) {
        const itemRemovido = novoCarrinho[itemIndex];
        novoCarrinho.splice(itemIndex, 1);
        return {
          textoResposta: `🗑️ "${itemRemovido.nomeEvento}" removido do carrinho!`,
          carrinho: novoCarrinho,
          quickReplies: [
            { text: "🛒 Ver carrinho", action: "verCarrinho" },
            { text: "🎪 Continuar comprando", action: "verEventos" }
          ]
        };
      }
      break;

    case 'finalizarCompra':
      if (novoCarrinho.length === 0) {
        return {
          textoResposta: "🛒 Seu carrinho está vazio! Adicione alguns eventos antes de finalizar a compra.",
          carrinho: novoCarrinho,
          quickReplies: [
            { text: "🎪 Ver eventos", action: "verEventos" }
          ]
        };
      } else {
        return {
          textoResposta: "✅ Te levando para finalizar sua compra... 🚀",
          carrinho: novoCarrinho,
          navegarPara: "/carrinho"
        };
      }

    default:
      break;
  }

  return {
    textoResposta: "",
    carrinho: novoCarrinho,
    quickReplies: []
  };
}

// Rota principal do chatbot
router.post('/chat', async (req, res) => {
  try {
    const { message, state = {}, carrinho = [] } = req.body;
    const userId = req.headers['user-id'];

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Mensagem é obrigatória'
      });
    }

    const mensagemLower = message.toLowerCase();

    // Analisar a mensagem do usuário
    const analise = analisarMensagem(message);

    let eventos = [];
    let categoriasDisponiveis = [];
    let showCommands = true;
    let novoEstado = { ...state };
    let quickReplies = [];
    let textoResposta = "";
    let carrinhoAtual = [...carrinho];
    let navegarPara = null;

    // Processar com base na intenção detectada
    switch (analise.intent) {
      case 'navegacao':
        console.log("🧭 Intenção de navegação detectada");
        const destino = detectarDestinoNavegacao(message);
        console.log("🎯 Destino detectado:", destino);

        if (destino) {
          novoEstado.navegarPara = destino;
          console.log("📍 Comando de navegação adicionado:", destino);

          eventos = [];
          categoriasDisponiveis = [];
          showCommands = false;
          break;
        }
        break;

      case 'verCarrinho':
      case 'limparCarrinho':
      case 'removerItemCarrinho':
      case 'finalizarCompra':
        const resultadoCarrinho = gerenciarCarrinho(analise.intent, analise.parameters, carrinhoAtual);
        textoResposta = resultadoCarrinho.textoResposta;
        carrinhoAtual = resultadoCarrinho.carrinho;
        quickReplies = resultadoCarrinho.quickReplies || [];
        navegarPara = resultadoCarrinho.navegarPara;
        showCommands = false;
        break;

      case 'buscarEventos':
        const filtros = { ...state, ...analise.parameters };
        eventos = await buscarEventos(filtros);
        novoEstado = filtros;

        if (eventos.length > 0) {
          showCommands = false;
        }
        break;

      case 'preco':
        const filtrosPreco = { ...state };

        if (analise.parameters.valorEspecifico) {
          filtrosPreco.valorEspecifico = analise.parameters.valorEspecifico;
        }
        else if (mensagemLower.includes('menor') || mensagemLower.includes('barato')) {
          filtrosPreco.faixaPreco = { min: 0, max: 50 };
        } else if (mensagemLower.includes('caro') || mensagemLower.includes('maior')) {
          filtrosPreco.faixaPreco = { min: 100, max: 1000 };
        }

        eventos = await buscarEventos({
          ...filtrosPreco,
          ...analise.parameters,
          intent: 'preco'
        });

        showCommands = eventos.length === 0;
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

    // Se já temos uma resposta do carrinho, usar ela
    if (!textoResposta) {
      // Preparar contexto para o modelo
      const contexto = `
        Estado atual: ${JSON.stringify(novoEstado)}
        Eventos encontrados: ${eventos.length}
        ${eventos.length > 0 ? `Exemplo de evento: ${eventos[0].nome} em ${eventos[0].cidade}` : ''}
        Categorias disponíveis: ${categoriasDisponiveis.join(', ')}
        Carrinho atual: ${carrinhoAtual.length} itens
        ${carrinhoAtual.length > 0 ? `Itens no carrinho: ${carrinhoAtual.map(item => item.nomeEvento).join(', ')}` : ''}
      `.trim();

      // Chamar o modelo usando a nova API InferenceClient
      const chatCompletion = await client.chatCompletion({
        provider: "cerebras",
        model: "openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          {
            role: "user",
            content: `Contexto: ${contexto}\n\nMensagem do usuário: ${message}`
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      textoResposta = chatCompletion.choices[0].message.content;
    }

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
        state: { ...novoEstado, ...(navegarPara && { navegarPara }) },
        quickReplies: quickReplies,
        carrinho: carrinhoAtual
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
