const mongoose = require('mongoose');

const ingressoSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    paymentId: {
        type: String,
        required: true,
    },
    eventoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    nomeEvento: {
        type: String,
        required: true
    },
    dataEvento: {
        type: String,
        required: true
    },
    localEvento: {
        type: String,
        required: true
    },
    tipoIngresso: {
        type: String,
        enum: ['Inteira', 'Meia'],
        required: true
    },
    valor: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ['Pago', 'Pendente', 'Cancelado'],
        default: 'Pendente'
    },
}, { timestamps: true });

// Índice composto para evitar duplicação (boa prática)
ingressoSchema.index({ paymentId: 1, userId: 1, eventoId: 1 });

const Ingresso = mongoose.models.Ingresso || mongoose.model('Ingresso', ingressoSchema);

module.exports = Ingresso;