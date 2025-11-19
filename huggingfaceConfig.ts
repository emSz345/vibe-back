// vibe-back/huggingfaceConfig.ts
import axios, { AxiosError } from 'axios';

// --- Interfaces para a API ---

// Parâmetros de geração de texto
export interface IHuggingFaceParams {
  max_new_tokens?: number;
  temperature?: number;
  repetition_penalty?: number;
  top_p?: number;
  top_k?: number;
  do_sample?: boolean;
  return_full_text?: boolean;
  num_return_sequences?: number;
}

// Mensagem para o modelo de conversação
export interface IConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// 🔥 NOVO: Define a "forma" da resposta da API de status
export interface IHuggingFaceModelStatusResponse {
  loaded: boolean;
  state: string;
  modelId: string;
  // (pode ter outros campos, mas só usamos estes)
}

// Resposta do status do modelo
export interface IModelStatus {
  loaded: boolean;
  state?: string;
  model?: string;
  error?: string;
}

// Resposta do health check
export interface IHealthCheckStatus {
  api: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  model?: string;
  details?: IModelStatus;
  error?: string;
}

// --- Fim das Interfaces ---

export const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY as string;
export const HUGGINGFACE_API_URL = 'https://api-inference.huggingface.co/models';

export const CHAT_MODELS: { [key: string]: string } = {

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

export const DEFAULT_PARAMETERS: IHuggingFaceParams = {
  max_new_tokens: 150,
  temperature: 0.7,
  repetition_penalty: 1.1,
  top_p: 0.9,
  top_k: 50,
  do_sample: true,
  return_full_text: false,
  num_return_sequences: 1
};

export async function queryHuggingFaceAPI(model: string, inputs: any, parameters: IHuggingFaceParams = {}): Promise<any> {
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
        timeout: 30000
      }
    );
    return response.data;

  } catch (error: any) {
    console.error('Erro na requisição para Hugging Face API:', error.message);
    // ✅ Agora 'isAxiosError' vai funcionar (após o 'npm uninstall')
    if (axios.isAxiosError(error)) {
      console.error('Status:', error.response?.status);
      console.error('Data:', error.response?.data);
    }
    throw error;
  }
}

export async function textGeneration(model: string, prompt: string, customParameters: IHuggingFaceParams = {}): Promise<any> {
  return await queryHuggingFaceAPI(model, prompt, customParameters);
}

export async function conversational(model: string, messages: IConversationMessage[], customParameters: IHuggingFaceParams = {}): Promise<any> {
  const prompt = messages.map(msg => {
    const role = msg.role === 'user' ? 'Usuário' : 'Assistente';
    return `${role}: ${msg.content}`;
  }).join('\n') + '\nAssistente:';

  return await queryHuggingFaceAPI(model, prompt, customParameters);
}

export async function checkModelStatus(model: string): Promise<IModelStatus> {
  try {
    // 🔥 MUDANÇA AQUI: Dizemos ao Axios qual o formato da resposta
    const response = await axios.get<IHuggingFaceModelStatusResponse>(
      `${HUGGINGFACE_API_URL}/${model}`,
      {
        headers: { 'Authorization': `Bearer ${HUGGINGFACE_API_KEY}` },
        timeout: 10000
      }
    );

    // ✅ Agora o TypeScript sabe o que é 'response.data'
    return {
      loaded: response.data.loaded || false,
      state: response.data.state,
      model: response.data.modelId
    };
  } catch (error: any) {
    console.error('Erro ao verificar status do modelo:', error.message);
    return { loaded: false, error: error.message };
  }
}

export function getRecommendedModels(): { recommended: string; alternatives: string[]; portuguese: string } {
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

export async function generateText(prompt: string, model: string = CHAT_MODELS.DIALOGPT, params: IHuggingFaceParams = {}): Promise<any> {
  return await textGeneration(model, prompt, params);
}

export async function healthCheck(): Promise<IHealthCheckStatus> {
  try {
    const status = await checkModelStatus(CHAT_MODELS.DIALOGPT);
    return {
      api: 'Hugging Face',
      status: status.loaded ? 'healthy' : 'degraded',
      model: CHAT_MODELS.DIALOGPT,
      details: status
    };
  } catch (error: any) {
    return {
      api: 'Hugging Face',
      status: 'unhealthy',
      error: error.message
    };
  }
}