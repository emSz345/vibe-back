// routes/carrinhoRoutes.ts

import { Router, Request, Response, NextFunction } from 'express';
import Carrinho, { ICarrinho, ICarrinhoItem } from '../models/Carrinho';
import Event, { IEvent } from '../models/Event';
import { protect } from '../authMiddleware';
import type { ITokenPayload } from '../authMiddleware';
import { Types } from 'mongoose'; // ⬅️ IMPORTAR Types

const router = Router();

// Interface para o body da rota de adicionar item
interface AddItemBody {
    eventoId: string;
    tipoIngresso: 'Inteira' | 'Meia';
    quantidade: number;
}

// 🔥 OBTER CARRINHO DO USUÁRIO
router.get('/', protect, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as ITokenPayload).userId;
        
        let carrinho: ICarrinho | null = await Carrinho.findOne({ usuarioId: userId })
            .populate('itens.eventoId', 'nome imagem quantidadeInteira quantidadeMeia');

        if (!carrinho) {
            carrinho = await Carrinho.findOneAndUpdate(
                { usuarioId: userId },
                { $setOnInsert: { itens: [] } },
                { new: true, upsert: true }
            );
        }
        res.status(200).json(carrinho);
    } catch (error) {
        next(error);
    }
});

// 🔥 ADICIONAR ITEM AO CARRINHO
router.post('/itens', protect, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.user as ITokenPayload;
        if (user.role === 'SUPER_ADMIN' || user.role === 'MANAGER_SITE') {
            return res.status(403).json({ message: 'Administradores não podem adicionar itens ao carrinho.' });
        }

        const { eventoId, tipoIngresso, quantidade } = req.body as AddItemBody;
        const userId = user.userId;

        const evento: IEvent | null = await Event.findById(eventoId);
        if (!evento) {
            return res.status(404).json({ message: 'Evento não encontrado' });
        }

        // 🔥 CORREÇÃO 1: Adicionar '|| 0' para tratar valores opcionais (undefined)
        const estoqueDisponivel = (tipoIngresso === 'Inteira'
            ? evento.quantidadeInteira
            : evento.quantidadeMeia) || 0;

        let carrinhoAtual = await Carrinho.findOne({ usuarioId: userId });
        const itemExistente = carrinhoAtual?.itens.find(item =>
            item.eventoId.toString() === eventoId && item.tipoIngresso === tipoIngresso
        );

        const quantidadeAtualNoCarrinho = itemExistente?.quantidade || 0;
        const quantidadeTotalAposAdicao = quantidadeAtualNoCarrinho + quantidade;

        // Agora esta comparação é segura
        if (quantidadeTotalAposAdicao > estoqueDisponivel) {
            return res.status(400).json({
                message: `Estoque insuficiente. Quantidade desejada: ${quantidadeTotalAposAdicao}. Disponível: ${estoqueDisponivel}`
            });
        }

        // 2. Tenta encontrar o item e ATUALIZAR
        let carrinho: ICarrinho | null = await Carrinho.findOneAndUpdate(
            {
                usuarioId: userId,
                'itens.eventoId': eventoId,
                'itens.tipoIngresso': tipoIngresso
            },
            {
                $inc: { 'itens.$.quantidade': quantidade }
            },
            { new: true }
        );

        if (carrinho) {
            const carrinhoPopulado = await Carrinho.findById(carrinho._id)
                .populate('itens.eventoId', 'nome imagem quantidadeInteira quantidadeMeia');
            return res.status(200).json(carrinhoPopulado);
        }

        // 3. Se não encontrou, ADICIONA o novo item
        // 🔥 CORREÇÃO 2: Criar o novo item sem 'Partial' e convertendo o eventoId
        const novoItem = {
            eventoId: new Types.ObjectId(eventoId), // ⬅️ Converter string para ObjectId
            nomeEvento: evento.nome,
            tipoIngresso,
            preco: (tipoIngresso === 'Inteira' ? evento.valorIngressoInteira : evento.valorIngressoMeia) || 0, // ⬅️ '|| 0'
            quantidade,
            imagem: evento.imagem,
            dataEvento: evento.dataInicio,
            localEvento: `${evento.rua}, ${evento.numero}, ${evento.bairro} - ${evento.cidade}, ${evento.estado}`
        };

        carrinho = await Carrinho.findOneAndUpdate(
            { usuarioId: userId },
            {
                $push: { itens: novoItem }, // O $push aceita o objeto
                $setOnInsert: { usuarioId: userId }
            },
            { new: true, upsert: true }
        );

        const carrinhoPopulado = await Carrinho.findById(carrinho!._id) // '!' pois temos certeza que existe
            .populate('itens.eventoId', 'nome imagem quantidadeInteira quantidadeMeia');

        res.status(200).json(carrinhoPopulado);

    } catch (error) {
        next(error);
    }
});

// 🔥 ATUALIZAR QUANTIDADE
router.put('/itens/:itemId', protect, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quantidade } = req.body as { quantidade: number };
        const { itemId } = req.params;
        const userId = (req.user as ITokenPayload).userId;

        const carrinho: ICarrinho | null = await Carrinho.findOne({ usuarioId: userId });
        if (!carrinho) {
            return res.status(404).json({ message: 'Carrinho não encontrado' });
        }

        // 🔥 CORREÇÃO 3: Usar 'item._id?.toString()' (optional chaining)
        const itemIndex = carrinho.itens.findIndex(item => item._id?.toString() === itemId);
        if (itemIndex === -1) {
            return res.status(404).json({ message: 'Item não encontrado' });
        }
        
        const item = carrinho.itens[itemIndex];

        const evento = await Event.findById(item.eventoId);
        if (!evento) {
            return res.status(404).json({ message: 'Evento do item não encontrado' });
        }

        // 🔥 CORREÇÃO 4: Adicionar '|| 0' para tratar valores opcionais
        const estoqueDisponivel = (item.tipoIngresso === 'Inteira'
            ? evento.quantidadeInteira
            : evento.quantidadeMeia) || 0;
        
        // Agora esta comparação é segura
        if (quantidade > estoqueDisponivel) {
            return res.status(400).json({
                message: `Estoque insuficiente para ${quantidade} ingressos. Disponível: ${estoqueDisponivel}`
            });
        }

        carrinho.itens[itemIndex].quantidade = quantidade;
        await carrinho.save();

        res.status(200).json(carrinho);
    } catch (error) {
        next(error);
    }
});

// 🔥 REMOVER ITEM
router.delete('/itens/:itemId', protect, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { itemId } = req.params;
        const userId = (req.user as ITokenPayload).userId;

        const carrinho = await Carrinho.findOne({ usuarioId: userId });
        if (!carrinho) {
            return res.status(404).json({ message: 'Carrinho não encontrado' });
        }

        // 🔥 CORREÇÃO 5: Usar 'item._id?.toString()' (optional chaining)
        carrinho.itens = carrinho.itens.filter(item => item._id?.toString() !== itemId);
        await carrinho.save();

        res.status(200).json(carrinho);
    } catch (error) {
        next(error);
    }
});

// 🔥 LIMPAR CARRINHO
router.delete('/', protect, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as ITokenPayload).userId;
        await Carrinho.findOneAndDelete({ usuarioId: userId });
        res.status(200).json({ message: 'Carrinho limpo com sucesso' });
    } catch (error) {
        next(error);
    }
});

export default router;