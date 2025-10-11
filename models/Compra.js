const mongoose = require('mongoose');

const compraSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  itens: [{
    eventoId: {
      type: String,
      required: true
    },
    nomeEvento: {
      type: String,
      required: true
    },
    tipoIngresso: {
      type: String,
      required: true,
      enum: ['Inteira', 'Meia']
    },
    preco: {
      type: Number,
      required: true
    },
    quantidade: {
      type: Number,
      required: true,
      min: 1
    },
    dataEvento: {
      type: String,
      required: true
    },
    localEvento: {
      type: String,
      required: true
    },
    imagem: {
      type: String,
      required: true
    }
  }],
  total: {
    type: Number,
    required: true
  },
  dataCompra: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pendente', 'aprovada', 'cancelada'],
    default: 'pendente'
  }
}, { timestamps: true });

module.exports = mongoose.model('Compra', compraSchema);