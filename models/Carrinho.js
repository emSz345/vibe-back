const mongoose = require('mongoose');

const CarrinhoItemSchema = new mongoose.Schema({
  eventoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  nomeEvento: {
    type: String,
    required: true
  },
  tipoIngresso: {
    type: String,
    enum: ['Inteira', 'Meia'],
    required: true
  },
  preco: {
    type: Number,
    required: true
  },
  quantidade: {
    type: Number,
    required: true,
    min: 1,
    max: 8
  },
  imagem: String,
  dataEvento: String,
  localEvento: String
});

const CarrinhoSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // Um carrinho por usuário
  },
  itens: [CarrinhoItemSchema],
  dataAtualizacao: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Atualiza dataAtualizacao sempre que o carrinho for modificado
CarrinhoSchema.pre('save', function(next) {
  this.dataAtualizacao = Date.now();
  next();
});

module.exports = mongoose.model('Carrinho', CarrinhoSchema);