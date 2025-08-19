const express = require('express');
const router = express.Router();
const witaiController = require('../controllers/witaiController');

// Middleware para verificar se o token do Wit.ai está configurado
const checkWitaiConfig = (req, res, next) => {
  if (!process.env.WIT_AI_SERVER_TOKEN) {
    return res.status(500).json({
      success: false,
      error: 'Wit.ai não configurado. Defina WIT_AI_SERVER_TOKEN no .env'
    });
  }
  next();
};

// Rota principal para processar mensagens
router.post('/chat', checkWitaiConfig, witaiController.processMessage);

// Rota de saúde para verificar a conexão com Wit.ai
router.get('/health', checkWitaiConfig, witaiController.healthCheck);

// Rota para obter informações sobre as intenções
router.get('/intents', witaiController.getIntentsInfo);

module.exports = router;