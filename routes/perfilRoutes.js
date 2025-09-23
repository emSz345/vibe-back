// routes/perfilRoutes.js
const express = require('express');
const Perfil = require('../models/Perfil');

const router = express.Router();

router.use(express.json());

router.put('/salvar/:userId', async (req, res) => {
  const { userId } = req.params;
  const { tipoPessoa, dadosPessoais, dadosOrganizacao } = req.body;

  try {
    let perfil = await Perfil.findOneAndUpdate(
      { userId: userId },
      { tipoPessoa, dadosPessoais, dadosOrganizacao },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({ message: 'Dados de perfil salvos com sucesso!', perfil });

  } catch (error) {
    console.error("Erro ao salvar o perfil:", error);
    res.status(500).json({ message: 'Erro interno do servidor', error });
  }
});

router.get('/:userId', async (req, res) => {
  try {
    const perfil = await Perfil.findOne({ userId: req.params.userId });
    if (!perfil) {
      return res.status(404).json({ message: 'Perfil não encontrado.' });
    }
    res.status(200).json(perfil);
  } catch (error) {
    console.error("Erro ao buscar o perfil:", error);
    res.status(500).json({ message: 'Erro interno do servidor', error });
  }
});

module.exports = router;