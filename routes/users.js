const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const SECRET = '6e7d06b1a1f8f8492cd56729eebdf6f83d6c3ff7288be60a12c07a1c5f1d3e85';
 // substitua por um segredo forte e seguro

// Cadastro de usuário
router.post('/register', async (req, res) => {
  const { nome, email, senha, provedor } = req.body;

  try {
    let user = await User.findOne({ email });

    if (user) {
      return res.status(200).json({
        message: 'Usuário já existe',
        user,
        token: jwt.sign({ id: user._id, nome: user.nome }, SECRET, { expiresIn: '7d' })
      });
    }

    user = new User({ nome, email, senha, provedor });
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
