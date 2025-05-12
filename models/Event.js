const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  imagem: { type: String, required: true }, // Salve a URL da imagem ou nome do arquivo
  categoria: { type: String, required: true },
  descricao: { type: String, required: true },
  rua: { type: String, required: true },
  cidade: { type: String, required: true },
  estado: { type: String, required: true },
  linkMaps: { type: String, required: true },
  dataInicio: { type: String, required: true },
  horaInicio: { type: String, required: true },
  querDoar: { type: Boolean, default: false },
  valorDoacao: { type: Number, default: 0 },
  criadoPor: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
