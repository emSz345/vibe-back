// models/Payout.ts
import { Schema, model, Document, Types } from 'mongoose';

// Enumeração para o Status
export type PayoutStatus = 'Pendente' | 'Pago' | 'Erro' | 'Reembolsado';

// Interface que define a "forma" do documento Payout
export interface IPayout extends Document {
    produtorId: Types.ObjectId; // Ref: 'Perfil'
    pedidoId: string;
    paymentId: string;
    valorAPagar: number;
    dataLiberacao: Date;
    status: PayoutStatus;
    mpPayoutId?: string; // Campos opcionais
    erro?: string;       // Campos opcionais
    // Timestamps
    createdAt: Date;
    updatedAt: Date;
}

// Schema tipado com a interface
const payoutSchema = new Schema<IPayout>({
    produtorId: { 
        type: Schema.Types.ObjectId, 
        ref: 'Perfil', 
        required: true 
    },
    pedidoId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    paymentId: { 
        type: String, 
        required: true 
    },
    valorAPagar: { 
        type: Number, 
        required: true 
    },
    dataLiberacao: { 
        type: Date, 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['Pendente', 'Pago', 'Erro', 'Reembolsado'], 
        default: 'Pendente' 
    },
    mpPayoutId: { 
        type: String 
    },
    erro: { 
        type: String 
    }
}, { timestamps: true });

export default model<IPayout>('Payout', payoutSchema);