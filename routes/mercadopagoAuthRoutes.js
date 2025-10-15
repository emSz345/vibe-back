// routes/mercadopagoAuthRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const Perfil = require('../models/Perfil'); // 🔥 CORREÇÃO 1: Importe o modelo de Perfil, não de User
const Event = require('../models/Event');
const { protect } = require('../authMiddleware');

// Configure as credenciais do Mercado Pago no seu arquivo .env
const MERCADOPAGO_CLIENT_ID = process.env.MERCADOPAGO_CLIENT_ID;
const MERCADOPAGO_CLIENT_SECRET = process.env.MERCADOPAGO_CLIENT_SECRET;
const REDIRECT_URI = process.env.MERCADOPAGO_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL; // Pega a URL do seu frontend

// Rota 1: Inicia o processo de conexão (seu código aqui já está perfeito)
router.post('/connect', async (req, res) => {
    try {
        const { userId } = req.body;
        const authUrl = `https://auth.mercadopago.com.br/authorization?client_id=${MERCADOPAGO_CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&state=${userId}`;
        res.status(200).json({ url: authUrl });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao gerar URL de autorização.' });
    }
});

// Rota 2: Rota de retorno (chamada pelo Mercado Pago)
router.get('/callback', async (req, res) => {
    const { code, state } = req.query; // 'state' contém o userId que enviamos

    if (!code || !state) {
        // Redireciona para o frontend com um status de erro
        return res.redirect(`${FRONTEND_URL}/perfil?status=error&message=auth_failed`);
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

        const { user_id } = response.data; // O ID da conta do vendedor do Mercado Pago

        // 🔥 CORREÇÃO 2: Salve o ID no documento de Perfil correto.
        // Usamos findOneAndUpdate com 'upsert: true' para criar o perfil se ele não existir.
        await Perfil.findOneAndUpdate(
            { userId: state }, // Encontra o perfil pelo ID do usuário
            { mercadoPagoAccountId: user_id }, // Define o ID da conta do MP
            { new: true, upsert: true } // Opções: retorna o doc atualizado e cria se não existir
        );

        // 🔥 CORREÇÃO 3: Redirecione o usuário para a URL do seu FRONTEND
        res.redirect(`${FRONTEND_URL}/perfil?status=success`);

    } catch (error) {
        console.error("Erro ao trocar o código de autorização:", error.response ? error.response.data : error.message);
        res.redirect(`${FRONTEND_URL}/perfil?status=error`);
    }
});

router.patch('/disconnect', protect, async (req, res) => {
    try {
        const userId = req.user.userId;

        // 🔥 LÓGICA DE NEGÓCIO: Verifica se o usuário tem eventos ativos
        const eventosAtivos = await Event.find({
            criadoPor: userId,
            // Procura por eventos que NÃO estão finalizados ou cancelados
            status: { $nin: ['finalizado', 'cancelado'] }
        });

        // Se encontrar qualquer evento ativo, bloqueia a ação
        if (eventosAtivos.length > 0) {
            return res.status(403).json({
                message: 'Você não pode desvincular sua conta pois possui eventos ativos. Por favor, finalize ou cancele seus eventos primeiro.'
            });
        }

        // Se não houver eventos ativos, prossegue com a desconexão
        const perfilAtualizado = await Perfil.findOneAndUpdate(
            { userId: userId },
            // Usa o operador $unset do MongoDB para remover completamente o campo
            { $unset: { mercadoPagoAccountId: "" } },
            { new: true }
        );

        if (!perfilAtualizado) {
            return res.status(404).json({ message: 'Perfil não encontrado.' });
        }

        res.status(200).json({ message: 'Conta do Mercado Pago desvinculada com sucesso.' });

    } catch (error) {
        console.error("Erro ao desvincular conta do Mercado Pago:", error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

module.exports = router;