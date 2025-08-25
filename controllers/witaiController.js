const { Wit } = require('node-wit');
const Event = require('../models/Event');
const axios = require('axios');

// Inicializa o cliente do Wit.ai
const witClient = new Wit({
  accessToken: process.env.WIT_AI_SERVER_TOKEN
});

// Função auxiliar para validar categoria
function isValidCategory(category) {
  if (!category) return false;

  const catLower = category.toLowerCase().trim();

  const categoriasValidas = [
    'rock', 'sertanejo', 'eletrônica', 'eletronica', 'mpb',
    'funk', 'pop', 'samba', 'forró', 'forro', 'pagode',
    'rap', 'hip hop', 'reggae', 'blues', 'jazz', 'gospel',
    'axe', 'brega', 'metal', 'punk', 'classica', 'clássica'
  ];

  if (categoriasValidas.includes(catLower)) {
    return true;
  }

  return false;
}

// Função para normalizar o nome da categoria
function normalizeCategory(category) {
  if (!category) return '';

  const catLower = category.toLowerCase().trim();

  const mapeamentoCategorias = {
    'eletronica': 'Eletrônica',
    'forro': 'Forró',
    'hip hop': 'Hip Hop',
    'classica': 'Clássica',
    'rock': 'Rock',
    'sertanejo': 'Sertanejo',
    'mpb': 'MPB',
    'funk': 'Funk',
    'pop': 'Pop',
    'samba': 'Samba',
    'forró': 'Forró',
    'pagode': 'Pagode',
    'rap': 'Rap',
    'reggae': 'Reggae',
    'blues': 'Blues',
    'jazz': 'Jazz',
    'gospel': 'Gospel',
    'axe': 'Axé',
    'brega': 'Brega',
    'metal': 'Metal',
    'punk': 'Punk',
    'clássica': 'Clássica'
  };

  return mapeamentoCategorias[catLower] || category;
}

// Função para buscar eventos por categoria
async function buscarEventosPorCategoria(categoria) {
  try {
    console.log(`Buscando eventos da categoria: ${categoria}`);

    const categoriaExata = await Event.findOne({
      categoria: new RegExp(`^${categoria}$`, 'i'),
      status: 'aprovado'
    }).select('categoria');

    let categoriaParaBuscar = categoria;

    if (categoriaExata) {
      categoriaParaBuscar = categoriaExata.categoria;
      console.log(`Categoria exata encontrada: ${categoriaParaBuscar}`);
    }

    const eventos = await Event.find({
      categoria: new RegExp(categoriaParaBuscar, 'i'),
      status: 'aprovado',
      dataInicio: { $gte: new Date().toISOString().split('T')[0] }
    })
      .limit(10)
      .sort({ dataInicio: 1 });

    console.log(`Encontrados ${eventos.length} eventos para ${categoriaParaBuscar}`);
    return eventos;
  } catch (error) {
    console.error('Erro ao buscar eventos por categoria:', error);
    return [];
  }
}

// Função para buscar todas as categorias disponíveis
async function getAvailableCategories() {
  try {
    const categorias = await Event.distinct('categoria', {
      status: 'aprovado',
      dataInicio: { $gte: new Date().toISOString().split('T')[0] }
    });

    const categoriasFiltradas = categorias
      .filter(cat => cat && cat.trim() !== '')
      .map(cat => cat.trim())
      .sort();

    console.log('Categorias disponíveis no banco:', categoriasFiltradas);
    return categoriasFiltradas;
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    return ['Rock', 'Sertanejo', 'Eletrônica', 'MPB', 'Funk', 'Pop', 'Samba', 'Forró'];
  }
}

// Função para verificar se uma categoria existe no banco
async function categoriaExisteNoBanco(categoria) {
  try {
    const categoriaNormalizada = normalizeCategory(categoria);
    const existe = await Event.findOne({
      categoria: new RegExp(categoriaNormalizada, 'i'),
      status: 'aprovado'
    });

    return !!existe;
  } catch (error) {
    console.error('Erro ao verificar categoria:', error);
    return false;
  }
}

// Função para gerar próxima pergunta de filtro
function gerarPerguntaFiltro(estadoAtual) {
  const filtrosPendentes = [];

  if (!estadoAtual.quantidade) filtrosPendentes.push('quantidade');
  if (!estadoAtual.faixaPreco) filtrosPendentes.push('faixaPreco');
  if (!estadoAtual.localizacao) filtrosPendentes.push('localizacao');
  if (!estadoAtual.dataPreferencia) filtrosPendentes.push('dataPreferencia');

  return filtrosPendentes[0];
}

// Função para gerar pergunta específica de filtro
function gerarPerguntaPorFiltro(filtro, categoria) {
  switch (filtro) {
    case 'quantidade':
      return `🎉 Você escolheu ${categoria}! Quantos eventos você gostaria de ver? (ex: 3, 5, 10)`;
    case 'faixaPreco':
      return `💰 Qual sua faixa de preço preferida para ${categoria}? (ex: até 50, entre 50-100, acima de 100)`;
    case 'localizacao':
      return `📍 Em qual cidade você gostaria de encontrar eventos de ${categoria}?`;
    case 'dataPreferencia':
      return `📅 Você prefere eventos de ${categoria} em alguma data específica? (ex: este fim de semana, próxima semana, qualquer data)`;
    default:
      return `Vamos ajustar sua busca por ${categoria}!`;
  }
}

// Função para extrair faixa de preço da mensagem
function extrairFaixaPreco(mensagem) {
  const mensagemLower = mensagem.toLowerCase();

  // Padrões para extração de faixa de preço
  if (mensagemLower.includes('até') || mensagemLower.includes('até')) {
    const match = mensagemLower.match(/(até|até)\s*(\d+)/);
    if (match && match[2]) {
      return { min: 0, max: parseInt(match[2]) };
    }
  }

  if (mensagemLower.includes('entre')) {
    const match = mensagemLower.match(/entre\s*(\d+)\s*e\s*(\d+)/);
    if (match && match[1] && match[2]) {
      return { min: parseInt(match[1]), max: parseInt(match[2]) };
    }

    const matchHifen = mensagemLower.match(/(\d+)\s*-\s*(\d+)/);
    if (matchHifen && matchHifen[1] && matchHifen[2]) {
      return { min: parseInt(matchHifen[1]), max: parseInt(matchHifen[2]) };
    }
  }

  if (mensagemLower.includes('acima') || mensagemLower.includes('mais de')) {
    const match = mensagemLower.match(/(acima|mais de)\s*(\d+)/);
    if (match && match[2]) {
      return { min: parseInt(match[2]), max: 1000 }; // Limite máximo arbitrário
    }
  }

  // Extrair números simples
  const numeros = mensagemLower.match(/\d+/g);
  if (numeros && numeros.length === 1) {
    return { min: 0, max: parseInt(numeros[0]) };
  }

  if (numeros && numeros.length >= 2) {
    return { min: parseInt(numeros[0]), max: parseInt(numeros[1]) };
  }

  return null;
}

// Função para extrair localização da mensagem
function extrairLocalizacao(mensagem, entities) {
  const mensagemLower = mensagem.toLowerCase();



  // Primeiro tenta pelas entidades do Wit.ai
  const localizacaoEntity = entities['localizacao:localizacao']?.[0]?.value;
  if (localizacaoEntity) {
    return localizacaoEntity;
  }

  const witLocationEntity = entities['wit$location:location']?.[0]?.value;
  if (witLocationEntity) {
    console.log('Localização extraída por entidade built-in:', witLocationEntity);
    return witLocationEntity;
  }

  const cidadesBrasileiras = [
    'são paulo', 'rio de janeiro', 'belo horizonte', 'brasília', 'salvador',
    'fortaleza', 'recife', 'porto alegre', 'curitiba', 'goiânia', 'belém',
    'manaus', 'vitória', 'florianópolis', 'natal', 'joão pessoa', 'maceió',
    'campo grande', 'cuiabá', 'teresina', 'aracaju', 'palmas', 'porto velho',
    'rio branco', 'macapá', 'boavista'
  ];

  for (const cidade of cidadesBrasileiras) {
    if (mensagemLower.includes(cidade)) {
      console.log('Localização extraída por lista de cidades:', cidade);
      return cidade;
    }
  }

  // Fallback: procura por padrões comuns de cidades
  const padroesCidades = [
    /(?:em|no|na|de)\s+([a-zA-ZÀ-ÿ\s]{3,})/i,
    /(?:em|no|na|de)\s+([a-zA-ZÀ-ÿ]+(?:\s+[a-zA-ZÀ-ÿ]+){1,2})/i,
    /📍\s*([a-zA-ZÀ-ÿ\s]+)/i,
    /cidade\s+(?:de|do|da)?\s*([a-zA-ZÀ-ÿ\s]+)/i
  ];

  for (const padrao of padroesCidades) {
    const match = mensagem.match(padrao);
    if (match && match[1]) {
      const localExtraido = match[1].trim();
      console.log('Localização extraída por padrão regex:', localExtraido);
      return localExtraido;
    }
  }

  const mapeamentoEstados = {
    'são paulo': 'SP', 'sao paulo': 'SP', 'sp': 'SP',
    'rio de janeiro': 'RJ', 'rj': 'RJ',
    'minas gerais': 'MG', 'mg': 'MG',
    'bahia': 'BA', 'ba': 'BA',
    'ceará': 'CE', 'ceara': 'CE', 'ce': 'CE',
    'paraná': 'PR', 'parana': 'PR', 'pr': 'PR',
    'rio grande do sul': 'RS', 'rs': 'RS',
    'pernambuco': 'PE', 'pe': 'PE',
    'goiás': 'GO', 'goias': 'GO', 'go': 'GO'
  };

  if (localExtraido && mapeamentoEstados[localExtraido.toLowerCase()]) {
    return mapeamentoEstados[localExtraido.toLowerCase()];
  }

  console.log('Nenhuma localização encontrada na mensagem:', mensagem);
  return localExtraido;
}

// Função para extrair data da mensagem
function extrairDataPreferencia(mensagem) {
  const mensagemLower = mensagem.toLowerCase();

  if (mensagemLower.includes('fim de semana') || mensagemLower.includes('final de semana')) {
    return 'fim_de_semana';
  }
  if (mensagemLower.includes('próxima semana') || mensagemLower.includes('proxima semana')) {
    return 'proxima_semana';
  }
  if (mensagemLower.includes('este mês') || mensagemLower.includes('esse mês')) {
    return 'este_mes';
  }
  if (mensagemLower.includes('qualquer') || mensagemLower.includes('não importa')) {
    return 'qualquer';
  }

  return null;
}

// Função para buscar eventos com filtros aplicados
async function buscarEventosComFiltros(filtros) {
  try {
    const query = {
      status: 'aprovado',
      dataInicio: { $gte: new Date().toISOString().split('T')[0] }
    };

    // Filtro por categoria
    if (filtros.categoria) {
      query.categoria = new RegExp(filtros.categoria, 'i');
    }

    // Filtro por faixa de preço
    if (filtros.faixaPreco) {
      query.$or = [
        {
          valorIngressoInteira: {
            $gte: filtros.faixaPreco.min,
            $lte: filtros.faixaPreco.max
          }
        },
        {
          valorIngressoMeia: {
            $gte: filtros.faixaPreco.min,
            $lte: filtros.faixaPreco.max
          }
        }
      ];
    }

    // Filtro por localização
    if (filtros.localizacao) {
      const localizacaoRegex = new RegExp(filtros.localizacao, 'i');

      query.$or = [
        { cidade: localizacaoRegex },
        { estado: localizacaoRegex },
        { bairro: localizacaoRegex }
      ];

      // Se o usuário pesquisar por "são paulo", também buscar por "SP"
      if (filtros.localizacao.toLowerCase().includes('são paulo') ||
        filtros.localizacao.toLowerCase().includes('sao paulo')) {
        query.$or.push({ estado: /SP/i });
      }

      // Mapeamento de estados
      const mapeamentoEstados = {
        'são paulo': 'SP', 'sao paulo': 'SP', 'sp': 'SP',
        'rio de janeiro': 'RJ', 'rj': 'RJ',
        'minas gerais': 'MG', 'mg': 'MG',
        // adicione outros estados...
      };

      const estadoMapeado = mapeamentoEstados[filtros.localizacao.toLowerCase()];
      if (estadoMapeado) {
        query.$or.push({ estado: estadoMapeado });
      }
    }

    // Filtro por data (implementação básica)
    if (filtros.dataPreferencia === 'fim_de_semana') {
      // Lógica para fim de semana seria mais complexa na realidade
      query.dataInicio = { $gte: new Date().toISOString().split('T')[0] };
    }

    const limite = filtros.quantidade || 10;

    console.log('Query final para busca:', JSON.stringify(query, null, 2));

    const eventos = await Event.find(query)
      .limit(limite)
      .sort({ dataInicio: 1 });

    console.log(`Encontrados ${eventos.length} eventos com filtros:`, filtros);
    return eventos;
  } catch (error) {
    console.error('Erro ao buscar eventos com filtros:', error);
    return [];
  }
}

// Controller principal
// Controller principal
exports.processMessageWithState = async (req, res) => {
  try {
    const { message, state = {} } = req.body;

    console.log('Mensagem recebida:', message);
    console.log('Estado atual:', state);

    let categoriasDisponiveis = await getAvailableCategories();

    // PRIMEIRO: Processar resposta do Wit.ai para ter acesso às entities
    let witResponse;
    try {
      witResponse = await witClient.message(message);
      console.log('Resposta do Wit.ai:', JSON.stringify(witResponse, null, 2));
    } catch (witError) {
      console.error('Erro no Wit.ai:', witError);
      witResponse = { intents: [], entities: {} };
    }

    const intent = witResponse.intents[0]?.name || 'default';
    const confidence = witResponse.intents[0]?.confidence || 0;
    const entities = witResponse.entities || {};

    // CASO 1: Usuário está respondendo a uma pergunta de filtro
    if (state.waitingForFilter) {
      const filtroAtual = state.waitingForFilter;
      let valorFiltro = null;
      let updatedState = { ...state };

      console.log(`Processando resposta para filtro: ${filtroAtual}`);

      switch (filtroAtual) {
        case 'quantidade':
          // Primeiro tenta pelas entidades do Wit.ai
          const numeroEntity = entities['wit$number:number']?.[0]?.value;
          if (numeroEntity) {
            valorFiltro = parseInt(numeroEntity);
            updatedState.quantidade = Math.min(Math.max(valorFiltro, 1), 20);
            console.log(`Quantidade extraída por entidade: ${valorFiltro}`);
          } else {
            // Fallback: extrair número do texto manualmente
            const numeros = message.match(/\d+/);
            if (numeros && numeros[0]) {
              valorFiltro = parseInt(numeros[0]);
              updatedState.quantidade = Math.min(Math.max(valorFiltro, 1), 20);
              console.log(`Quantidade extraída manualmente: ${valorFiltro}`);
            } else {
              // Se não conseguiu extrair número, pedir novamente
              return res.json({
                success: true,
                reply: {
                  text: `Não entendi a quantidade. Quantos eventos de ${state.categoria} você gostaria de ver? (ex: 3, 5, 10)`,
                  eventos: [],
                  showCommands: false,
                  state: updatedState,
                  categorias: categoriasDisponiveis
                },
                intent: 'responder_filtro',
                confidence: 1.0,
                categorias: categoriasDisponiveis
              });
            }
          }
          break;

        case 'faixaPreco':
          valorFiltro = extrairFaixaPreco(message);
          if (valorFiltro) {
            updatedState.faixaPreco = valorFiltro;
            console.log(`Faixa de preço extraída:`, valorFiltro);
          } else {
            return res.json({
              success: true,
              reply: {
                text: `Não entendi a faixa de preço. Qual valor você pretende gastar em ${state.categoria}? (ex: até 50, entre 50-100)`,
                eventos: [],
                showCommands: false,
                state: updatedState,
                categorias: categoriasDisponiveis
              },
              intent: 'responder_filtro',
              confidence: 1.0,
              categorias: categoriasDisponiveis
            });
          }
          break;

        case 'localizacao':
          valorFiltro = extrairLocalizacao(message, entities);
          if (valorFiltro) {
            updatedState.localizacao = valorFiltro;
            console.log(`Localização extraída: ${valorFiltro}`);
          } else {
            return res.json({
              success: true,
              reply: {
                text: `Não entendi a localização. Em qual cidade você quer eventos de ${state.categoria}?`,
                eventos: [],
                showCommands: false,
                state: updatedState,
                categorias: categoriasDisponiveis
              },
              intent: 'responder_filtro',
              confidence: 1.0,
              categorias: categoriasDisponiveis
            });
          }
          break;

        case 'dataPreferencia':
          valorFiltro = extrairDataPreferencia(message);
          if (valorFiltro) {
            updatedState.dataPreferencia = valorFiltro;
            console.log(`Preferência de data extraída: ${valorFiltro}`);
          } else {
            return res.json({
              success: true,
              reply: {
                text: `Não entendi a preferência de data. Quando você quer eventos de ${state.categoria}? (ex: este fim de semana, próxima semana)`,
                eventos: [],
                showCommands: false,
                state: updatedState,
                categorias: categoriasDisponiveis
              },
              intent: 'responder_filtro',
              confidence: 1.0,
              categorias: categoriasDisponiveis
            });
          }
          break;
      }

      // Determinar próximo filtro
      updatedState.waitingForFilter = gerarPerguntaFiltro(updatedState);

      let replyText = '';
      let eventos = [];

      if (updatedState.waitingForFilter) {
        // Ainda há filtros pendentes
        replyText = gerarPerguntaPorFiltro(updatedState.waitingForFilter, updatedState.categoria);
      } else {
        eventos = await buscarEventosComFiltros(updatedState);
        if (eventos.length > 0) {
          replyText = `🎉 Encontrei ${eventos.length} evento(s) de ${updatedState.categoria} com seus filtros!`;
          categoriasDisponiveis = [];
        } else {
          replyText = `😔 Não encontrei eventos de ${updatedState.categoria} com esses filtros. Que tal tentar outros critérios?`;
        }
        // Atualizar estado SEM eventosEncontrados (vamos usar o array principal)
        updatedState.showCommands = true;
      }

      return res.json({
        success: true,
        reply: {
          text: replyText,
          eventos: eventos, // ← GARANTIR que eventos estão aqui
          showCommands: !updatedState.waitingForFilter,
          state: updatedState,
          categorias: categoriasDisponiveis
        },
        intent: 'responder_filtro',
        confidence: 1.0,
        categorias: categoriasDisponiveis,
        eventos: eventos // ← E também aqui para compatibilidade
      });
    }

    // CASO 2: Seleção de categoria através de botão
    if (isValidCategory(message)) {
      const categoriaSelecionada = normalizeCategory(message);
      const categoriaExiste = await categoriaExisteNoBanco(categoriaSelecionada);

      if (!categoriaExiste) {
        return res.json({
          success: true,
          reply: {
            text: `😔 A categoria "${categoriaSelecionada}" não foi encontrada. Que tal tentar uma dessas?`,
            eventos: [],
            showCommands: true,
            state: state,
            categorias: categoriasDisponiveis
          },
          intent: 'categoria_nao_encontrada',
          confidence: 1.0,
          categorias: categoriasDisponiveis
        });
      }

      // Iniciar fluxo de filtros
      const proximoFiltro = gerarPerguntaFiltro(state);
      const updatedState = {
        ...state,
        categoria: categoriaSelecionada,
        waitingForFilter: proximoFiltro
      };

      let replyText = '';
      let eventos = [];

      if (proximoFiltro) {
        replyText = gerarPerguntaPorFiltro(proximoFiltro, categoriaSelecionada);
      } else {
        // Buscar eventos diretamente se não há filtros pendentes
        eventos = await buscarEventosPorCategoria(categoriaSelecionada);
        replyText = eventos.length > 0
          ? `🎉 Encontrei ${eventos.length} evento(s) de ${categoriaSelecionada}!`
          : `😔 Não encontrei eventos de ${categoriaSelecionada} no momento.`;
      }

      return res.json({
        success: true,
        reply: {
          text: replyText,
          eventos: eventos,
          showCommands: !proximoFiltro,
          state: updatedState,
          categorias: categoriasDisponiveis
        },
        intent: 'selecionar_categoria',
        confidence: 1.0,
        categorias: categoriasDisponiveis
      });
    }

    // CASO 3: Processamento normal pelo Wit.ai
    let replyText = '';
    let eventos = [];
    let showCommands = true;
    let updatedState = { ...state };

    // Processamento baseado na intenção
    switch (intent) {
      case 'buscar_eventos':
        const categoriaEntity = entities['categoria:categoria']?.[0]?.value;
        const localizacaoEntity = entities['localizacao:localizacao']?.[0]?.value;

        if (categoriaEntity) {
          const categoriaNormalizada = normalizeCategory(categoriaEntity);
          eventos = await buscarEventosPorCategoria(categoriaNormalizada);
          replyText = eventos.length > 0
            ? `🎵 Encontrei ${eventos.length} evento(s) de ${categoriaNormalizada}!`
            : `😔 Não encontrei eventos de ${categoriaNormalizada}. Que tal tentar outra categoria?`;
        } else if (localizacaoEntity) {
          eventos = await Event.find({
            cidade: new RegExp(localizacaoEntity, 'i'),
            status: 'aprovado'
          }).limit(10);
          replyText = eventos.length > 0
            ? `📍 Encontrei ${eventos.length} evento(s) em ${localizacaoEntity}!`
            : `😔 Não encontrei eventos em ${localizacaoEntity}.`;
        } else {
          eventos = await Event.find({
            status: 'aprovado',
            dataInicio: { $gte: new Date().toISOString().split('T')[0] }
          }).limit(10);
          replyText = eventos.length > 0
            ? `🎪 Encontrei ${eventos.length} evento(s)!`
            : '😔 Não encontrei eventos no momento.';
        }
        break;

      case 'listar_categorias':
        replyText = categoriasDisponiveis.length > 0
          ? '🎵 Aqui estão as categorias disponíveis:'
          : '😔 Não encontrei categorias disponíveis no momento.';
        break;

      case 'saudacao':
        replyText = 'E aí! Bora subir essa vibe hoje? Que tipo de evento você está procurando? 🎪';
        break;

      case 'ajuda':
        replyText = 'Claro! Posso te ajudar a:\n\n' +
          '🎵 • Encontrar eventos por categoria\n' +
          '📍 • Buscar eventos por cidade\n' +
          '📅 • Ver eventos por data\n' +
          '💰 • Filtrar por preço\n\n' +
          'O que você gostaria de fazer?';
        break;

      case 'agradecimento':
        replyText = 'Por nada! Fico feliz em ajudar. 😊\nPrecisa de mais alguma coisa?';
        break;

      default:
        const mensagemLower = message.toLowerCase();

        if (mensagemLower.includes('categorias') ||
          mensagemLower.includes('categoria') ||
          mensagemLower.includes('tipos') ||
          mensagemLower.includes('que categorias')) {
          replyText = '🎵 Aqui estão as categorias disponíveis:';
        } else if (mensagemLower.includes('eventos') ||
          mensagemLower.includes('shows') ||
          mensagemLower.includes('festas')) {
          eventos = await Event.find({
            status: 'aprovado',
            dataInicio: { $gte: new Date().toISOString().split('T')[0] }
          }).limit(5);
          replyText = eventos.length > 0
            ? `🎪 Encontrei ${eventos.length} evento(s)!`
            : '😔 Não encontrei eventos no momento.';
        } else {
          replyText = 'Interessante! Posso te ajudar com eventos, categorias, cidades ou informações gerais! 🎪';
        }
    }

    res.json({
      success: true,
      reply: {
        text: replyText,
        eventos: eventos,
        categorias: eventos.length > 0 ? [] : categoriasDisponiveis,
        showCommands: showCommands,
        state: updatedState
      },
      intent: intent,
      confidence: confidence,
      entities: entities,
      categorias: eventos.length > 0 ? [] : categoriasDisponiveis,
    });

  } catch (error) {
    console.error('Erro no processMessageWithState:', error);

    const categoriasDisponiveis = await getAvailableCategories();

    res.status(500).json({
      success: false,
      error: error.message,
      reply: {
        text: 'Estou com dificuldades técnicas. Tente novamente em instantes! 🛠️',
        categorias: categoriasDisponiveis,
        showCommands: true
      },
      categorias: categoriasDisponiveis
    });
  }
};

// Health check
exports.healthCheck = async (req, res) => {
  try {
    await witClient.message('teste');
    const categorias = await getAvailableCategories();

    res.json({
      success: true,
      witai: 'conectado',
      database: 'conectado',
      categorias: categorias
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      witai: 'erro',
      database: 'erro',
      error: error.message
    });
  }
};

// Obter informações sobre intenções
exports.getIntentsInfo = async (req, res) => {
  try {
    const categorias = await getAvailableCategories();

    res.json({
      intents: [
        'buscar_eventos',
        'listar_categorias',
        'saudacao',
        'ajuda',
        'agradecimento',
        'responder_filtro',
        'selecionar_categoria'
      ],
      entities: ['categoria', 'localizacao', 'data', 'preco', 'quantidade'],
      categorias_disponiveis: categorias
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};