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
  dadosPessoais: {
    cpf: { type: String },
    cnpj: { type: String },
    dataNascimento: { type: Date },
    telefone: { type: String },
    nomeCompleto: { type: String }
  },
  dadosOrganizacao: {
    razaoSocial: { type: String },
    nomeFantasia: { type: String },
    inscricaoMunicipal: { type: String },
    cpfSocio: { type: String }
  },

  // 🔹 Vínculo com o Mercado Pago
  mercadoPagoAccountId: { type: String },
  mercadoPagoAccessToken: { type: String },
  mercadoPagoRefreshToken: { type: String },
  mercadoPagoPublicKey: { type: String },
  mercadoPagoEmail: { type: String },

}, { timestamps: true });

module.exports = mongoose.model('Perfil', PerfilSchema);
