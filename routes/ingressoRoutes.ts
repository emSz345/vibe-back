// routes/ingressoRoutes.ts

import { Router, Request, Response, NextFunction } from 'express';
import { protect } from '../authMiddleware';
import type { ITokenPayload } from '../authMiddleware';
import Ingresso, { IIngresso } from '../models/ingresso';
import User, { IUser } from '../models/User';
import mongoose, { Types } from 'mongoose'; // ⬅️ ADICIONE ESTA
import { enviarEmailIngresso } from '../utils/emailService';

function escapeRegex(text: string): string {
    if (typeof text !== 'string') return '';
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

const router = Router();

// ROTA: POST /api/ingressos/send-email
router.post('/send-email', protect, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.user as ITokenPayload;
        if (user.role === 'SUPER_ADMIN' || user.role === 'MANAGER_SITE') {
            return res.status(403).json({ message: 'Administradores não podem adicionar itens ao carrinho.' });
        }

        const { ingressoId } = req.body as { ingressoId: string };
        const userId = user.userId;

        if (!ingressoId) {
            return res.status(400).json({ message: 'O ID do ingresso é obrigatório.' });
        }

        const ingresso: IIngresso | null = await Ingresso.findById(ingressoId);

        if (!ingresso || ingresso.userId.toString() !== userId) {
            return res.status(404).json({ message: 'Ingresso não encontrado ou não pertence a este usuário.' });
        }

        const usuario: IUser | null = await User.findById(userId);
        if (!usuario) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        await enviarEmailIngresso(usuario, ingresso);

        res.status(200).json({ message: 'E-mail do ingresso enviado com sucesso!' });

    } catch (error) {
        next(error);
    }
});

router.get("/user", protect, async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req.user as ITokenPayload).userId;
    const { search } = req.query as { search?: string };

    // ===============================================
    // 🔥 CORREÇÃO: ADICIONE ESTA VALIDAÇÃO
    // ===============================================
    const MAX_SEARCH_LENGTH = 200; // Defina um limite razoável

    if (search && search.length > MAX_SEARCH_LENGTH) {
        return res.status(400).json({ message: 'O termo de busca é muito longo.' });
    }
    // ===============================================

    try {
        if (!search) {
            const ingressos: IIngresso[] = await Ingresso.find({ userId })
                .populate("eventoId")
                .select("-__v")
                .sort({ createdAt: -1 });
            return res.status(200).json(ingressos);
        }

        const regex = new RegExp(escapeRegex(search), "i"); // ⬅️ Agora é seguro
        const ingressos: any[] = await Ingresso.aggregate([
            { $match: { userId: new Types.ObjectId(userId) } },
            {
                $lookup: {
                    from: "events",
                    localField: "eventoId",
                    foreignField: "_id",
                    as: "evento",
                },
            },
            { $unwind: { path: "$evento", preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    $or: [{ "evento.nome": regex }, { pedidoId: regex }, { tipoIngresso: regex }],
                },
            },
            { $sort: { createdAt: -1 } },
        ]);

        res.status(200).json(ingressos);
    } catch (error) {
        next(error);
    }
});

export default router;