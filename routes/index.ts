import { Router } from 'express';
import usersRoutes from './users';
import eventRoutes from './eventRoutes';
import carrosselRoutes from './carrosselRoutes';
import perfilRoutes from './perfilRoutes';
import payRoutes from './payRoutes';
import mercadopagoAuthRoutes from './mercadopagoAuthRoutes';
import carrinhoRoutes from './carrinhoRoutes';
import ingressoRoutes from './ingressoRoutes';
import adminRoutes from './adminRoutes';
import chatRoutes from './chat';

const router = Router();

// Agrupa todas as rotas da API
router.use('/users', usersRoutes);
router.use('/auth', usersRoutes); // 'users' lida com 'auth'
router.use('/eventos', eventRoutes);
router.use('/carrossel', carrosselRoutes);
router.use('/perfil', perfilRoutes);
router.use('/pagamento', payRoutes);
router.use('/mercadopago', mercadopagoAuthRoutes);
router.use('/carrinho', carrinhoRoutes);
router.use('/ingressos', ingressoRoutes);
router.use('/admin', adminRoutes);
router.use('/chat', chatRoutes);

// Você pode mover sua rota temporária para cá também
router.get('/eventos/verificar-estoque/:id', (req, res) => {
    res.status(200).json({ estoqueDisponivel: true });
});

export default router;