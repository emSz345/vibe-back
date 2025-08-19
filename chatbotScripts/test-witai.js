// test-witai.js (arquivo temporário para teste)
const axios = require('axios');
require('dotenv').config();

async function testWitAI() {
  try {
    const token = process.env.WIT_AI_SERVER_TOKEN;
    
    if (!token) {
      console.error('❌ Token não encontrado no .env');
      return;
    }

    console.log('🔑 Token encontrado:', token.substring(0, 10) + '...');
    
    const response = await axios.get(
      'https://api.wit.ai/message?v=20240520&q=Olá',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Conexão bem-sucedida!');
    console.log('Resposta:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Erro na conexão:');
    console.error('Mensagem:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Dados:', error.response.data);
    }
  }
}

testWitAI();