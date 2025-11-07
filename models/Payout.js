// models/Payout.js
const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
    // ID do produtor (do seu model Perfil)
    produtorId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Perfil', 
        required: true 
    },
    // ID do pedido (para linkar com o Ingresso)
    pedidoId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    // ID do pagamento no MP (para referência)
    paymentId: { 
        type: String, 
        required: true 
    },
    // Valor líquido que o produtor deve receber
    valorAPagar: { 
        type: Number, 
        required: true 
    },
    // Quando este dinheiro pode ser liberado
    dataLiberacao: { 
        type: Date, 
        required: true 
    },
    // Status do nosso Payout interno
    status: { 
        type: String, 
        enum: ['Pendente', 'Pago', 'Erro', 'Reembolsado'], 
        default: 'Pendente' 
    },
    // ID do Payout gerado pelo MP (quando for 'Pago')
    mpPayoutId: { 
        type: String 
    },
    // Log de erro (se o status for 'Erro')
    erro: { 
        type: String 
    }
}, { timestamps: true });

module.exports = mongoose.model('Payout', payoutSchema);