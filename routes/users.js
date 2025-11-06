const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Perfil = require('../models/Perfil'); // 🔥 Importe o modelo Perfil
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const validator = require('validator');
const { enviarEmail } = require('../utils/emailService');
const fs = require('fs');
const { protect } = require('../authMiddleware');

const SECRET = process.env.JWT_SECRET;
const UPLOAD_DIR = 'uploads/perfil-img';
const DEFAULT_AVATAR_FILENAME = 'blank_profile.png';

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage });

const getImagemPerfilPath = (filename) => {
    if (!filename) return `/uploads/${DEFAULT_AVATAR_FILENAME}`;
    if (filename.startsWith('http')) return filename;
    if (filename === DEFAULT_AVATAR_FILENAME) return `/uploads/${DEFAULT_AVATAR_FILENAME}`;
    return `/${UPLOAD_DIR}/${filename}`;
};

// --- ROTA DE LOGIN (CORRIGIDA) ---
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ message: 'Email e senha são obrigatórios' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user || !user.isVerified) {
            return res.status(401).json({ message: 'Credenciais inválidas ou e-mail não verificado.' });
        }

        const senhaCorreta = await bcrypt.compare(senha, user.senha);
        if (!senhaCorreta) {
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        // 🔥 LÓGICA DE ENRIQUECIMENTO: Busca o perfil para obter o ID do MP
        const perfil = await Perfil.findOne({ userId: user._id });

        const userDataForResponse = {
            _id: user._id,
            nome: user.nome,
            email: user.email,
            role: user.role,
            imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
            mercadoPagoAccountId: perfil ? perfil.mercadoPagoAccountId : null
        };

        const token = jwt.sign({ userId: user._id, role: user.role }, SECRET, { expiresIn: '7d' });

        const cookieOptions = {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        };

        res.cookie('authToken', token, cookieOptions);

        res.status(200).json({
            message: 'Login realizado com sucesso',
            token: token,
            user: userDataForResponse,
        });
    } catch (err) {
        console.error("Erro no login:", err);
        res.status(500).json({ message: 'Erro no login', error: err.message });
    }
});

// --- ROTA DE LOGOUT ---
router.post('/logout', (req, res) => {
    res.clearCookie('authToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // ← CORRIGIDO
        path: '/'
    });
    res.status(200).json({ message: 'Logout realizado com sucesso' });
});

// --- ROTA PARA VERIFICAR SESSÃO (CORRIGIDA) ---
router.get('/check-auth', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-senha');
        if (!user) {
            res.clearCookie('authToken');
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // 🔥 LÓGICA DE ENRIQUECIMENTO: Também busca o perfil aqui
        const perfil = await Perfil.findOne({ userId: user._id });

        const userDataForResponse = {
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
    } catch (error) {
        console.error("Erro ao verificar autenticação:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// --- ROTA GET /me (CORRIGIDA) ---
router.get('/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-senha');
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        // 🔥 LÓGICA DE ENRIQUECIMENTO: Também busca o perfil aqui
        const perfil = await Perfil.findOne({ userId: user._id });

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
    } catch (error) {
        console.error("Erro ao buscar usuário em /me:", error);
        res.status(500).json({ message: 'Erro ao buscar usuário', error: error.message });
    }
});

// --- ROTA SOCIAL LOGIN (CORRIGIDA) ---
router.post('/social-login', async (req, res) => {
    const { provider, userData } = req.body;

    try {
        let user = await User.findOne({ email: userData.email });

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

        // 🔥 LÓGICA DE ENRIQUECIMENTO: Também busca o perfil aqui
        const perfil = await Perfil.findOne({ userId: user._id });

        const userDataForResponse = {
            _id: user._id,
            nome: user.nome,
            email: user.email,
            role: user.role,
            imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
            mercadoPagoAccountId: perfil ? perfil.mercadoPagoAccountId : null
        };

        const token = jwt.sign({ userId: user._id, role: user.role }, SECRET, { expiresIn: '7d' });

        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(200).json({
            message: 'Login social realizado com sucesso',
            token: token,
            user: userDataForResponse,
        });
    } catch (err) {
        console.error("Erro no login social:", err);
        res.status(500).json({ message: 'Erro no login social', error: err.message });
    }
});


// --- SUAS OUTRAS ROTAS ---

router.get('/verify-reset-token/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const decoded = jwt.verify(token, SECRET);

        const user = await User.findOne({
            _id: decoded.userId,
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ valid: false, message: 'Token inválido ou expirado' });
        }

        res.status(200).json({ valid: true });
    } catch (err) {
        console.error("Erro ao verificar token:", err);
        res.status(400).json({ valid: false, message: 'Token inválido ou expirado' });
    }
});

router.get('/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const decoded = jwt.verify(token, SECRET);
        const user = await User.findOne({ _id: decoded.userId, verificationToken: token });

        if (!user) {
            return res.status(400).send('<p>Link de verificação inválido ou já utilizado.</p>');
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();

        res.status(200).send(`
            <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #28a745;">E-mail Verificado com Sucesso!</h1>
                <p>Obrigado, ${user.nome}. Sua conta foi ativada.</p>
                <p>Você já pode fechar esta página e fazer login na plataforma.</p>
            </div>
        `);

    } catch (err) {
        console.error("Erro na verificação de e-mail:", err);
        res.status(400).send('<p>Link de verificação expirado ou inválido. Por favor, tente se registrar novamente.</p>');
    }
});

router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token e nova senha são obrigatórios' });
    }

    try {
        const decoded = jwt.verify(token, SECRET);

        const user = await User.findOne({
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
    } catch (err) {
        console.error("Erro ao redefinir senha:", err);
        res.status(500).json({ message: 'Erro ao redefinir senha', error: err.message });
    }
});

router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'E-mail é obrigatório' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const resetToken = jwt.sign({ userId: user._id }, SECRET, { expiresIn: '1h' });
        const resetPasswordExpires = Date.now() + 3600000;
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetPasswordExpires;
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
    } catch (err) {
        console.error("Erro ao solicitar redefinição de senha:", err);
        res.status(500).json({ message: 'Erro ao processar solicitação', error: err.message });
    }
});

router.post('/register', upload.single('imagemPerfil'), async (req, res) => {
    const { nome, email, senha, provedor } = req.body;

    const imagemPerfilFilename = req.file ? req.file.filename : DEFAULT_AVATAR_FILENAME;

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
        let user = await User.findOne({ email });

        if (user) {
            if (!user.isVerified) {
                return res.status(400).json({ message: 'Este e-mail já está cadastrado, mas não foi verificado.' });
            }
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
            message: 'Usuário cadastrado com sucesso! Um e-mail de verificação foi enviado para sua caixa de entrada.',
            user: {
                nome: user.nome,
                email: user.email,
                provedor: user.provedor,
                imagemPerfil: getImagemPerfilPath(user.imagemPerfil) // Retorna o caminho completo
            }
        });

    } catch (err) {
        console.error("Erro no cadastro:", err);
        res.status(500).json({ message: 'Erro ao cadastrar usuário', error: err.message });
    }
});

router.put('/updateByEmail/:email', upload.single('imagemPerfil'), async (req, res) => {
    const { nome, senha } = req.body;
    const email = req.params.email;

    const dadosAtualizados = { nome };

    if (req.file) {
        dadosAtualizados.imagemPerfil = req.file.filename;
        console.log("Novo nome de arquivo para imagemPerfil:", req.file.filename);
    }

    if (senha) {
        dadosAtualizados.senha = await bcrypt.hash(senha, 10);
    }

    try {
        const userBeforeUpdate = await User.findOne({ email });

        const user = await User.findOneAndUpdate({ email }, dadosAtualizados, { new: true });
        if (!user) return res.status(444).json({ message: 'Usuário não encontrado' });

        if (req.file && userBeforeUpdate && userBeforeUpdate.imagemPerfil) {
            if (!userBeforeUpdate.imagemPerfil.startsWith('http') && userBeforeUpdate.imagemPerfil !== DEFAULT_AVATAR_FILENAME) {
                const oldImagePath = path.join(__dirname, '..', UPLOAD_DIR, userBeforeUpdate.imagemPerfil);
                fs.unlink(oldImagePath, (err) => {
                    if (err) console.error("Erro ao deletar imagem antiga:", oldImagePath, err);
                    else console.log("Imagem antiga deletada:", oldImagePath);
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
                isAdmin: user.isAdmin  // Retorna o caminho completo
            }
        });
    } catch (err) {
        console.error("Erro ao atualizar usuário:", err);
        res.status(500).json({ message: 'Erro ao atualizar usuário', error: err.message });
    }
});


router.get('/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        res.status(200).json({
            email: user.email,
            imagemPerfil: getImagemPerfilPath(user.imagemPerfil),
            nome: user.nome // Adicione outras propriedades que você precisa
        });
    } catch (error) {
        console.error("Erro ao buscar usuário por ID:", error);
        res.status(500).json({ message: 'Erro interno do servidor', error });
    }
});


module.exports = router;
