/**
 * Este arquivo define todas as rotas relacionadas a usuários, incluindo autenticação,
 * registro, gerenciamento de perfis e operações de conta para a plataforma NaVibe.
 */

// routes/users.ts

import express, { Router, Request, Response, NextFunction, CookieOptions } from 'express';
import User, { IUser } from '../models/User';
import Perfil, { IPerfil } from '../models/Perfil';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer, { StorageEngine } from 'multer';
import path from 'path';
import validator from 'validator';
import { enviarEmail } from '../utils/emailService';
import fs from 'fs';
import { protect } from '../authMiddleware';
import type { ITokenPayload } from '../authMiddleware'; // Importa apenas o tipo, não o valor

// Inicializa o router do Express
const router = Router();

// Configurações de segurança e constantes
const SECRET = process.env.JWT_SECRET as string; // Segredo para JWT
const UPLOAD_DIR = 'uploads/perfil-img'; // Diretório para upload de imagens de perfil
const DEFAULT_AVATAR_FILENAME = 'blank_profile.png'; // Avatar padrão
const MAX_INPUT_LENGTH = 300; // Limite global de segurança para inputs

// ================================================================
// CONFIGURAÇÃO DO MULTER PARA UPLOAD DE IMAGENS DE PERFIL
// ================================================================

/**
 * Configuração do storage do multer para salvar imagens de perfil
 */
const storage: StorageEngine = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        cb(null, UPLOAD_DIR); // Define o diretório de destino
    },
    filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        // Gera nome único baseado no timestamp
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage }); // Inicializa o multer com a configuração

// ================================================================
// FUNÇÕES AUXILIARES
// ================================================================

/**
 * FUNÇÃO getImagemPerfilPath - Resolve o caminho da imagem de perfil
 * @param filename - Nome do arquivo ou URL da imagem
 * @returns Caminho completo para a imagem
 */
const getImagemPerfilPath = (filename: string | undefined): string => {
    if (!filename) return `/uploads/${DEFAULT_AVATAR_FILENAME}`; // Usa padrão se não houver
    if (filename.startsWith('http')) return filename; // Retorna URL completa se for externa
    if (filename === DEFAULT_AVATAR_FILENAME) return `/uploads/${DEFAULT_AVATAR_FILENAME}`; // Avatar padrão
    return `/${UPLOAD_DIR}/${filename}`; // Imagem personalizada
};

/**
 * INTERFACE IUserDataResponse - Define a estrutura padrão de resposta de usuário
 * Garante consistência em todas as respostas da API
 */
interface IUserDataResponse {
    _id: any;
    nome: string;
    email: string;
    role: string;
    imagemPerfil: string;
    mercadoPagoAccountId: string | null | undefined;
}

// ================================================================
// ROTAS DE AUTENTICAÇÃO
// ================================================================

/**
 * ROTA POST /login - Autenticação tradicional com email e senha
 * @body email - Email do usuário
 * @body senha - Senha do usuário
 * @returns Token JWT e dados do usuário
 */
router.post('/login', async (req: Request, res: Response) => {
    const { email, senha } = req.body;

    // Validação de campos obrigatórios
    if (!email || !senha) {
        return res.status(400).json({ message: 'Email e senha são obrigatórios' });
    }

    // 🔒 VALIDAÇÃO DE SEGURANÇA: Limite de tamanho do email
    if (email.length > MAX_INPUT_LENGTH) {
        return res.status(400).json({ message: 'Dados inválidos.' });
    }

    try {
        // Busca usuário no banco de dados
        const user: IUser | null = await User.findOne({ email });
        
        // Verifica se usuário existe e está verificado
        if (!user || !user.isVerified) {
            return res.status(401).json({ message: 'Credenciais inválidas ou e-mail não verificado.' });
        }

        // Verifica se é usuário de login social (sem senha)
        if (!user.senha) {
            return res.status(401).json({ message: 'Login social. Use o Google ou Facebook.' });
        }

        // Compara senha fornecida com hash armazenado
        const senhaCorreta = await bcrypt.compare(senha, user.senha);
        if (!senhaCorreta) {
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        // Busca perfil do usuário para dados adicionais
        const perfil: IPerfil | null = await Perfil.findOne({ userId: user._id });

        // Prepara resposta padronizada
        const userDataForResponse: IUserDataResponse = {
            _id: user._id,
            nome: user.nome,
            email: user.email,
            role: user.role,
            imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
            mercadoPagoAccountId: perfil ? perfil.mercadoPagoAccountId : null
        };

        // Gera token JWT válido por 7 dias
        const token = jwt.sign({ userId: user._id, role: user.role }, SECRET, { expiresIn: '7d' });

        // Configurações do cookie de autenticação
        const cookieOptions: CookieOptions = {
            httpOnly: true, // Impede acesso via JavaScript
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias em milissegundos
            secure: false, // HTTPS apenas em produção
            sameSite: 'lax', // Proteção CSRF
            domain: 'localhost' // Domínio do cookie
        };

        // Define cookie no navegador
        res.cookie('authToken', token, cookieOptions);

        // Retorna resposta de sucesso
        res.status(200).json({
            message: 'Login realizado com sucesso',
            token: token,
            user: userDataForResponse,
        });
    } catch (err: any) {
        console.error("Erro no login:", err);
        res.status(500).json({ message: 'Erro no login', error: err.message });
    }
});

/**
 * ROTA POST /logout - Encerra sessão do usuário
 * Remove cookie de autenticação
 */
router.post('/logout', (req: Request, res: Response) => {
    // 🔥 CORREÇÃO: Configuração consistente com o login
    res.clearCookie('authToken', {
        httpOnly: true,
        secure: false, // Deve corresponder à configuração do login
        sameSite: 'lax', // Deve corresponder à configuração do login
        domain: 'localhost', // Deve corresponder à configuração do login
        path: '/'
    });
    res.status(200).json({ message: 'Logout realizado com sucesso' });
});

/**
 * ROTA GET /check-auth - Verifica se usuário está autenticado
 * @header Authorization - Token JWT
 * @returns Dados do usuário se autenticado
 */
router.get('/check-auth', protect, async (req: Request, res: Response) => {
    try {
        // Extrai ID do usuário do token JWT (via middleware protect)
        const userId = (req.user as ITokenPayload).userId;
        
        // Busca usuário no banco (excluindo campo senha)
        const user: IUser | null = await User.findById(userId).select('-senha');
        
        if (!user) {
            // Limpa cookie se usuário não existe mais
            res.clearCookie('authToken');
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // Busca perfil para dados do Mercado Pago
        const perfil: IPerfil | null = await Perfil.findOne({ userId: user._id });

        // Prepara resposta padronizada
        const userDataForResponse: IUserDataResponse = {
            _id: user._id,
            nome: user.nome,
            email: user.email,
            role: user.role,
            imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
            mercadoPagoAccountId: perfil ? perfil.mercadoPagoAccountId : null
        };

        res.status(200).json({
            message: 'Sessão válida.',
            user: userDataForResponse
        });
    } catch (error: any) {
        console.error("Erro ao verificar autenticação:", error);
        res.status(500).json({ message: 'Erro interno do servidor', error: error.message });
    }
});

/**
 * ROTA GET /me - Retorna dados do usuário autenticado
 * @header Authorization - Token JWT
 * @returns DTO seguro com dados do usuário
 */
router.get('/me', protect, async (req: Request, res: Response) => {
    try {
        const userId = (req.user as ITokenPayload).userId;
        
        // Busca usuário excluindo campo sensível (senha)
        const user: IUser | null = await User.findById(userId).select('-senha');
        
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        // Busca perfil para integração com Mercado Pago
        const perfil: IPerfil | null = await Perfil.findOne({ userId: user._id });

        // Retorna DTO (Data Transfer Object) seguro
        res.json({
            _id: user._id,
            nome: user.nome,
            email: user.email,
            provedor: user.provedor, // 'local', 'google', 'facebook'
            isVerified: user.isVerified,
            role: user.role,
            imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
            mercadoPagoAccountId: perfil ? perfil.mercadoPagoAccountId : null
        });
    } catch (error: any) {
        console.error("Erro ao buscar usuário em /me:", error);
        res.status(500).json({ message: 'Erro ao buscar usuário', error: error.message });
    }
});

// ================================================================
// ROTAS DE AUTENTICAÇÃO SOCIAL
// ================================================================

/**
 * INTERFACE SocialLoginBody - Define estrutura para login social
 */
interface SocialLoginBody {
    provider: string;
    userData: {
        email: string;
        nome: string;
        imagemPerfil: string;
    }
}

/**
 * ROTA POST /social-login - Autenticação via Google/Facebook
 * @body provider - Provedor ('google', 'facebook')
 * @body userData - Dados do usuário do provedor
 * @returns Token JWT e dados do usuário
 */
router.post('/social-login', async (req: Request, res: Response) => {
    try {
        const { provider, userData } = req.body as SocialLoginBody;

        // 🔒 VALIDAÇÃO DE SEGURANÇA: Limite de tamanho
        if (userData.email.length > MAX_INPUT_LENGTH || userData.nome.length > MAX_INPUT_LENGTH) {
            return res.status(400).json({ message: 'Dados inválidos.' });
        }

        // Busca usuário existente ou cria novo
        let user: IUser | null = await User.findOne({ email: userData.email });

        if (!user) {
            // Cria novo usuário para login social
            user = new User({
                nome: userData.nome,
                email: userData.email,
                provedor: provider,
                imagemPerfil: userData.imagemPerfil,
                isVerified: true, // Login social é automaticamente verificado
            });
            await user.save();
        }

        // Busca perfil para dados do Mercado Pago
        const perfil: IPerfil | null = await Perfil.findOne({ userId: user._id });

        // Prepara resposta padronizada
        const userDataForResponse: IUserDataResponse = {
            _id: user._id,
            nome: user.nome,
            email: user.email,
            role: user.role,
            imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
            mercadoPagoAccountId: perfil ? perfil.mercadoPagoAccountId : null
        };

        // Gera token JWT
        const token = jwt.sign({ userId: user._id, role: user.role }, SECRET, { expiresIn: '7d' });

        // 🔥 CORREÇÃO: Configuração consistente de cookie
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: false, // Deve corresponder às outras rotas
            sameSite: 'lax', // Deve corresponder às outras rotas
            domain: 'localhost', // Deve corresponder às outras rotas
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
        });

        res.status(200).json({
            message: 'Login social realizado com sucesso',
            token: token,
            user: userDataForResponse,
        });
    } catch (err: any) {
        console.error("Erro no login social:", err);
        res.status(500).json({ message: 'Erro no login social', error: err.message });
    }
});

// ================================================================
// ROTAS DE RECUPERAÇÃO DE SENHA
// ================================================================

/**
 * ROTA GET /verify-reset-token/:token - Valida token de reset de senha
 * @param token - Token JWT de reset
 * @returns Status de validade do token
 */
router.get('/verify-reset-token/:token', async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        // 🔒 VALIDAÇÃO DE SEGURANÇA: Limite de tamanho para tokens JWT
        if (token.length > 1024) {
            return res.status(400).json({ valid: false, message: 'Token inválido.' });
        }

        // Decodifica e verifica token
        const decoded = jwt.verify(token, SECRET) as ITokenPayload;

        // Busca usuário com token válido e não expirado
        const user: IUser | null = await User.findOne({
            _id: decoded.userId,
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() } // Verifica expiração
        });

        if (!user) {
            return res.status(400).json({ valid: false, message: 'Token inválido ou expirado' });
        }
        res.status(200).json({ valid: true });
    } catch (err: any) {
        console.error("Erro ao verificar token:", err);
        res.status(400).json({ valid: false, message: 'Token inválido ou expirado' });
    }
});

/**
 * ROTA POST /reset-password - Redefine senha do usuário
 * @body token - Token JWT de reset
 * @body newPassword - Nova senha
 * @returns Confirmação de sucesso
 */
router.post('/reset-password', async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;

    // Validação de campos obrigatórios
    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token e nova senha são obrigatórios' });
    }

    // 🔒 VALIDAÇÃO DE SEGURANÇA: Limite de tamanho
    if (token.length > 1024 || newPassword.length > MAX_INPUT_LENGTH) {
        return res.status(400).json({ message: 'Dados inválidos.' });
    }

    try {
        // Verifica e decodifica token
        const decoded = jwt.verify(token, SECRET) as ITokenPayload;

        // Busca usuário com token válido
        const user: IUser | null = await User.findOne({
            _id: decoded.userId,
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Token inválido ou expirado' });
        }

        // Validação de força da senha
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
        }

        // Gera hash da nova senha
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Atualiza usuário e limpa tokens de reset
        user.senha = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.status(200).json({ message: 'Senha redefinida com sucesso' });
    } catch (err: any) {
        console.error("Erro ao redefinir senha:", err);
        res.status(500).json({ message: 'Erro ao redefinir senha', error: err.message });
    }
});

/**
 * ROTA POST /forgot-password - Solicita reset de senha
 * @body email - Email do usuário
 * @returns Confirmação de envio de email
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
    const { email } = req.body;

    // 🔒 VALIDAÇÃO DE SEGURANÇA: Limite de tamanho
    if (email.length > MAX_INPUT_LENGTH) {
        return res.status(400).json({ message: 'Dados de entrada muito longos.' });
    }

    if (!email) {
        return res.status(400).json({ message: 'E-mail é obrigatório' });
    }

    try {
        // Busca usuário pelo email
        const user: IUser | null = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        // Gera token de reset válido por 1 hora
        const resetToken = jwt.sign({ userId: user._id }, SECRET, { expiresIn: '1h' });
        
        // Salva token no usuário
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hora
        await user.save();

        // Gera link de reset
        const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
        
        // Template de email
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
                <h1 style="color: #007bff;">Redefinição de Senha</h1>
                <p>Você solicitou a redefinição de senha para sua conta na VibeTicket Eventos.</p>
                <p>Clique no botão abaixo para redefinir sua senha:</p>
                <a href="${resetLink}" style="background-color: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin-top: 20px; display: inline-block;">Redefinir Senha</a>
                <p style="margin-top: 20px;">Se você não solicitou esta redefinição, por favor, ignore este e-mail.</p>
                <p>Este link expirará em 1 hora.</p>
            </div>
        `;

        // Envia email de reset
        await enviarEmail({
            to: user.email,
            subject: '🔑 Redefinição de Senha - VibeTicket Eventos',
            html: emailHtml
        });

        res.status(200).json({ message: 'E-mail de redefinição enviado com sucesso' });
    } catch (err: any) {
        console.error("Erro ao solicitar redefinição de senha:", err);
        res.status(500).json({ message: 'Erro ao processar solicitação', error: err.message });
    }
});

// ================================================================
// ROTAS DE REGISTRO E VERIFICAÇÃO
// ================================================================

/**
 * ROTA GET /verify/:token - Verifica email do usuário
 * @param token - Token JWT de verificação
 * @redirect Para frontend com token de autenticação
 */
router.get('/verify/:token', async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        // 🔒 VALIDAÇÃO DE SEGURANÇA: Limite de tamanho para token
        if (token.length > 1024) {
            // Redireciona para página de falha no frontend
            return res.redirect(`${process.env.FRONTEND_URL}/login?status=error`);
        }

        // Verifica e decodifica token
        const decoded = jwt.verify(token, SECRET) as ITokenPayload;
        
        // Busca usuário com token de verificação
        const user: IUser | null = await User.findOne({ _id: decoded.userId, verificationToken: token });

        if (!user) {
            // Redireciona para página de token inválido
            return res.redirect(`${process.env.FRONTEND_URL}/login?status=invalid_token`);
        }

        // Marca usuário como verificado e limpa token
        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();

        // --- 🚀 AUTOLOGIN APÓS VERIFICAÇÃO ---

        // 1. Gera token de login (igual ao da rota /login)
        const loginToken = jwt.sign({ userId: user._id, role: user.role }, SECRET, { expiresIn: '7d' });

        // 2. Redireciona para frontend com token como parâmetro
        const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${loginToken}`;

        res.redirect(redirectUrl);

    } catch (err: any) {
        console.error("Erro na verificação de e-mail:", err);
        // Redireciona para página de erro no frontend
        res.redirect(`${process.env.FRONTEND_URL}/login?status=error`);
    }
});

/**
 * ROTA POST /register - Registra novo usuário
 * @body nome - Nome do usuário
 * @body email - Email do usuário
 * @body senha - Senha do usuário
 * @body provedor - Provedor de autenticação ('local')
 * @file imagemPerfil - Imagem de perfil (opcional)
 * @returns Confirmação de registro
 */
router.post('/register', upload.single('imagemPerfil'), async (req: Request, res: Response) => {
    const { nome, email, senha, provedor } = req.body;
    
    // Usa imagem enviada ou avatar padrão
    const imagemPerfilFilename = req.file ? req.file.filename : DEFAULT_AVATAR_FILENAME;

    // 🔒 VALIDAÇÃO DE SEGURANÇA: Limite de tamanho
    if (nome.length > MAX_INPUT_LENGTH || email.length > MAX_INPUT_LENGTH) {
        return res.status(400).json({ message: 'Dados de entrada muito longos.' });
    }

    // Validações básicas
    if (!nome || !email) {
        return res.status(400).json({ message: 'Nome e e-mail são obrigatórios.' });
    }
    if (!validator.isEmail(email)) {
        return res.status(400).json({ message: 'Formato de e-mail inválido.' });
    }
    if (provedor === 'local' && !senha) {
        return res.status(400).json({ message: 'Senha é obrigatória para cadastro local.' });
    }

    try {
        // Verifica se email já está em uso
        let user: IUser | null = await User.findOne({ email });

        if (user) {
            // Lógica para usuário existente (não implementada completamente)
            return res.status(400).json({ message: 'Este e-mail já está em uso.' });
        }

        // Gera hash da senha para usuários locais
        const hashedPassword = await bcrypt.hash(senha, 10);

        // Cria novo usuário
        user = new User({
            nome,
            email,
            senha: hashedPassword,
            provedor,
            imagemPerfil: imagemPerfilFilename,
            isVerified: false // Requer verificação por email
        });

        // Processo específico para usuários locais (com verificação por email)
        if (provedor === 'local') {
            // Gera token de verificação válido por 1 dia
            const verificationToken = jwt.sign({ userId: user._id }, SECRET, { expiresIn: '1d' });
            user.verificationToken = verificationToken;
            await user.save();

            // Gera link de verificação
            const verificationLink = `${process.env.BASE_URL}/api/users/verify/${verificationToken}`;
            
            // Template de email de verificação
            const emailHtml = `
            <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
                <h1 style="color: #007bff;">Bem-vindo(a) ao VibeTicket Eventos, ${user.nome}!</h1>
                <p>Seu cadastro foi iniciado. Por favor, clique no botão abaixo para verificar seu endereço de e-mail e ativar sua conta.</p>
                <a href="${verificationLink}" style="background-color: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin-top: 20px; display: inline-block;">Verificar meu E-mail</a>
                <p style="margin-top: 20px;">Se você não se cadastrou, por favor, ignore este e-mail.</p>
            </div>
        `;

            // Envia email de verificação
            await enviarEmail({
                to: user.email,
                subject: '✅ Verifique seu e-mail para ativar sua conta na NaVibe Eventos!',
                html: emailHtml
            });
        } else {
            // Para login social, marca como verificado automaticamente
            user.isVerified = true;
            await user.save();
        }
        
        res.status(201).json({
            message: 'Usuário cadastrado com sucesso!',
            user: { 
                // Dados básicos do usuário (sem informações sensíveis)
                _id: user._id,
                nome: user.nome,
                email: user.email,
                provedor: user.provedor
            }
        });
    } catch (err: any) {
        console.error("Erro no cadastro:", err);
        res.status(500).json({ message: 'Erro ao cadastrar usuário', error: err.message });
    }
});

// ================================================================
// ROTAS DE GERENCIAMENTO DE USUÁRIO
// ================================================================

/**
 * ROTA PUT /updateByEmail/:email - Atualiza dados do usuário
 * @param email - Email do usuário a ser atualizado
 * @body nome - Novo nome (opcional)
 * @body senha - Nova senha (opcional)
 * @file imagemPerfil - Nova imagem de perfil (opcional)
 * @returns Usuário atualizado
 */
router.put('/updateByEmail/:email', upload.single('imagemPerfil'), async (req: Request, res: Response) => {
    const { nome, senha } = req.body;
    const email = req.params.email;

    // 🔒 VALIDAÇÃO DE SEGURANÇA: Limite de tamanho
    if (email.length > MAX_INPUT_LENGTH || (nome && nome.length > MAX_INPUT_LENGTH)) {
        return res.status(400).json({ message: 'Dados inválidos.' });
    }

    // Objeto dinâmico para campos atualizáveis
    // 'any' é aceitável aqui pois o objeto é construído dinamicamente
    const dadosAtualizados: any = { nome };

    // Adiciona imagem se foi enviada
    if (req.file) {
        dadosAtualizados.imagemPerfil = req.file.filename;
    }
    
    // Adiciona senha se foi fornecida (com hash)
    if (senha) {
        dadosAtualizados.senha = await bcrypt.hash(senha, 10);
    }

    try {
        // Busca usuário antes da atualização para gerenciar imagem antiga
        const userBeforeUpdate: IUser | null = await User.findOne({ email });

        // Atualiza usuário no banco
        const user: IUser | null = await User.findOneAndUpdate({ email }, dadosAtualizados, { new: true });
        
        if (!user) return res.status(444).json({ message: 'Usuário não encontrado' });

        // Lógica de limpeza: apaga imagem antiga se foi substituída
        if (req.file && userBeforeUpdate && userBeforeUpdate.imagemPerfil) {
            // Só apaga se não for URL externa e não for o avatar padrão
            if (!userBeforeUpdate.imagemPerfil.startsWith('http') && userBeforeUpdate.imagemPerfil !== DEFAULT_AVATAR_FILENAME) {
                const oldImagePath = path.join(__dirname, '..', UPLOAD_DIR, userBeforeUpdate.imagemPerfil);
                fs.unlink(oldImagePath, (err) => {
                    if (err) console.error("Erro ao deletar imagem antiga:", oldImagePath, err);
                });
            }
        }

        // Retorna usuário atualizado
        res.status(200).json({
            message: 'Usuário atualizado com sucesso',
            user: {
                _id: user._id,
                nome: user.nome,
                email: user.email,
                provedor: user.provedor,
                isVerified: user.isVerified,
                imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
                isAdmin: user.isAdmin // Propriedade virtual
            }
        });
    } catch (err: any) {
        console.error("Erro ao atualizar usuário:", err);
        res.status(500).json({ message: 'Erro ao atualizar usuário', error: err.message });
    }
});

/**
 * ROTA GET /:userId - Busca usuário por ID
 * @param userId - ID do usuário
 * @returns Dados públicos do usuário
 */
router.get('/:userId', async (req: Request, res: Response) => {
    try {
        const userId = req.params.userId;
        
        // 🔒 VALIDAÇÃO DE SEGURANÇA: Limite de tamanho para ID
        if (userId.length > 50) { // 50 é mais que suficiente para um ID MongoDB
            return res.status(400).json({ message: 'ID de usuário inválido.' });
        }

        // Busca usuário no banco
        const user: IUser | null = await User.findById(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        
        // Retorna apenas dados públicos
        res.status(200).json({
            email: user.email,
            imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
            nome: user.nome
        });
    } catch (error: any) {
        console.error("Erro ao buscar usuário por ID:", error);
        res.status(500).json({ message: 'Erro interno do servidor', error });
    }
});

// Exporta o router configurado
export default router;