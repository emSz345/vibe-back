const mongoose = require('mongoose');

const ingressoSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true 
    },
    paymentId: {
        type: String,
        required: true,
        unique: true // Garante que não haverá duplicidade de pagamentos
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
        enum: ['Pago', 'Pendente', 'Cancelado'], // Status possíveis
        default: 'Pendente'
    },
    // Você pode adicionar mais campos se precisar, como local, tipo de ingresso, etc.
}, { timestamps: true });

const Ingresso = mongoose.model('Ingresso', ingressoSchema);

module.exports = Ingresso;
