// routes/perfilRoutes.ts
import { Router, Request, Response, NextFunction } from 'express';
import Perfil, { IPerfil, IDadosPessoais, IDadosOrganizacao } from '../models/Perfil';

const router = Router();

// Interface para o body da rota de salvar
interface SalvarPerfilBody {
    tipoPessoa: 'cpf' | 'cnpj';
    dadosPessoais: IDadosPessoais;
    dadosOrganizacao: IDadosOrganizacao;
}

router.put('/salvar/:userId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.params;
        const { tipoPessoa, dadosPessoais, dadosOrganizacao } = req.body as SalvarPerfilBody;

        const perfil: IPerfil | null = await Perfil.findOneAndUpdate(
            { userId: userId },
            { tipoPessoa, dadosPessoais, dadosOrganizacao },
            { new: true, upsert: true, runValidators: true }
        );

        res.status(200).json({ message: 'Dados de perfil salvos com sucesso!', perfil });

    } catch (error) {
        next(error);
    }
});

router.get('/:userId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.params;
        const perfil: IPerfil | null = await Perfil.findOne({ userId: userId });
        
        if (!perfil) {
            return res.status(404).json({ message: 'Perfil não encontrado.' });
        }
        res.status(200).json(perfil);
    } catch (error) {
        next(error);
    }
});

export default router;