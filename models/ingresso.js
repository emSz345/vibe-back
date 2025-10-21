const mongoose = require('mongoose');

const ingressoSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // ID do Pedido (agrupa a transação)
    pedidoId: {
        type: String,
        required: true,
        index: true
    },
    // ID do Pagamento (vem do webhook, por isso não é obrigatório)
    paymentId: {
        type: String,
        required: false, // <-- Confirme que está 'false'
        unique: true,    // <-- ADICIONE ISSO
        sparse: true     // <-- ADICIONE ISSO (O MAIS IMPORTANTE)
    },
    // Link para o evento
    eventoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    // CAMPOS REDUNDANTES REMOVIDOS (nomeEvento, dataEvento, localEvento)
    // Use .populate('eventoId') para buscar esses dados.
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
        enum: ['Pago', 'Pendente', 'Cancelado', 'Recusado'], // <-- 'Recusado' adicionado
        default: 'Pendente'
    },
}, { timestamps: true });

// Índice composto (bom para garantir que um ingresso não seja duplicado por engano)
ingressoSchema.index({ pedidoId: 1, eventoId: 1, userId: 1 });

const Ingresso = mongoose.models.Ingresso || mongoose.model('Ingresso', ingressoSchema);

module.exports = Ingresso;