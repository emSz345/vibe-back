// routes/users.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

// NOVO: Importa a função de envio de e-mail do nosso novo serviço
const { enviarEmail } = require('../utils/emailService');

const SECRET = '6e7d06b1a1f8f8492cd56729eebdf6f83d6c3ff7288be60a12c07a1c5f1d3e85';

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// Cadastro de usuário
router.post('/register', upload.single('imagemPerfil'), async (req, res) => {
    const { nome, email, senha, provedor } = req.body;
    const imagemPerfil = req.file ? req.file.path : null; // Salva o caminho completo

    // Validação básica
    if (!nome || !email || !senha) {
        return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
    }

    try {
        let user = await User.findOne({ email });

        if (user) {
            // Se o usuário já existe, apenas faz o login e retorna o token
            const token = jwt.sign({ id: user._id, nome: user.nome }, SECRET, { expiresIn: '7d' });
            return res.status(200).json({
                message: 'Usuário já existe, login efetuado.',
                user,
                token
            });
        }

        // Se o usuário não existe, cria um novo
        const hashedPassword = await bcrypt.hash(senha, 10);

        user = new User({ nome, email, senha: hashedPassword, provedor, imagemPerfil });
        await user.save();

        // NOVO: Envia o e-mail de boas-vindas após salvar o usuário
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
                <h1 style="color: #007bff;">Bem-vindo(a) ao B4Y Eventos, ${user.nome}!</h1>
                <p>Seu cadastro foi realizado com sucesso.</p>
                <p>Agora você pode explorar e criar os melhores eventos. Aproveite!</p>
                <a href="http://localhost:3000/Home" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; display: inline-block;">Acessar Plataforma</a>
            </div>
        `;
        
        // A função é chamada aqui, mas não esperamos ela terminar (não usamos await)
        // para que a resposta ao usuário seja imediata.
        enviarEmail({
            to: user.email,
            subject: '🎉 Bem-vindo(a) à B4Y Eventos!',
            html: emailHtml
        });
        
        const token = jwt.sign({ id: user._id, nome: user.nome }, SECRET, { expiresIn: '7d' });

        res.status(201).json({
            message: 'Usuário cadastrado com sucesso!',
            user,
            token
        });

    } catch (err) {
        res.status(500).json({ message: 'Erro ao cadastrar usuário', error: err.message });
    }
});


// Login local
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ message: 'Email e senha são obrigatórios' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Credenciais inválidas' }); // Mensagem genérica por segurança
        }

        // Só compara a senha se o usuário não for de um provedor como Google/Facebook
        if (user.provedor !== 'local' && user.provedor) {
             const token = jwt.sign({ id: user._id, nome: user.nome }, SECRET, { expiresIn: '7d' });
             return res.status(200).json({
                message: 'Login via provedor realizado com sucesso',
                user,
                token
            });
        }
        
        const senhaCorreta = await bcrypt.compare(senha, user.senha);
        if (!senhaCorreta) {
            return res.status(401).json({ message: 'Credenciais inválidas' }); // Mensagem genérica por segurança
        }

        const token = jwt.sign({ id: user._id, nome: user.nome }, SECRET, { expiresIn: '7d' });

        res.status(200).json({
            message: 'Login realizado com sucesso',
            user,
            token
        });
    } catch (err) {
        res.status(500).json({ message: 'Erro no login', error: err.message });
    }
});


// Atualizar usuário
router.put('/updateByEmail/:email', upload.single('imagemPerfil'), async (req, res) => {
    const { nome, senha } = req.body;
    const email = req.params.email;
  
    const dadosAtualizados = { nome };
  
    if (req.file) {
      dadosAtualizados.imagemPerfil = req.file.filename;
    }
  
    if (senha) {
      dadosAtualizados.senha = await bcrypt.hash(senha, 10);
    }
  
    try {
      const user = await User.findOneAndUpdate({ email }, dadosAtualizados, { new: true });
      if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
  
      res.status(200).json({ message: 'Usuário atualizado com sucesso', user });
    } catch (err) {
      res.status(500).json({ message: 'Erro ao atualizar usuário', error: err.message });
    }
  });


// Buscar dados do usuário pelo email
router.get('/me', async (req, res) => {
    const email = req.query.email;
    if (!email) return res.status(400).json({ message: 'Email é obrigatório' });

    try {
        // Seleciona os campos que queremos retornar para não expor a senha
        const user = await User.findOne({ email }).select('nome email imagemPerfil provedor');
        if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar usuário', error: error.message });
    }
});


module.exports = router;