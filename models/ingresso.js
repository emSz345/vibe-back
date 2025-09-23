const mongoose = require('mongoose');

const ingressoSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    paymentId: {
        type: String,
        required: true,
        unique: true
    },
    nomeEvento: {
        type: String,
        required: true
    },
    dataEvento: {
        type: String,
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

const Ingresso = mongoose.models.Ingresso || mongoose.model('Ingresso', ingressoSchema);

module.exports = Ingresso;
