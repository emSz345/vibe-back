const mongoose = require('mongoose');

const CarrinhoItemSchema = new mongoose.Schema({
    // O Mongoose adicionará automaticamente o _id aqui, que será usado como itemId no frontend
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
        max: 8 // Mantenha o limite máximo se este for um requisito
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
        // 🔥 CRÍTICO: Garante que só há um carrinho por usuário
        unique: true
    },
    itens: [CarrinhoItemSchema],
    dataAtualizacao: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

CarrinhoSchema.pre('save', function(next) {
    this.dataAtualizacao = Date.now();
    next();
});

module.exports = mongoose.model('Carrinho', CarrinhoSchema);