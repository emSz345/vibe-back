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
      // Cria carrinho vazio se não existir
      carrinho = new Carrinho({
        usuarioId: req.user.userId,
        itens: []
      });
      await carrinho.save();
    }

    res.status(200).json(carrinho);
  } catch (error) {
    console.error('Erro ao buscar carrinho:', error);
    res.status(500).json({ message: 'Erro ao buscar carrinho', error: error.message });
  }
});

// 🔥 ADICIONAR ITEM AO CARRINHO
router.post('/itens', authenticateToken, async (req, res) => {
  try {
    const { eventoId, tipoIngresso, quantidade } = req.body;

    // Verificar estoque
    const evento = await Event.findById(eventoId);
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }

    const estoqueDisponivel = tipoIngresso === 'Inteira' 
      ? evento.quantidadeInteira 
      : evento.quantidadeMeia;

    // Verificar itens já no carrinho
    let carrinho = await Carrinho.findOne({ usuarioId: req.user.userId });
    const itemExistente = carrinho?.itens.find(item => 
      item.eventoId.toString() === eventoId && item.tipoIngresso === tipoIngresso
    );

    const quantidadeTotal = (itemExistente?.quantidade || 0) + quantidade;

    if (quantidadeTotal > estoqueDisponivel) {
      return res.status(400).json({ 
        message: `Estoque insuficiente. Disponível: ${estoqueDisponivel}` 
      });
    }

    // Adicionar/atualizar item
    if (!carrinho) {
      carrinho = new Carrinho({ usuarioId: req.user.userId, itens: [] });
    }

    if (itemExistente) {
      // Atualizar quantidade do item existente
      carrinho.itens = carrinho.itens.map(item =>
        item.eventoId.toString() === eventoId && item.tipoIngresso === tipoIngresso
          ? { ...item.toObject(), quantidade: quantidadeTotal }
          : item
      );
    } else {
      // Adicionar novo item
      carrinho.itens.push({
        eventoId,
        nomeEvento: evento.nome,
        tipoIngresso,
        preco: tipoIngresso === 'Inteira' ? evento.valorIngressoInteira : evento.valorIngressoMeia,
        quantidade,
        imagem: evento.imagem,
        dataEvento: evento.dataInicio,
        localEvento: `${evento.rua}, ${evento.numero}, ${evento.bairro} - ${evento.cidade}, ${evento.estado}`
      });
    }

    await carrinho.save();
    
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
    
    const carrinho = await Carrinho.findOne({ usuarioId: req.user.userId });
    if (!carrinho) {
      return res.status(404).json({ message: 'Carrinho não encontrado' });
    }

    const item = carrinho.itens.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item não encontrado' });
    }

    // Verificar estoque
    const evento = await Event.findById(item.eventoId);
    const estoqueDisponivel = item.tipoIngresso === 'Inteira' 
      ? evento.quantidadeInteira 
      : evento.quantidadeMeia;

    if (quantidade > estoqueDisponivel) {
      return res.status(400).json({ 
        message: `Estoque insuficiente. Disponível: ${estoqueDisponivel}` 
      });
    }

    item.quantidade = quantidade;
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
    await Carrinho.findOneAndDelete({ usuarioId: req.user.userId });
    res.status(200).json({ message: 'Carrinho limpo com sucesso' });
  } catch (error) {
    console.error('Erro ao limpar carrinho:', error);
    res.status(500).json({ message: 'Erro ao limpar carrinho', error: error.message });
  }
});

module.exports = router;