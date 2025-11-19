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
import type { ITokenPayload } from '../authMiddleware'; // Importa o TIPO

const router = Router();

const SECRET = process.env.JWT_SECRET as string;
const UPLOAD_DIR = 'uploads/perfil-img';
const DEFAULT_AVATAR_FILENAME = 'blank_profile.png';
const MAX_INPUT_LENGTH = 300; // Limite global de segurança

// --- Configuração do Multer (Tipado) ---
const storage: StorageEngine = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage });

// --- Helper (Tipado) ---
const getImagemPerfilPath = (filename: string | undefined): string => {
    if (!filename) return `/uploads/${DEFAULT_AVATAR_FILENAME}`;
    if (filename.startsWith('http')) return filename;
    if (filename === DEFAULT_AVATAR_FILENAME) return `/uploads/${DEFAULT_AVATAR_FILENAME}`;
    return `/${UPLOAD_DIR}/${filename}`;
};

// --- Interface para Resposta de Usuário (Consistência) ---
interface IUserDataResponse {
    _id: any;
    nome: string;
    email: string;
    role: string;
    imagemPerfil: string;
    mercadoPagoAccountId: string | null | undefined;
}

// --- ROTA DE LOGIN ---
router.post('/login', async (req: Request, res: Response) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ message: 'Email e senha são obrigatórios' });
    }

    // 🔥 CORREÇÃO 1: Limite de tamanho
    if (email.length > MAX_INPUT_LENGTH) {
        return res.status(400).json({ message: 'Dados inválidos.' });
    }

    try {
        const user: IUser | null = await User.findOne({ email });
        if (!user || !user.isVerified) {
            return res.status(401).json({ message: 'Credenciais inválidas ou e-mail não verificado.' });
        }

        if (!user.senha) {
            return res.status(401).json({ message: 'Login social. Use o Google ou Facebook.' });
        }

        const senhaCorreta = await bcrypt.compare(senha, user.senha);
        if (!senhaCorreta) {
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        const perfil: IPerfil | null = await Perfil.findOne({ userId: user._id });

        const userDataForResponse: IUserDataResponse = {
            _id: user._id,
            nome: user.nome,
            email: user.email,
            role: user.role,
            imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
            mercadoPagoAccountId: perfil ? perfil.mercadoPagoAccountId : null
        };

        const token = jwt.sign({ userId: user._id, role: user.role }, SECRET, { expiresIn: '7d' });

        // (Seu código de cookieOptions está correto)
        const cookieOptions: CookieOptions = {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            secure: false,
            sameSite: 'lax',
            domain: 'localhost'
        };

        res.cookie('authToken', token, cookieOptions);

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

// --- ROTA DE LOGOUT ---
router.post('/logout', (req: Request, res: Response) => {
    // 🔥 CORREÇÃO: Alinhando o cookie de logout com o de login
    res.clearCookie('authToken', {
        httpOnly: true,
        secure: false, // ⬅️ Corrigido
        sameSite: 'lax', // ⬅️ Corrigido
        domain: 'localhost', // ⬅️ Corrigido
        path: '/'
    });
    res.status(200).json({ message: 'Logout realizado com sucesso' });
});

// --- ROTA PARA VERIFICAR SESSÃO ---
router.get('/check-auth', protect, async (req: Request, res: Response) => {
    try {
        const userId = (req.user as ITokenPayload).userId;
        const user: IUser | null = await User.findById(userId).select('-senha');
        if (!user) {
            res.clearCookie('authToken');
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        const perfil: IPerfil | null = await Perfil.findOne({ userId: user._id });

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

// --- ROTA GET /me ---
router.get('/me', protect, async (req: Request, res: Response) => {
    try {
        const userId = (req.user as ITokenPayload).userId;
        const user: IUser | null = await User.findById(userId).select('-senha');
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const perfil: IPerfil | null = await Perfil.findOne({ userId: user._id });

        // Retorna um DTO (Data Transfer Object) seguro
        res.json({
            _id: user._id,
            nome: user.nome,
            email: user.email,
            provedor: user.provedor,
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

// --- ROTA SOCIAL LOGIN ---
interface SocialLoginBody {
    provider: string;
    userData: {
        email: string;
        nome: string;
        imagemPerfil: string;
    }
}
router.post('/social-login', async (req: Request, res: Response) => {
    try {
        const { provider, userData } = req.body as SocialLoginBody;

        // 🔥 CORREÇÃO 2: Limite de tamanho
        if (userData.email.length > MAX_INPUT_LENGTH || userData.nome.length > MAX_INPUT_LENGTH) {
            return res.status(400).json({ message: 'Dados inválidos.' });
        }

        let user: IUser | null = await User.findOne({ email: userData.email });

        if (!user) {
            user = new User({
                nome: userData.nome,
                email: userData.email,
                provedor: provider,
                imagemPerfil: userData.imagemPerfil,
                isVerified: true,
            });
            await user.save();
        }

        const perfil: IPerfil | null = await Perfil.findOne({ userId: user._id });

        const userDataForResponse: IUserDataResponse = {
            _id: user._id,
            nome: user.nome,
            email: user.email,
            role: user.role,
            imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
            mercadoPagoAccountId: perfil ? perfil.mercadoPagoAccountId : null
        };

        const token = jwt.sign({ userId: user._id, role: user.role }, SECRET, { expiresIn: '7d' });

        // 🔥 CORREÇÃO: Alinhando o cookie de social-login com o de login
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: false, // ⬅️ Corrigido
            sameSite: 'lax', // ⬅️ Corrigido
            domain: 'localhost', // ⬅️ Corrigido
            maxAge: 7 * 24 * 60 * 60 * 1000,
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

// --- ROTA VERIFICAR TOKEN DE RESET ---
router.get('/verify-reset-token/:token', async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        // 🔥 CORREÇÃO 3: Limite de tamanho (para JWTs)
        if (token.length > 1024) {
            return res.status(400).json({ valid: false, message: 'Token inválido.' });
        }

        const decoded = jwt.verify(token, SECRET) as ITokenPayload;

        const user: IUser | null = await User.findOne({
            _id: decoded.userId,
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
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

// --- ROTA VERIFICAR EMAIL ---
router.get('/verify/:token', async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        if (token.length > 1024) {
            // Redireciona para uma página de falha no frontend
            return res.redirect(`${process.env.FRONTEND_URL}/login?status=error`);
        }

        const decoded = jwt.verify(token, SECRET) as ITokenPayload;
        const user: IUser | null = await User.findOne({ _id: decoded.userId, verificationToken: token });

        if (!user) {
            // Redireciona para uma página de falha no frontend
            return res.redirect(`${process.env.FRONTEND_URL}/login?status=invalid_token`);
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();

        // --- 🚀 INÍCIO DA MUDANÇA: LOGAR O USUÁRIO ---

        // 1. Gerar um token de login (igual ao da rota /login)
        const loginToken = jwt.sign({ userId: user._id, role: user.role }, SECRET, { expiresIn: '7d' });

        // 2. Redirecionar para o frontend com o token como parâmetro
        // Vamos usar uma rota de callback que você criará no frontend
        const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${loginToken}`;

        res.redirect(redirectUrl);

    } catch (err: any) {
        console.error("Erro na verificação de e-mail:", err);
        // Redireciona para uma página de falha no frontend
        res.redirect(`${process.env.FRONTEND_URL}/login?status=error`);
    }
});

// --- ROTA RESETAR SENHA ---
router.post('/reset-password', async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token e nova senha são obrigatórios' });
    }

    if (token.length > 1024 || newPassword.length > MAX_INPUT_LENGTH) {
        return res.status(400).json({ message: 'Dados inválidos.' });
    }

    try {
        const decoded = jwt.verify(token, SECRET) as ITokenPayload;

        const user: IUser | null = await User.findOne({
            _id: decoded.userId,
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Token inválido ou expirado' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
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

// --- ROTA ESQUECI SENHA ---
router.post('/forgot-password', async (req: Request, res: Response) => {
    const { email } = req.body;

    if (email.length > MAX_INPUT_LENGTH) {
        return res.status(400).json({ message: 'Dados de entrada muito longos.' });
    }

    if (!email) {
        return res.status(400).json({ message: 'E-mail é obrigatório' });
    }

    try {
        const user: IUser | null = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const resetToken = jwt.sign({ userId: user._id }, SECRET, { expiresIn: '1h' });
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hora
        await user.save();

        const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
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

// --- ROTA DE REGISTRO ---
router.post('/register', upload.single('imagemPerfil'), async (req: Request, res: Response) => {
    const { nome, email, senha, provedor } = req.body;
    const imagemPerfilFilename = req.file ? req.file.filename : DEFAULT_AVATAR_FILENAME;

    if (nome.length > MAX_INPUT_LENGTH || email.length > MAX_INPUT_LENGTH) {
        return res.status(400).json({ message: 'Dados de entrada muito longos.' });
    }

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
        let user: IUser | null = await User.findOne({ email });

        if (user) {
            // ... (lógica de usuário existente) ...
            return res.status(400).json({ message: 'Este e-mail já está em uso.' });
        }

        const hashedPassword = await bcrypt.hash(senha, 10);

        user = new User({
            nome,
            email,
            senha: hashedPassword,
            provedor,
            imagemPerfil: imagemPerfilFilename,
            isVerified: false
        });

        if (provedor === 'local') {
            const verificationToken = jwt.sign({ userId: user._id }, SECRET, { expiresIn: '1d' });
            user.verificationToken = verificationToken;
            await user.save();

            const verificationLink = `${process.env.BASE_URL}/api/users/verify/${verificationToken}`;
            const emailHtml = `
            <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
                <h1 style="color: #007bff;">Bem-vindo(a) ao VibeTicket Eventos, ${user.nome}!</h1>
                <p>Seu cadastro foi iniciado. Por favor, clique no botão abaixo para verificar seu endereço de e-mail e ativar sua conta.</p>
                <a href="${verificationLink}" style="background-color: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin-top: 20px; display: inline-block;">Verificar meu E-mail</a>
                <p style="margin-top: 20px;">Se você não se cadastrou, por favor, ignore este e-mail.</p>
            </div>
        `;

            await enviarEmail({
                to: user.email,
                subject: '✅ Verifique seu e-mail para ativar sua conta na NaVibe Eventos!',
                html: emailHtml
            });
        } else {
            user.isVerified = true;
            await user.save();
        }
        res.status(201).json({
            message: 'Usuário cadastrado com sucesso!',
            user: { /* ... (dados do usuário) ... */ }
        });
    } catch (err: any) {
        console.error("Erro no cadastro:", err);
        res.status(500).json({ message: 'Erro ao cadastrar usuário', error: err.message });
    }
});

// --- ROTA ATUALIZAR USUÁRIO ---
router.put('/updateByEmail/:email', upload.single('imagemPerfil'), async (req: Request, res: Response) => {
    const { nome, senha } = req.body;
    const email = req.params.email;

    if (email.length > MAX_INPUT_LENGTH || (nome && nome.length > MAX_INPUT_LENGTH)) {
        return res.status(400).json({ message: 'Dados inválidos.' });
    }

    // 'any' é aceitável aqui pois o objeto é dinâmico
    const dadosAtualizados: any = { nome };

    if (req.file) {
        dadosAtualizados.imagemPerfil = req.file.filename;
    }
    if (senha) {
        dadosAtualizados.senha = await bcrypt.hash(senha, 10);
    }

    try {
        const userBeforeUpdate: IUser | null = await User.findOne({ email });

        const user: IUser | null = await User.findOneAndUpdate({ email }, dadosAtualizados, { new: true });
        if (!user) return res.status(444).json({ message: 'Usuário não encontrado' });

        // Lógica de apagar imagem antiga
        if (req.file && userBeforeUpdate && userBeforeUpdate.imagemPerfil) {
            if (!userBeforeUpdate.imagemPerfil.startsWith('http') && userBeforeUpdate.imagemPerfil !== DEFAULT_AVATAR_FILENAME) {
                const oldImagePath = path.join(__dirname, '..', UPLOAD_DIR, userBeforeUpdate.imagemPerfil);
                fs.unlink(oldImagePath, (err) => {
                    if (err) console.error("Erro ao deletar imagem antiga:", oldImagePath, err);
                });
            }
        }

        res.status(200).json({
            message: 'Usuário atualizado com sucesso',
            user: {
                _id: user._id,
                nome: user.nome,
                email: user.email,
                provedor: user.provedor,
                isVerified: user.isVerified,
                imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
                isAdmin: user.isAdmin // Virtual
            }
        });
    } catch (err: any) {
        console.error("Erro ao atualizar usuário:", err);
        res.status(500).json({ message: 'Erro ao atualizar usuário', error: err.message });
    }
});

// --- ROTA GET USUÁRIO POR ID ---
router.get('/:userId', async (req: Request, res: Response) => {
    try {
        const userId = req.params.userId;
        if (userId.length > 50) { // 50 é mais que suficiente para um ID
            return res.status(400).json({ message: 'ID de usuário inválido.' });
        }

        const user: IUser | null = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
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

export default router;