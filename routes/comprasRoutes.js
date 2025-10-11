const express = require('express');
const router = express.Router();
const Compra = require('../models/Compra');
const Event = require('../models/Event');
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token de acesso necessário' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido' });
    }

    if (!decoded.userId && !decoded.id) {
      return res.status(403).json({ message: 'Estrutura do token inválida' });
    }

    req.user = {
      userId: decoded.userId || decoded.id
    };

    next();
  });
};

// eventRoutes.js - Adicione esta rota
router.get('/verificar-estoque/:id', async (req, res) => {
  try {
    const evento = await Event.findById(req.params.id);
    if (!evento) {
      return res.status(404).json({ message: 'Evento não encontrado' });
    }
    res.status(200).json({
      quantidadeInteira: evento.quantidadeInteira,
      quantidadeMeia: evento.quantidadeMeia
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao verificar estoque', error: error.message });
  }
});

// Rota para criar uma nova compra
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { itens, total } = req.body;
    const usuarioId = req.user.userId;

    if (!itens || itens.length === 0) {
      return res.status(400).json({ message: 'Nenhum item no carrinho' });
    }

    // Verificar disponibilidade dos ingressos
    for (const item of itens) {
      const evento = await Event.findById(item.eventoId);
      if (!evento) {
        return res.status(404).json({ message: `Evento ${item.nomeEvento} não encontrado` });
      }

      if (item.tipoIngresso === 'Inteira') {
        if (evento.quantidadeInteira < item.quantidade) {
          return res.status(400).json({ 
            message: `Quantidade indisponível para ingresso Inteira no evento ${item.nomeEvento}` 
          });
        }
      } else if (item.tipoIngresso === 'Meia') {
        if (evento.quantidadeMeia < item.quantidade) {
          return res.status(400).json({ 
            message: `Quantidade indisponível para ingresso Meia no evento ${item.nomeEvento}` 
          });
        }
      }
    }

    // Atualizar quantidades disponíveis
    for (const item of itens) {
      const evento = await Event.findById(item.eventoId);
      
      if (item.tipoIngresso === 'Inteira') {
        evento.quantidadeInteira -= item.quantidade;
      } else if (item.tipoIngresso === 'Meia') {
        evento.quantidadeMeia -= item.quantidade;
      }
      
      await evento.save();
    }

    // Criar a compra
    const novaCompra = new Compra({
      usuarioId,
      itens: itens.map(item => ({
        eventoId: item.eventoId,
        nomeEvento: item.nomeEvento,
        tipoIngresso: item.tipoIngresso,
        preco: item.preco,
        quantidade: item.quantidade,
        dataEvento: item.dataEvento,
        localEvento: item.localEvento,
        imagem: item.imagem
      })),
      total,
      dataCompra: new Date(),
      status: 'aprovada'
    });

    await novaCompra.save();

    res.status(201).json({ 
      message: 'Compra realizada com sucesso!',
      compra: novaCompra
    });

  } catch (error) {
    console.error('Erro ao processar compra:', error);
    res.status(500).json({ message: 'Erro ao processar compra', error: error.message });
  }
});

// Rota para listar compras do usuário
router.get('/minhas-compras', authenticateToken, async (req, res) => {
  try {
    const usuarioId = req.user.userId;
    
    const compras = await Compra.find({ usuarioId })
      .sort({ dataCompra: -1 })
      .populate('usuarioId', 'nome email');

    res.status(200).json(compras);
  } catch (error) {
    console.error('Erro ao buscar compras:', error);
    res.status(500).json({ message: 'Erro ao buscar compras', error: error.message });
  }
});

// Rota para obter detalhes de uma compra específica
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const compra = await Compra.findById(req.params.id).populate('usuarioId', 'nome email');
    
    if (!compra) {
      return res.status(404).json({ message: 'Compra não encontrada' });
    }

    // Verificar se o usuário é o dono da compra
    if (compra.usuarioId._id.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    res.status(200).json(compra);
  } catch (error) {
    console.error('Erro ao buscar compra:', error);
    res.status(500).json({ message: 'Erro ao buscar compra', error: error.message });
  }
});

// Rota para cancelar uma compra (se permitido)
router.patch('/:id/cancelar', authenticateToken, async (req, res) => {
  try {
    const compra = await Compra.findById(req.params.id);
    
    if (!compra) {
      return res.status(404).json({ message: 'Compra não encontrada' });
    }

    // Verificar se o usuário é o dono da compra
    if (compra.usuarioId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    // Verificar se a compra pode ser cancelada (ex: até 48h antes do evento)
    const dataEvento = new Date(compra.itens[0].dataEvento);
    const agora = new Date();
    const diferencaHoras = (dataEvento - agora) / (1000 * 60 * 60);

    if (diferencaHoras < 48) {
      return res.status(400).json({ message: 'Cancelamento permitido apenas até 48h antes do evento' });
    }

    compra.status = 'cancelada';
    await compra.save();

    // Restaurar quantidades disponíveis
    for (const item of compra.itens) {
      const evento = await Event.findById(item.eventoId);
      
      if (item.tipoIngresso === 'Inteira') {
        evento.quantidadeInteira += item.quantidade;
      } else if (item.tipoIngresso === 'Meia') {
        evento.quantidadeMeia += item.quantidade;
      }
      
      await evento.save();
    }

    res.status(200).json({ message: 'Compra cancelada com sucesso', compra });
  } catch (error) {
    console.error('Erro ao cancelar compra:', error);
    res.status(500).json({ message: 'Erro ao cancelar compra', error: error.message });
  }
});

module.exports = router;