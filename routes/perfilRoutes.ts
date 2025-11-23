/**
 * Este arquivo define as rotas para gerenciamento de perfis de usuários, incluindo
 * operações de criação, atualização e consulta de dados pessoais e organizacionais.
 */

// routes/perfilRoutes.ts
import { Router, Request, Response, NextFunction } from 'express';
import Perfil, { IPerfil, IDadosPessoais, IDadosOrganizacao } from '../models/Perfil';

// Inicializa o router do Express
const router = Router();

/**
 * INTERFACE SalvarPerfilBody - Define a estrutura do corpo da requisição para salvar perfil
 * @prop tipoPessoa - Tipo de pessoa ('cpf' para física, 'cnpj' para jurídica)
 * @prop dadosPessoais - Dados pessoais do usuário (interface importada do modelo)
 * @prop dadosOrganizacao - Dados da organização (interface importada do modelo)
 */
interface SalvarPerfilBody {
    tipoPessoa: 'cpf' | 'cnpj';
    dadosPessoais: IDadosPessoais;
    dadosOrganizacao: IDadosOrganizacao;
}

/**
 * ROTA PUT /salvar/:userId - Salva ou atualiza perfil do usuário
 * 
 * Funcionalidades:
 * - Cria novo perfil se não existir (upsert: true)
 * - Atualiza perfil existente com novos dados
 * - Valida dados conforme esquema do Mongoose
 * 
 * @param userId - ID do usuário (via parâmetro de URL)
 * @body tipoPessoa - Tipo de pessoa ('cpf' ou 'cnpj')
 * @body dadosPessoais - Objeto com dados pessoais completos
 * @body dadosOrganizacao - Objeto com dados organizacionais
 * 
 * @returns Mensagem de sucesso e perfil atualizado
 */
router.put('/salvar/:userId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Extrai userId dos parâmetros da URL
        const { userId } = req.params;
        
        // Extrai e tipa os dados do corpo da requisição
        const { tipoPessoa, dadosPessoais, dadosOrganizacao } = req.body as SalvarPerfilBody;

        // Busca e atualiza perfil existente, ou cria novo se não existir
        const perfil: IPerfil | null = await Perfil.findOneAndUpdate(
            { userId: userId }, // Critério de busca: usuário pelo ID
            { 
                tipoPessoa, 
                dadosPessoais, 
                dadosOrganizacao 
            }, // Dados a serem atualizados/criados
            { 
                new: true,        // Retorna o documento atualizado
                upsert: true,     // Cria novo documento se não existir
                runValidators: true // Executa validações do schema Mongoose
            }
        );

        // Retorna resposta de sucesso com perfil atualizado
        res.status(200).json({ 
            message: 'Dados de perfil salvos com sucesso!', 
            perfil 
        });

    } catch (error) {
        // Passa erro para middleware de tratamento global
        next(error);
    }
});

/**
 * ROTA GET /:userId - Busca perfil do usuário por ID
 * 
 * Funcionalidades:
 * - Recupera perfil completo do usuário
 * - Retorna erro 404 se perfil não for encontrado
 * - Inclui dados pessoais e organizacionais
 * 
 * @param userId - ID do usuário (via parâmetro de URL)
 * @returns Perfil completo do usuário ou mensagem de erro
 */
router.get('/:userId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Extrai userId dos parâmetros da URL
        const { userId } = req.params;
        
        // Busca perfil no banco de dados
        const perfil: IPerfil | null = await Perfil.findOne({ userId: userId });
        
        // Verifica se perfil foi encontrado
        if (!perfil) {
            return res.status(404).json({ message: 'Perfil não encontrado.' });
        }
        
        // Retorna perfil encontrado
        res.status(200).json(perfil);
    } catch (error) {
        // Passa erro para middleware de tratamento global
        next(error);
    }
});

// Exporta o router configurado
export default router;