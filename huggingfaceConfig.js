// huggingfaceConfig.js
// Configuração simplificada para Hugging Face API
const axios = require('axios');

// Configuração da API do Hugging Face
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;
const HUGGINGFACE_API_URL = 'https://api-inference.huggingface.co/models';

// Modelos disponíveis para chatbot (apenas para referência)
const CHAT_MODELS = {
  DIALOGPT: 'microsoft/DialoGPT-medium',
  DIALOGPT_LARGE: 'microsoft/DialoGPT-large',
  GPT2: 'gpt2',
  GPT2_MEDIUM: 'gpt2-medium',
  GPT2_LARGE: 'gpt2-large',
  DISTILGPT: 'distilgpt2',
  BLOOM: 'bigscience/bloom',
  BLOOM_560M: 'bigscience/bloom-560m',
  BLOOM_1B7: 'bigscience/bloom-1b7',
  // Modelos em português
  PORTUGUESE_BERT: 'neuralmind/bert-base-portuguese-cased',
  PORTUGUESE_GPT: 'pierreguillou/gpt2-small-portuguese'
};

// Parâmetros padrão para geração de texto
const DEFAULT_PARAMETERS = {
  max_new_tokens: 150,
  temperature: 0.7,
  repetition_penalty: 1.1,
  top_p: 0.9,
  top_k: 50,
  do_sample: true,
  return_full_text: false,
  num_return_sequences: 1
};

// Função para fazer requisições à API do Hugging Face
async function queryHuggingFaceAPI(model, inputs, parameters = {}) {
  try {
    const response = await axios.post(
      `${HUGGINGFACE_API_URL}/${model}`,
      {
        inputs,
        parameters: { ...DEFAULT_PARAMETERS, ...parameters }
      },
      {
        headers: {
          'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 segundos timeout
      }
    );

    return response.data;
  } catch (error) {
    console.error('Erro na requisição para Hugging Face API:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    
    throw error;
  }
}

// Função para text generation
async function textGeneration(model, prompt, customParameters = {}) {
  return await queryHuggingFaceAPI(model, prompt, customParameters);
}

// Função para conversational (simulada)
async function conversational(model, messages, customParameters = {}) {
  // Construir prompt a partir das mensagens
  const prompt = messages.map(msg => {
    const role = msg.role === 'user' ? 'Usuário' : 'Assistente';
    return `${role}: ${msg.content}`;
  }).join('\n') + '\nAssistente:';

  return await queryHuggingFaceAPI(model, prompt, customParameters);
}

// Função para verificar se o modelo está carregado
async function checkModelStatus(model) {
  try {
    const response = await axios.get(
      `${HUGGINGFACE_API_URL}/${model}`,
      {
        headers: {
          'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`
        },
        timeout: 10000
      }
    );
    
    return {
      loaded: response.data.loaded || false,
      state: response.data.state,
      model: response.data.modelId
    };
  } catch (error) {
    console.error('Erro ao verificar status do modelo:', error.message);
    return { loaded: false, error: error.message };
  }
}

// Função para obter modelos recomendados
function getRecommendedModels() {
  return {
    recommended: CHAT_MODELS.DIALOGPT,
    alternatives: [
      CHAT_MODELS.DIALOGPT_LARGE,
      CHAT_MODELS.GPT2_MEDIUM,
      CHAT_MODELS.DISTILGPT
    ],
    portuguese: CHAT_MODELS.PORTUGUESE_GPT
  };
}

// Exportar configurações e funções
module.exports = {
  // Configurações
  HUGGINGFACE_API_KEY,
  HUGGINGFACE_API_URL,
  CHAT_MODELS,
  DEFAULT_PARAMETERS,
  
  // Funções principais
  queryHuggingFaceAPI,
  textGeneration,
  conversational,
  
  // Funções utilitárias
  checkModelStatus,
  getRecommendedModels,
  
  // Métodos de conveniência
  async generateText(prompt, model = CHAT_MODELS.DIALOGPT, params = {}) {
    return await textGeneration(model, prompt, params);
  },
  
  // Health check
  async healthCheck() {
    try {
      const status = await checkModelStatus(CHAT_MODELS.DIALOGPT);
      return {
        api: 'Hugging Face',
        status: status.loaded ? 'healthy' : 'degraded',
        model: CHAT_MODELS.DIALOGPT,
        details: status
      };
    } catch (error) {
      return {
        api: 'Hugging Face',
        status: 'unhealthy',
        error: error.message
      };
    }
  }
};