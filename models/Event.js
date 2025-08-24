const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  imagem: { type: String, required: true },
  categoria: { type: String, required: true },
  descricao: { type: String, required: true },
  // --- Novos campos de endereço ---
  cep: { type: String, required: true },
  rua: { type: String, required: true },
  bairro: { type: String, required: true },
  numero: { type: String, required: true },
  complemento: { type: String }, // Complemento é opcional
  // --- Fim dos novos campos de endereço ---
  cidade: { type: String, required: true },
  estado: { type: String, required: true },
  linkMaps: { type: String, required: true },
  dataInicio: { type: String, required: true }, // Mantenha como String se o front estiver enviando assim
  horaInicio: { type: String, required: true },
  horaTermino: { type: String, required: true },
  dataFim: { type: String }, // NOVO - Verifique se este campo é 'dataFim' ou 'dataFimVendas'
  valorIngressoInteira: { type: Number },
  valorIngressoMeia: { type: Number },
  quantidadeInteira: { type: Number },
  quantidadeMeia: { type: Number },
  temMeia: { type: Boolean, default: false },
  querDoar: { type: Boolean, default: false },
  valorDoacao: { type: Number, default: 0 },
  criadoPor: { 
  type: mongoose.Schema.Types.ObjectId, 
  ref: 'User', 
  required: true 
},
  status: { 
  type: String, 
   enum: ["em_analise", "aprovado", "rejeitado", "em_reanalise"],
  default: "em_analise" 
}
}, { timestamps: true });


module.exports = mongoose.model('Event', eventSchema);
