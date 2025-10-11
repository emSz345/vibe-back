const express = require('express');
const router = express.Router();
const Carrinho = require('../models/Carrinho');
const Event = require('../models/Event');
const authenticateToken = require('../authMiddleware');

// 🔥 OBTER CARRINHO DO USUÁRIO
router.get('/', authenticateToken, async (req, res) => {
    try {
        let carrinho = await Carrinho.findOne({ usuarioId: req.user.userId })
            .populate('itens.eventoId', 'nome imagem quantidadeInteira quantidadeMeia');

        if (!carrinho) {
            // Usa findOneAndUpdate com upsert para garantir a atomicidade e evitar duplicação
            carrinho = await Carrinho.findOneAndUpdate(
                { usuarioId: req.user.userId },
                { $setOnInsert: { itens: [] } },
                { new: true, upsert: true }
            );
        }

        res.status(200).json(carrinho);
    } catch (error) {
        console.error('Erro ao buscar carrinho:', error);
        res.status(500).json({ message: 'Erro ao buscar carrinho', error: error.message });
    }
});

// 🔥 ADICIONAR ITEM AO CARRINHO (Corrigido com validação e Upsert)
router.post('/itens', authenticateToken, async (req, res) => {
    try {
        const { eventoId, tipoIngresso, quantidade } = req.body;
        const userId = req.user.userId;

        // 1. Validar Evento e Estoque Disponível
        const evento = await Event.findById(eventoId);
        if (!evento) {
            return res.status(404).json({ message: 'Evento não encontrado' });
        }

        const estoqueDisponivel = tipoIngresso === 'Inteira'
            ? evento.quantidadeInteira
            : evento.quantidadeMeia;

        // Pré-validação de estoque: busca o carrinho para checar a quantidade atual
        let carrinhoAtual = await Carrinho.findOne({ usuarioId: userId });
        const itemExistente = carrinhoAtual?.itens.find(item =>
            item.eventoId.toString() === eventoId && item.tipoIngresso === tipoIngresso
        );

        const quantidadeAtualNoCarrinho = itemExistente?.quantidade || 0;
        const quantidadeTotalAposAdicao = quantidadeAtualNoCarrinho + quantidade;

        if (quantidadeTotalAposAdicao > estoqueDisponivel) {
            return res.status(400).json({
                message: `Estoque insuficiente. Quantidade desejada: ${quantidadeTotalAposAdicao}. Disponível: ${estoqueDisponivel}`
            });
        }
        
        // 2. Tenta encontrar o item e ATUALIZAR (incrementar a quantidade)
        let carrinho = await Carrinho.findOneAndUpdate(
            {
                usuarioId: userId,
                'itens.eventoId': eventoId,
                'itens.tipoIngresso': tipoIngresso
            },
            {
                $inc: { 'itens.$.quantidade': quantidade } // Incrementa se encontrado
            },
            { new: true }
        );

        if (carrinho) {
            // Item existente foi atualizado com sucesso. Retorna.
            const carrinhoPopulado = await Carrinho.findById(carrinho._id)
                .populate('itens.eventoId', 'nome imagem quantidadeInteira quantidadeMeia');
            return res.status(200).json(carrinhoPopulado);
        }

        // 3. Se não encontrou o item, tenta encontrar o carrinho e ADICIONAR o novo item (ou cria o carrinho)
        const novoItem = {
            eventoId,
            nomeEvento: evento.nome,
            tipoIngresso,
            preco: tipoIngresso === 'Inteira' ? evento.valorIngressoInteira : evento.valorIngressoMeia,
            quantidade,
            imagem: evento.imagem,
            dataEvento: evento.dataInicio,
            localEvento: `${evento.rua}, ${evento.numero}, ${evento.bairro} - ${evento.cidade}, ${evento.estado}`
        };

        carrinho = await Carrinho.findOneAndUpdate(
            { usuarioId: userId },
            {
                $push: { itens: novoItem }, // Adiciona novo item ao array
                $setOnInsert: { usuarioId: userId } // Garante que o ID do usuário é setado se for um INSERT
            },
            { new: true, upsert: true } // CRÍTICO: Cria o carrinho se não existir
        );

        const carrinhoPopulado = await Carrinho.findById(carrinho._id)
            .populate('itens.eventoId', 'nome imagem quantidadeInteira quantidadeMeia');

        res.status(200).json(carrinhoPopulado);

    } catch (error) {
        console.error('Erro ao adicionar item:', error);
        res.status(500).json({ message: 'Erro ao adicionar item', error: error.message });
    }
});

// 🔥 ATUALIZAR QUANTIDADE
router.put('/itens/:itemId', authenticateToken, async (req, res) => {
    try {
        const { quantidade } = req.body;
        const userId = req.user.userId;

        // 1. Busca o carrinho
        const carrinho = await Carrinho.findOne({ usuarioId: userId });
        if (!carrinho) {
            return res.status(404).json({ message: 'Carrinho não encontrado' });
        }

        const itemIndex = carrinho.itens.findIndex(item => item._id.toString() === req.params.itemId);
        if (itemIndex === -1) {
            return res.status(404).json({ message: 'Item não encontrado' });
        }

        const item = carrinho.itens[itemIndex];

        // 2. Verifica estoque
        const evento = await Event.findById(item.eventoId);
        if (!evento) {
            return res.status(404).json({ message: 'Evento do item não encontrado' });
        }

        const estoqueDisponivel = item.tipoIngresso === 'Inteira'
            ? evento.quantidadeInteira
            : evento.quantidadeMeia;

        if (quantidade > estoqueDisponivel) {
            return res.status(400).json({
                message: `Estoque insuficiente para ${quantidade} ingressos. Disponível: ${estoqueDisponivel}`
            });
        }

        // 3. Atualiza e salva
        carrinho.itens[itemIndex].quantidade = quantidade;
        await carrinho.save();

        res.status(200).json(carrinho);
    } catch (error) {
        console.error('Erro ao atualizar item:', error);
        res.status(500).json({ message: 'Erro ao atualizar item', error: error.message });
    }
});

// 🔥 REMOVER ITEM
router.delete('/itens/:itemId', authenticateToken, async (req, res) => {
    try {
        const carrinho = await Carrinho.findOne({ usuarioId: req.user.userId });
        if (!carrinho) {
            return res.status(404).json({ message: 'Carrinho não encontrado' });
        }

        // Remove o item do array de subdocumentos
        carrinho.itens = carrinho.itens.filter(item => item._id.toString() !== req.params.itemId);
        await carrinho.save();

        res.status(200).json(carrinho);
    } catch (error) {
        console.error('Erro ao remover item:', error);
        res.status(500).json({ message: 'Erro ao remover item', error: error.message });
    }
});

// 🔥 LIMPAR CARRINHO
router.delete('/', authenticateToken, async (req, res) => {
    try {
        // Deleta o documento inteiro do carrinho
        await Carrinho.findOneAndDelete({ usuarioId: req.user.userId });
        res.status(200).json({ message: 'Carrinho limpo com sucesso' });
    } catch (error) {
        console.error('Erro ao limpar carrinho:', error);
        res.status(500).json({ message: 'Erro ao limpar carrinho', error: error.message });
    }
});

module.exports = router;