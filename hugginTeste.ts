// vibe-back/hugginTeste.ts

import axios, { AxiosError } from 'axios';
import 'dotenv/config'; // ⬅️ Para carregar o .env (process.env.HUGGINGFACE_API_KEY)

(async () => {
  try {
    const model: string = 'bigscience/bloom-560m'; // ou outro que funcione
    
    console.log('Testando API Hugging Face com o modelo:', model);
    console.log('Chave API:', `...${(process.env.HUGGINGFACE_API_KEY || '').slice(-4)}`);

    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: "Olá, tudo bem?",
        parameters: {
          max_new_tokens: 50
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY as string}`
        }
      }
    );

    console.log('Resposta da API:', response.data);

  } catch (err: any) {
    // Tratamento de erro tipado
    if (axios.isAxiosError(err)) {
      console.error('Erro na requisição (Axios):', err.response?.data || err.message);
      if (err.response?.status === 401) {
        console.error('ERRO: Token (HUGGINGFACE_API_KEY) inválido ou ausente.');
      }
    } else {
      console.error('Erro desconhecido:', err.message);
    }
  }
})();