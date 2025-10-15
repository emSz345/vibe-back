const mongoose = require('mongoose');

const PerfilSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  tipoPessoa: {
    type: String,
    enum: ['cpf', 'cnpj'],
    required: true
  },
  // Dados pessoais que se aplicam a CPF ou CNPJ
  dadosPessoais: {
    // Campos separados para CPF e CNPJ
    cpf: { type: String, required: false },
    cnpj: { type: String, required: false },

    dataNascimento: { type: Date, required: false },
    telefone: { type: String, required: false },
    nomeCompleto: { type: String, required: false }
  },
  // Dados específicos para uma organização (CNPJ)
  dadosOrganizacao: {
    razaoSocial: { type: String, required: false },
    nomeFantasia: { type: String, required: false },
    inscricaoMunicipal: { type: String, required: false },
    cpfSocio: { type: String, required: false }
  },

  mercadoPagoAccountId: {
    type: String,
    required: false // É opcional, pois nem todo usuário será um criador de eventos
  }
}, { timestamps: true });

module.exports = mongoose.model('Perfil', PerfilSchema);