// routes/adminRoutes.ts

import { Router, Request, Response, NextFunction } from 'express';
import User, { IUser, UserRole } from '../models/User';
import { protect, checkPermission } from '../authMiddleware';

const router = Router();

// Interface para o body da rota de atualização
interface UpdateRoleBody {
    email: string;
    newRole: UserRole;
}

// -------------------------------------------------------------------
// ROTA 1: ATUALIZAR A ROLE DE UM USUÁRIO
// -------------------------------------------------------------------
router.patch(
    '/update-role',
    protect,
    checkPermission(['SUPER_ADMIN']),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email, newRole } = req.body as UpdateRoleBody;

            if (!email || !newRole) {
                return res.status(400).json({ message: 'Email e a nova role são obrigatórios.' });
            }
            const allowedRoles: UserRole[] = ['USER', 'MANAGER_SITE', 'SUPER_ADMIN'];
            if (!allowedRoles.includes(newRole)) {
                return res.status(400).json({ message: 'A role fornecida é inválida.' });
            }
            
            const userToUpdate: IUser | null = await User.findOneAndUpdate({ email }, { role: newRole }, { new: true });
            
            if (!userToUpdate) {
                return res.status(404).json({ message: 'Usuário não encontrado.' });
            }
            res.status(200).json({ message: `Usuário ${email} atualizado para a role ${newRole} com sucesso.` });
        } catch (error) {
            next(error); // Passa o erro para o error handler global
        }
    }
);

// -------------------------------------------------------------------
// ROTA 2: LISTAR OS USUÁRIOS
// -------------------------------------------------------------------
router.get(
    '/users',
    protect,
    checkPermission(['SUPER_ADMIN']),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const users: IUser[] = await User.find().select('nome email role'); 
            res.status(200).json(users);
        } catch (error) {
            next(error);
        }
    }
);

// -------------------------------------------------------------------
// ROTA 3: BUSCAR DADOS PARA O 'Painel.tsx'
// -------------------------------------------------------------------
router.get(
    '/painel',
    protect,
    checkPermission(['SUPER_ADMIN', 'MANAGER_SITE']),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Lógica para buscar dados reais do painel
            res.status(200).json({
                message: 'Dados do painel principal',
                totalUsuarios: 150,
                totalVendas: 5432.10
            });
        } catch (error) {
            next(error);
        }
    }
);

// -------------------------------------------------------------------
// ROTA 4: ATUALIZAR DADOS DO 'CarroselAdm.tsx'
// -------------------------------------------------------------------
router.put(
    '/carrossel',
    protect,
    checkPermission(['SUPER_ADMIN', 'MANAGER_SITE']),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { novasImagens } = req.body; // { novasImagens: any[] }
            console.log('Atualizando carrossel com:', novasImagens);
            res.status(200).json({ message: 'Carrossel atualizado com sucesso!' });
        } catch (error) {
            next(error);
        }
    }
);

export default router;