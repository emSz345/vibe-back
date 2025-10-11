// routes/mercadopagoAuthRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User'); // Importe seu modelo de usuário

// Configure as credenciais do Mercado Pago no seu arquivo .env
const MERCADOPAGO_CLIENT_ID = process.env.MERCADOPAGO_CLIENT_ID;
const MERCADOPAGO_CLIENT_SECRET = process.env.MERCADOPAGO_CLIENT_SECRET;
const REDIRECT_URI = process.env.MERCADOPAGO_REDIRECT_URI;

// Rota 1: Inicia o processo de conexão (chamada pelo frontend)
router.post('/connect', async (req, res) => {
    try {
        const { userId } = req.body;
        
        // Crie a URL de autorização com os dados do Mercado Pago
        const authUrl = `https://auth.mercadopago.com.br/authorization?client_id=${MERCADOPAGO_CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&state=${userId}`;

        res.status(200).json({ url: authUrl });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao gerar URL de autorização.' });
    }
});

// Rota 2: Rota de retorno (chamada pelo Mercado Pago)
// Esta rota deve ser configurada como "Redirect URI" no seu painel de dev do Mercado Pago
router.get('/callback', async (req, res) => {
    const { code, state } = req.query; // 'state' contém o userId que enviamos

    if (!code || !state) {
        return res.status(400).send('Código de autorização ou estado não fornecido.');
    }

    try {
        // Troque o código de autorização por um Access Token
        const response = await axios.post('https://api.mercadopago.com/oauth/token', {
            client_id: MERCADOPAGO_CLIENT_ID,
            client_secret: MERCADOPAGO_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI
        });

        const { access_token, user_id } = response.data;

        // Salve o user_id da conta do Mercado Pago no perfil do seu usuário
        await User.findByIdAndUpdate(state, { mercadopago_account_id: user_id }, { new: true });

        // Redirecione o usuário de volta para a página de perfil do seu site
        res.redirect('/perfil?status=success'); 

    } catch (error) {
        console.error("Erro ao trocar o código de autorização:", error);
        res.redirect('/perfil?status=error');
    }
});

module.exports = router;