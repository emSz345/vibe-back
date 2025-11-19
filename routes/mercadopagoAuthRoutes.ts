// routes/mercadopagoAuthRoutes.ts
import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import Perfil, { IPerfil } from '../models/Perfil';
import Event, { IEvent } from '../models/Event';
import { protect } from '../authMiddleware';
import type { ITokenPayload } from '../authMiddleware'; // Importa o TIPO

const router = Router();

const MERCADOPAGO_CLIENT_ID = process.env.MERCADOPAGO_CLIENT_ID;
const MERCADOPAGO_CLIENT_SECRET = process.env.MERCADOPAGO_CLIENT_SECRET;
const REDIRECT_URI = process.env.MERCADOPAGO_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL;

// Rota 1: Inicia o processo de conexão
router.post('/connect', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.body as { userId: string };
        const authUrl = `https://auth.mercadopago.com.br/authorization?client_id=${MERCADOPAGO_CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&state=${userId}`;
        res.status(200).json({ url: authUrl });
    } catch (error) {
        next(error);
    }
});

// Rota 2: Rota de retorno (chamada pelo Mercado Pago)
router.get('/callback', async (req: Request, res: Response) => {
    // Note: Esta rota redireciona, então ela trata seus próprios erros
    const { code, state } = req.query as { code: string; state: string };

    if (!code || !state) {
        return res.redirect(`${FRONTEND_URL}/perfil?status=error&message=auth_failed`);
    }

    try {
        // Tipamos a resposta do Axios
        const response = await axios.post<{ user_id: string }>(
            'https://api.mercadopago.com/oauth/token',
            {
                client_id: MERCADOPAGO_CLIENT_ID,
                client_secret: MERCADOPAGO_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI
            }
        );

        const { user_id } = response.data; // O ID da conta do vendedor

        await Perfil.findOneAndUpdate(
            { userId: state }, // Encontra pelo ID do usuário
            { mercadoPagoAccountId: user_id }, // Define o ID da conta do MP
            { new: true, upsert: true }
        );

        res.redirect(`${FRONTEND_URL}/perfil?status=success`);

    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            console.error(
                "Erro ao trocar o código de autorização:",
                error.response?.data || error.message
            );
        } else if (error instanceof Error) {
            console.error("Erro ao trocar o código de autorização:", error.message);
        } else {
            console.error("Erro desconhecido ao trocar o código de autorização.");
        }
        res.redirect(`${FRONTEND_URL}/perfil?status=error`);
    }
});

// Rota 3: Desconectar conta
router.patch('/disconnect', protect, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req.user as ITokenPayload).userId;

        const eventosAtivos: IEvent[] = await Event.find({
            criadoPor: userId,
            status: { $nin: ['finalizado', 'cancelado'] }
        });

        if (eventosAtivos.length > 0) {
            return res.status(403).json({
                message: 'Você não pode desvincular sua conta pois possui eventos ativos.'
            });
        }

        const perfilAtualizado: IPerfil | null = await Perfil.findOneAndUpdate(
            { userId: userId },
            { $unset: { mercadoPagoAccountId: "" } },
            { new: true }
        );

        if (!perfilAtualizado) {
            return res.status(404).json({ message: 'Perfil não encontrado.' });
        }

        res.status(200).json({ message: 'Conta do Mercado Pago desvinculada com sucesso.' });

    } catch (error) {
        next(error);
    }
});

export default router;