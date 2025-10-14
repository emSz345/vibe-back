// Arquivo: routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, checkPermission } = require('../authMiddleware');

// Importe seus controllers. Se não os tiver, você precisará criá-los.
// const dashboardController = require('../controllers/dashboardController');
// const carouselController = require('../controllers/carouselController');

// -------------------------------------------------------------------
// ROTA 1: ATUALIZAR A ROLE DE UM USUÁRIO (Já está correta)
// -------------------------------------------------------------------
// Acessível apenas por: SUPER_ADMIN
router.patch(
    '/update-role',
    protect,
    checkPermission(['SUPER_ADMIN']),
    async (req, res) => {
        // Lógica de atualização de role
        const { email, newRole } = req.body;
        if (!email || !newRole) {
            return res.status(400).json({ message: 'Email e a nova role são obrigatórios.' });
        }
        const allowedRoles = ['USER', 'MANAGER_SITE', 'SUPER_ADMIN'];
        if (!allowedRoles.includes(newRole)) {
            return res.status(400).json({ message: 'A role fornecida é inválida.' });
        }
        try {
            const userToUpdate = await User.findOneAndUpdate({ email }, { role: newRole }, { new: true });
            if (!userToUpdate) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
            res.status(200).json({ message: `Usuário ${email} atualizado para a role ${newRole} com sucesso.` });
        } catch (error) {
            res.status(500).json({ message: 'Erro interno do servidor.' });
        }
    }
);

// -------------------------------------------------------------------
// ROTA 2: LISTAR OS USUÁRIOS PARA A TELA 'AdicionarAdm.tsx' (Já está correta)
// -------------------------------------------------------------------
// Acessível apenas por: SUPER_ADMIN
router.get(
    '/users', // Rota para buscar todos os usuários
    protect,
    checkPermission(['SUPER_ADMIN']),
    async (req, res) => {
        try {
            const users = await User.find().select('nome email role'); 
            res.status(200).json(users);
        } catch (error) {
            res.status(500).json({ message: 'Erro ao buscar usuários.' });
        }
    }
);

// -------------------------------------------------------------------
// ROTA 3: BUSCAR DADOS PARA O 'Painel.tsx' (Já está correta)
// -------------------------------------------------------------------
// Acessível por: SUPER_ADMIN e MANAGER_SITE
router.get(
    '/painel',
    protect,
    checkPermission(['SUPER_ADMIN', 'MANAGER_SITE']),
    async (req, res) => {
        // Lógica para buscar dados reais do painel deve ser implementada aqui
        res.status(200).json({
            message: 'Dados do painel principal',
            totalUsuarios: 150,
            totalVendas: 5432.10
        });
    }
);

// -------------------------------------------------------------------
// ROTA 4: ATUALIZAR DADOS DO 'CarroselAdm.tsx' (CORRIGIDA)
// -------------------------------------------------------------------
// Acessível por: SUPER_ADMIN e MANAGER_SITE
router.put(
    '/carrossel',
    protect,
    // 🔥 CORREÇÃO AQUI: Adicionado 'SUPER_ADMIN' para permitir seu acesso
    checkPermission(['SUPER_ADMIN', 'MANAGER_SITE']),
    async (req, res) => {
        // Lógica para atualizar o carrossel no banco de dados deve ser implementada aqui
        const { novasImagens } = req.body;
        console.log('Atualizando carrossel com:', novasImagens);
        res.status(200).json({ message: 'Carrossel atualizado com sucesso!' });
    }
);

module.exports = router;