const axios = require('axios');

(async () => {
  try {
    const model = 'bigscience/bloom-560m'; // ou outro que funcione
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
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`
        }
      }
    );

    console.log(response.data);
  } catch (err) {
    console.error('Erro na requisição:', err.response?.data || err.message);
  }
})();
