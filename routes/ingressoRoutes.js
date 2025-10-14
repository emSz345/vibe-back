// vibe-back/routes/ingressoRoutes.js

const express = require('express');
const router = express.Router();
// CORREÇÃO 1: Importar usando desestruturação { }
const { protect } = require('../authMiddleware');
const Ingresso = require('../models/ingresso');
const User = require('../models/User');
const { enviarEmailIngresso } = require('../utils/emailService');

// ROTA: POST /api/ingressos/send-email
router.post('/send-email', protect, async (req, res) => {

    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'MANAGER_SITE') {
        return res.status(403).json({ message: 'Administradores não podem adicionar itens ao carrinho.' });
    }

    const { ingressoId } = req.body;
    // CORREÇÃO 2: Acessar a propriedade 'userId' dentro do objeto 'req.user'
    const userId = req.user.userId;

    if (!ingressoId) {
        return res.status(400).json({ message: 'O ID do ingresso é obrigatório.' });
    }

    try {
        // 1. Busca o ingresso no banco de dados
        const ingresso = await Ingresso.findById(ingressoId);

        // 2. Validação de segurança: Verifica se o ingresso existe e se pertence ao usuário logado
        if (!ingresso || ingresso.userId.toString() !== userId) {
            return res.status(404).json({ message: 'Ingresso não encontrado ou não pertence a este usuário.' });
        }

        // 3. Busca os dados do usuário para obter nome e e-mail
        const usuario = await User.findById(userId);
        if (!usuario) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // 4. Chama o serviço de e-mail para enviar o ingresso
        await enviarEmailIngresso(usuario, ingresso);

        // 5. Retorna sucesso
        res.status(200).json({ message: 'E-mail do ingresso enviado com sucesso!' });

    } catch (error) {
        console.error('Erro ao enviar e-mail do ingresso:', error);
        res.status(500).json({ message: 'Ocorreu um erro no servidor ao tentar enviar o e-mail.' });
    }
});

module.exports = router;