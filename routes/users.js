const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

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
  const imagemPerfil = req.file ? req.file.filename : null;

  try {
    let user = await User.findOne({ email });

    if (user) {
      return res.status(200).json({
        message: 'Usuário já existe',
        user,
        token: jwt.sign({ id: user._id, nome: user.nome }, SECRET, { expiresIn: '7d' })
      });
    }

    const hashedPassword = await bcrypt.hash(senha, 10);

    user = new User({ nome, email, senha: hashedPassword, provedor, imagemPerfil });
    await user.save();

    const token = jwt.sign({ id: user._id, nome: user.nome }, SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Usuário cadastrado com sucesso',
      user,
      token
    });
  } catch (err) {
    res.status(500).json({ message: 'Erro ao cadastrar usuário', error: err.message });
  }
});


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


// Login local
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ message: 'Email e senha são obrigatórios' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Usuário não encontrado' });

    const senhaCorreta = await bcrypt.compare(senha, user.senha);
    if (!senhaCorreta) return res.status(401).json({ message: 'Senha incorreta' });

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

// Buscar nome do usuário pelo email
router.get('/me', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ message: 'Email é obrigatório' });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });

    res.json({ nome: user.nome });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar usuário', error: error.message });
  }
});

module.exports = router;
