const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  imagem: { type: String, required: true },
  categoria: { type: String, required: true },
  descricao: { type: String, required: true },
  rua: { type: String, required: true },
  cidade: { type: String, required: true },
  estado: { type: String, required: true },
  linkMaps: { type: String, required: true },
  dataInicio: { type: String, required: true },
  horaInicio: { type: String, required: true },
  dataFim: { type: String }, // NOVO
  valorIngressoInteira: { type: Number }, // NOVO
  valorIngressoMeia: { type: Number }, // NOVO
  quantidadeInteira: { type: Number }, // NOVO
  quantidadeMeia: { type: Number }, // NOVO
  temMeia: { type: Boolean, default: false }, // NOVO
  querDoar: { type: Boolean, default: false },
  valorDoacao: { type: Number, default: 0 },
  criadoPor: { type: String, required: true }
}, { timestamps: true });


module.exports = mongoose.model('Event', eventSchema);
