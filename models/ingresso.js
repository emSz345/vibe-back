const mongoose = require('mongoose');

const ingressoSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    pedidoId: {
        type: String,
        required: true,
        index: true
    },
    paymentId: {
        type: String,
        required: false,
        sparse: true // Ótimo que você adicionou isso!
    },
    eventoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
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
        // 🔥 MUDANÇA AQUI: Adicionado 'Expirado'
        enum: ['Pago', 'Pendente', 'Cancelado', 'Recusado', 'Expirado', 'Reembolsado'],
        default: 'Pendente'
    },
    // 🔥 CAMPO NOVO E CRUCIAL (que faltou):
    expiresAt: {
        type: Date,
        // Define que este campo só é necessário se o status for 'Pendente'
        required: function () { return this.status === 'Pendente'; }
    }
}, { timestamps: true });

// 🔥 ÍNDICE CRUCIAL para o Cron Job (que faltou):
// Ele busca todos os ingressos 'Pendente' que já 'expiraram'
ingressoSchema.index({ status: 1, expiresAt: 1 });

// Linha para evitar recriação do model em ambientes de dev (correto)
const Ingresso = mongoose.models.Ingresso || mongoose.model('Ingresso', ingressoSchema);

module.exports = Ingresso;