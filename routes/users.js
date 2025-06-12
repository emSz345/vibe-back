const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const validator = require('validator');
const { enviarEmail } = require('../utils/emailService');
const fs = require('fs');

const SECRET = process.env.JWT_SECRET;
const UPLOAD_DIR = 'uploads/perfil-img/'; // <--- NOVO DIRETÓRIO AQUI!
const DEFAULT_AVATAR_FILENAME = 'blank_profile.png'; // Nome do arquivo padrão (ex: 'blank_profile.png')

// --- NOVO: Garante que a pasta 'uploads/perfil-img/' exista ---
// É importante que esta verificação seja feita no app.js ou aqui, antes de qualquer operação de arquivo.
const fullUploadDirPath = path.join(__dirname, '..', UPLOAD_DIR);
if (!fs.existsSync(fullUploadDirPath)) {
    fs.mkdirSync(fullUploadDirPath, { recursive: true }); // 'recursive: true' cria pastas aninhadas se necessário
}
// -----------------------------------------------------------------


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR); // <--- USA O NOVO DIRETÓRIO AQUI!
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// --- ROTA DE CADASTRO ---
router.post('/register', upload.single('imagemPerfil'), async (req, res) => {
    const { nome, email, senha, provedor } = req.body;
    
    // Pega o nome do arquivo enviado OU usa o nome do arquivo padrão
    const imagemPerfilFilename = req.file ? req.file.filename : DEFAULT_AVATAR_FILENAME;

    if (!nome || !email || !senha) {
        return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (!validator.isEmail(email)) {
        return res.status(400).json({ message: 'Formato de e-mail inválido.' });
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
            imagemPerfil: imagemPerfilFilename, // SALVA O NOME DO ARQUIVO OU O PADRÃO
            isVerified: false
        });

        const verificationToken = jwt.sign({ userId: user._id }, SECRET, { expiresIn: '1d' });
        user.verificationToken = verificationToken;
        await user.save();

        const verificationLink = `${process.env.BASE_URL}/api/users/verify/${verificationToken}`;

        const emailHtml = `
            <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
                <h1 style="color: #007bff;">Bem-vindo(a) ao B4Y Eventos, ${user.nome}!</h1>
                <p>Seu cadastro foi iniciado. Por favor, clique no botão abaixo para verificar seu endereço de e-mail e ativar sua conta.</p>
                <a href="${verificationLink}" style="background-color: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin-top: 20px; display: inline-block;">Verificar meu E-mail</a>
                <p style="margin-top: 20px;">Se você não se cadastrou, por favor, ignore este e-mail.</p>
            </div>
        `;

        await enviarEmail({
            to: user.email,
            subject: '✅ Verifique seu e-mail para ativar sua conta na B4Y Eventos!',
            html: emailHtml
        });

        res.status(201).json({
            message: 'Usuário cadastrado com sucesso! Um e-mail de verificação foi enviado para sua caixa de entrada.',
            user: {
                imagemPerfil: user.imagemPerfil // Retorna o nome do arquivo (padrão ou enviado)
            }
        });

    } catch (err) {
        console.error("Erro no cadastro:", err);
        res.status(500).json({ message: 'Erro ao cadastrar usuário', error: err.message });
    }
});

// --- ROTA DE VERIFICAÇÃO DE E-MAIL ---
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

// --- ROTA DE LOGIN ---
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ message: 'Email e senha são obrigatórios' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        if (!user.isVerified) {
            return res.status(403).json({ message: 'Seu e-mail ainda não foi verificado. Por favor, cheque sua caixa de entrada.' });
        }

        if (user.provedor !== 'local' && user.provedor) {
             const token = jwt.sign({ id: user._id, nome: user.nome }, SECRET, { expiresIn: '7d' });
             return res.status(200).json({ message: 'Login via provedor realizado com sucesso', user: { ...user.toObject(), imagemPerfil: user.imagemPerfil }, token });
        }

        const senhaCorreta = await bcrypt.compare(senha, user.senha);
        if (!senhaCorreta) {
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        const token = jwt.sign({ id: user._id, nome: user.nome }, SECRET, { expiresIn: '7d' });

        res.status(200).json({
            message: 'Login realizado com sucesso',
            user: { ...user.toObject(), imagemPerfil: user.imagemPerfil },
            token
        });
    } catch (err) {
        console.error("Erro no login:", err);
        res.status(500).json({ message: 'Erro no login', error: err.message });
    }
});

// --- ROTA DE ATUALIZAÇÃO ---
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

        // Se uma nova imagem foi enviada e o usuário tinha uma imagem antiga diferente
        // E a imagem antiga não é a imagem padrão (para não deletar o padrão)
        if (req.file && userBeforeUpdate && userBeforeUpdate.imagemPerfil && userBeforeUpdate.imagemPerfil !== user.imagemPerfil && userBeforeUpdate.imagemPerfil !== DEFAULT_AVATAR_FILENAME) {
            const oldImagePath = path.join(__dirname, '..', UPLOAD_DIR, userBeforeUpdate.imagemPerfil); // <--- Usa UPLOAD_DIR aqui!
            fs.unlink(oldImagePath, (err) => {
                if (err) console.error("Erro ao deletar imagem antiga:", oldImagePath, err);
                else console.log("Imagem antiga deletada:", oldImagePath);
            });
        }

        res.status(200).json({
            message: 'Usuário atualizado com sucesso',
            user: {
                _id: user._id,
                nome: user.nome,
                email: user.email,
                imagemPerfil: user.imagemPerfil,
                provedor: user.provedor,
                isVerified: user.isVerified
            }
        });
    } catch (err) {
        console.error("Erro ao atualizar usuário:", err);
        res.status(500).json({ message: 'Erro ao atualizar usuário', error: err.message });
    }
});

// --- ROTA GET /me ---
router.get('/me', async (req, res) => {
    const email = req.query.email;
    if (!email) return res.status(400).json({ message: 'Email é obrigatório' });

    try {
        const user = await User.findOne({ email }).select('nome email imagemPerfil provedor isVerified');
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });

        res.json({
            _id: user._id,
            nome: user.nome,
            email: user.email,
            imagemPerfil: user.imagemPerfil,
            provedor: user.provedor,
            isVerified: user.isVerified
        });
    } catch (error) {
        console.error("Erro ao buscar usuário em /me:", error);
        res.status(500).json({ message: 'Erro ao buscar usuário', error: error.message });
    }
});

module.exports = router;