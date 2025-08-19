const axios = require('axios');
require('dotenv').config();

async function testLocalizacao() {
  try {
    const response = await axios.get(
      `https://api.wit.ai/message?v=20240520&q=${encodeURIComponent('Eventos em São Paulo')}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.WIT_AI_SERVER_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Resposta completa:', JSON.stringify(response.data, null, 2));
    
    if (response.data.entities?.localizacao) {
      console.log('✅ Localização detectada:', response.data.entities.localizacao);
    } else {
      console.log('❌ Localização NÃO detectada');
      console.log('Intenções detectadas:', response.data.intents);
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  }
}

testLocalizacao();