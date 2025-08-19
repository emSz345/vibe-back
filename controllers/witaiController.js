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

// Função para processar a resposta do Wit.ai
function processWitResponse(data) {
  console.log('Resposta Wit.ai:', JSON.stringify(data, null, 2));

  if (data.entities && (data.entities.evento || data.entities.categoria)) {
    return 'Gostaria de saber mais sobre eventos? Posso te ajudar a encontrar shows, festas e outros eventos! 🎉';
  }

  if (!data.intents || data.intents.length === 0) {
    return 'Desculpe, não entendi. Pode reformular?';
  }

  const intent = data.intents[0].name;
  const confidence = data.intents[0].confidence;

  // Confiança mínima de 0.5 para considerar a intenção
  if (confidence < 0.5) {
    return 'Não tenho certeza do que você quer dizer. Pode explicar de outra forma?';
  }

  // Respostas baseadas na intenção
  const responses = {
    saudacao: [
      'E aí! 🎧 Bora subir essa vibe hoje?',
      'Oi! Tudo bem? Em que posso ser útil?',
      'Olá! É um prazer conversar com você!'
    ],
    despedida: [
      'Até logo! Foi ótimo conversar com você! 👋',
      'Tchau! Volte sempre que precisar!',
      'Até mais! Espero ter ajudado!'
    ],
    ajuda: [
      'Claro! Posso ajudar com informações sobre a NaVibe. O que você gostaria de saber?',
      'Estou aqui para ajudar! Do que você precisa?',
      'Pergunte à vontade! Farei o possível para ajudar.'
    ],
     evento_pergunta: (entities) => {
    if (entities?.localizacao) {
      return `Vou buscar eventos em ${entities.localizacao[0].value} para você! 🗺️`;
    }
  },
    evento_pergunta: [
      'Temos vários eventos incríveis! Quer saber sobre algum específico?',
      'Os eventos da NaVibe são sempre animados! Qual você quer conhecer?',
      'Temos uma programação diversificada. Tem interesse em algum tipo de evento?'
    ],
    evento_busca: [
      'Vou buscar os melhores eventos para você! 🎪',
      'Deixa eu ver o que temos de bom acontecendo...',
      'Hmm, vamos encontrar uns eventos tops!'
    ],
    evento_proximos: [
      'Deixa eu ver os próximos eventos... 📅',
      'Vou listar os eventos que estão por vir!',
      'Confere aqui os próximos rolês!'
    ],
    produto_pergunta: [
      'Temos diversos produtos! 🎵 Quer saber sobre CDs, vinis ou merchandising?',
      'Nossa loja tem várias opções! Qual produto te interessa?',
      'Temos desde discos até roupas! Sobre qual item quer saber?'
    ],
    default: 'Interessante! Sobre a NaVibe, posso te ajudar com informações sobre eventos, produtos e muito mais!'
  };

  const randomResponse = (responsesArray) =>
    responsesArray[Math.floor(Math.random() * responsesArray.length)];

  return responses[intent]
    ? randomResponse(responses[intent])
    : responses.default;
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

      // Processar a resposta do Wit.ai
      let botReply = processWitResponse(witData);

      console.log('Resposta processada:', botReply);

      let eventos = null;
      if (witData.intents?.[0]?.name === 'evento_pergunta' ||
        witData.intents?.[0]?.name === 'evento_busca' ||
        witData.intents?.[0]?.name === 'evento_proximos' ||
        witData.intents?.[0]?.name === 'evento_localizacao' || // ← Nova intenção
        witData.entities?.evento ||
        witData.entities?.categoria ||
        witData.entities?.localizacao) {


        const filter = { status: 'aprovado' };

        if (witData.entities?.categoria?.[0]?.value) {
          filter.categoria = witData.entities.categoria[0].value;
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
        reply: botReply,
        intent: witData.intents?.[0]?.name || 'unknown',
        confidence: witData.intents?.[0]?.confidence || 0,
        entities: witData.entities || {},
        eventos: eventos || []
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