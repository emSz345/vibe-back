const axios = require('axios');
const Event = require('../models/Event');



function extractLocalizacaoManual(text) {
  const localizacoes = [
    'são paulo', 'sao paulo', 'sp',
    'rio de janeiro', 'rio', 'rj',
    'minas gerais', 'mg', 'belo horizonte', 'bh',
    'bahia', 'ba', 'salvador',
    'paraná', 'pr', 'curitiba',
    'rio grande do sul', 'rs', 'porto alegre',
    'pernambuco', 'pe', 'recife',
    'ceará', 'ce', 'fortaleza',
    // adicione mais cidades/estados conforme necessário
  ];

  const textLower = text.toLowerCase();

  for (const loc of localizacoes) {
    if (textLower.includes(loc)) {
      return loc;
    }
  }

  return null;
}


function extractCategoriaManual(text) {
  const categoriasComuns = [
    'rock', 'sertanejo', 'funk', 'pop', 'eletrônica', 'eletronica',
    'mpb', 'samba', 'pagode', 'forró', 'forro', 'rap', 'hip hop',
    'reggae', 'jazz', 'blues', 'clássica', 'classica', 'gospel',
    "show"
  ];

  const textLower = text.toLowerCase();

  for (const cat of categoriasComuns) {
    if (textLower.includes(cat)) {
      return cat;
    }
  }

  return null;
}
// Função para processar a resposta do Wit.ai
// Função melhorada para processar respostas
function processWitResponse(data) {
  console.log('Resposta Wit.ai:', JSON.stringify(data, null, 2));

  if (!data.intents || data.intents.length === 0) {
    return {
      text: 'Desculpe, não entendi. Pode reformular ou escolher uma opção abaixo? 🤔',
      showCommands: true
    };
  }

  const intent = data.intents[0].name;
  const confidence = data.intents[0].confidence;

  // Confiança mínima de 0.5
  if (confidence < 0.5) {
    return {
      text: 'Não tenho certeza do que você quer dizer. Que tal usar um dos comandos abaixo?',
      showCommands: true
    };
  }

  // Respostas mais ricas e contextualizadas
  const responses = {
    saudacao: {
      text: 'E aí! 🎧 Bora subir essa vibe hoje? Sou seu assistente da NaVibe! 🚀',
      showCommands: true
    },
    despedida: {
      text: 'Até logo! Foi ótimo conversar com você! 👋 Volte sempre que precisar!',
      showCommands: false
    },
    ajuda: {
      text: 'Claro! Posso ajudar com:\n• 📅 Informações sobre eventos\n• 🎵 Buscar eventos por categoria\n• 🌆 Eventos por cidade\n• 🎫 Detalhes de ingressos\n• ❓ Dúvidas gerais',
      showCommands: true
    },
    evento_pergunta: (entities) => {
      if (entities?.localizacao) {
        return {
          text: `🎪 Vou buscar eventos em ${entities.localizacao[0].value.toUpperCase()} para você! 🗺️`,
          showCommands: false
        };
      }
      return {
        text: 'Não consegui encontrar o evento',
        showCommands: true
      };
    },
    evento_busca: {
      text: '🔍 Buscando os melhores eventos para você...',
      showCommands: false
    },
    categorias_pergunta: {
      text: 'Vou buscar as categorias disponíveis para você! 🎵',
      showCommands: false
    },
    evento_proximos: {
      text: '📅 Listando os próximos eventos imperdíveis!',
      showCommands: false
    },
    evento_localizacao: (entities) => {
      const local = entities?.localizacao?.[0]?.value || 'essa região';
      return {
        text: `🌍 Procurando eventos em ${local.toUpperCase()}...`,
        showCommands: false
      };
    },
    evento_categoria: (entities) => {
      const categoria = entities?.categoria?.[0]?.value || 'essa categoria';
      return {
        text: `🎵 Buscando eventos de ${categoria}...`,
        showCommands: false
      };
    },
    default: {
      text: 'Interessante! Posso te ajudar com eventos, categorias, cidades ou informações gerais! 🎪',
      showCommands: true
    }
  };



  const getResponse = () => {
    if (typeof responses[intent] === 'function') {
      return responses[intent](data.entities);
    }
    return responses[intent] || responses.default;
  };

  return getResponse();
}

// Controlador principal para o Wit.ai
const witaiController = {
  processMessage: async (req, res) => {
    try {
      const { message } = req.body;

      console.log('Recebida mensagem:', message);

      if (!message || message.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Mensagem não pode estar vazia'
        });
      }

      // Verifica se o token está configurado
      if (!process.env.WIT_AI_SERVER_TOKEN) {
        console.error('WIT_AI_SERVER_TOKEN não está configurado');
        return res.status(500).json({
          success: false,
          error: 'Serviço de chat não configurado'
        });
      }

      // Chamada para a API do Wit.ai
      const response = await axios.get(
        `https://api.wit.ai/message?v=20240520&q=${encodeURIComponent(message)}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.WIT_AI_SERVER_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 segundos de timeout
        }
      );

      const witData = response.data;

      if (!witData.intents || witData.intents.length === 0) {
        console.log('Nenhuma intenção detectada - aplicando fallback...');
        
        // Verifica se há palavras-chave de eventos na mensagem
        const hasEventKeywords = /evento|show|festival|concerto|festa|musica|banda|dj|shows|eventos/i.test(witData.text);
        const hasCategoria = extractCategoriaManual(witData.text);
        const hasLocalizacao = extractLocalizacaoManual(witData.text);
        
        if (hasEventKeywords || hasCategoria || hasLocalizacao) {
          console.log('Fallback: Detectadas palavras-chave de evento');
          // Força a intenção de busca de eventos
          witData.intents = [{ name: 'evento_busca', confidence: 0.6 }];
        }
      }

      // Processar a resposta do Wit.ai
      let botReply = processWitResponse(witData);

      console.log('Resposta processada:', botReply);

      let eventos = null;
      let categorias = null;

      if (witData.intents?.[0]?.name === 'categorias_pergunta') {
        categorias = await Event.distinct('categoria', { status: 'aprovado' });
        console.log('Categorias encontradas:', categorias);

        botReply = {
          text: `Encontrei ${categorias.length} categorias disponíveis! 🎵`,
          showCommands: false
        };
      }
      else if (witData.intents?.[0]?.name === 'evento_pergunta' ||
        witData.intents?.[0]?.name === 'evento_busca' ||
        witData.intents?.[0]?.name === 'evento_proximos' ||
        witData.intents?.[0]?.name === 'evento_localizacao' ||
        witData.intents?.[0]?.name === 'evento_categoria' || // ← Adicione esta linha
        witData.entities?.evento ||
        witData.entities?.categoria ||
        witData.entities?.localizacao ||
        extractCategoriaManual(witData.text) || // ← Adicione esta condição
        extractLocalizacaoManual(witData.text)) { 

        const filter = { status: 'aprovado' };

        if (witData.entities?.categoria?.[0]?.value) {
          filter.categoria = witData.entities.categoria[0].value;
        } else {
          console.log('Texto original:', witData.text);
          console.log('Categoria detectada pelo Wit:', witData.entities?.categoria?.[0]?.value);
          console.log('Categoria extraída manualmente:', extractCategoriaManual(witData.text));
          console.log('Filtro final aplicado:', filter);
          const categoriaManual = extractCategoriaManual(witData.text);
          if (categoriaManual) {
             filter.categoria = { $regex: categoriaManual, $options: 'i' };
          }
        }

        let localizacao = null;
        if (witData.entities?.localizacao?.[0]?.value) {
          localizacao = witData.entities.localizacao[0].value;
        } else {
          // Fallback: extrair localização manualmente do texto
          localizacao = extractLocalizacaoManual(witData.text);
        }

        if (localizacao) {
          filter.$or = [
            { cidade: { $regex: localizacao, $options: 'i' } },
            { estado: { $regex: localizacao, $options: 'i' } }
          ];
        }

        if (witData.entities?.localizacao?.[0]?.value) {
          const localizacao = witData.entities.localizacao[0].value;

          // Buscar tanto por cidade quanto por estado
          filter.$or = [
            { cidade: { $regex: localizacao, $options: 'i' } },
            { estado: { $regex: localizacao, $options: 'i' } }
          ];
        }

        filter.dataInicio = { $gte: new Date().toISOString().split('T')[0] };

        eventos = await Event.find(filter)
          .sort({ dataInicio: 1 })
          .limit(5);

        console.log('Eventos encontrados:', eventos.length);
        console.log('Filtro utilizado:', filter);
        console.log('Localização detectada:', localizacao);


      }

      res.json({
        success: true,
        reply: botReply, // Agora é um objeto {text, showCommands}
        intent: witData.intents?.[0]?.name || 'unknown',
        confidence: witData.intents?.[0]?.confidence || 0,
        entities: witData.entities || {},
        eventos: eventos || [],
        categorias: categorias || []
      });

    } catch (error) {
      console.error('Erro Wit.ai:', error.message);
      console.error('Detalhes do erro:', error.response?.data || 'Sem dados de resposta');
      console.error('Status do erro:', error.response?.status);

      res.status(500).json({
        success: false,
        error: 'Erro ao processar mensagem',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Rota de saúde para verificar se o Wit.ai está funcionando
  healthCheck: async (req, res) => {
    try {
      // Verifica se o token está configurado
      if (!process.env.WIT_AI_SERVER_TOKEN) {
        return res.status(500).json({
          success: false,
          error: 'WIT_AI_SERVER_TOKEN não está configurado'
        });
      }

      // Testa uma mensagem simples para verificar a conexão
      const response = await axios.get(
        `https://api.wit.ai/message?v=20240520&q=Olá`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.WIT_AI_SERVER_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      res.json({
        success: true,
        status: 'Wit.ai conectado com sucesso',
        intent: response.data.intents?.[0]?.name || 'none'
      });
    } catch (error) {
      console.error('Erro no health check:', error.message);
      res.status(500).json({
        success: false,
        error: 'Falha na conexão com Wit.ai',
        details: error.message
      });
    }
  },

  // Endpoint para obter informações sobre as intenções configuradas
  getIntentsInfo: (req, res) => {
    res.json({
      success: true,
      intents: [
        {
          name: 'saudacao',
          description: 'Saudações e cumprimentos',
          examples: ['oi', 'olá', 'bom dia', 'e aí']
        },
        {
          name: 'despedida',
          description: 'Despedidas',
          examples: ['tchau', 'até logo', 'flw', 'valeu']
        },
        {
          name: 'ajuda',
          description: 'Pedidos de ajuda',
          examples: ['preciso de ajuda', 'como funciona', 'me ajude']
        },
        {
          name: 'evento_pergunta',
          description: 'Perguntas sobre eventos',
          examples: ['quais eventos', 'programação', 'shows']
        },
        {
          name: 'produto_pergunta',
          description: 'Perguntas sobre produtos',
          examples: ['produtos', 'cds', 'vinis', 'merchandising']
        }
      ]
    });
  }
};

module.exports = witaiController;