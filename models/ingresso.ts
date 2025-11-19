// models/ingresso.ts
import { Schema, model, Model, Document, Types, models } from 'mongoose';

// Enumerações de Status e Tipo para reuso e clareza
export type TipoIngresso = 'Inteira' | 'Meia';
export type StatusIngresso = 'Pago' | 'Pendente' | 'Cancelado' | 'Recusado' | 'Expirado' | 'Reembolsado';

// Interface principal do Ingresso
export interface IIngresso extends Document {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    pedidoId: string;
    paymentId?: string;
    eventoId: Types.ObjectId;
    nomeEvento: string;
    dataEvento: string | Date; // Data é usada no e-mail
    localEvento: string; // Local é usado no e-mail
    tipoIngresso: TipoIngresso;
    valor: number;
    status: StatusIngresso;
    expiresAt?: Date; 
    createdAt: Date;
    updatedAt: Date;
}

const ingressoSchema = new Schema<IIngresso>({
    userId: {
        type: Schema.Types.ObjectId,
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
        sparse: true
    },
    eventoId: {
        type: Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    nomeEvento: { type: String, required: true },
    dataEvento: { type: Schema.Types.Mixed, required: true }, // Mixed para aceitar Date ou String
    localEvento: { type: String, required: true },
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
        enum: ['Pago', 'Pendente', 'Cancelado', 'Recusado', 'Expirado', 'Reembolsado'],
        default: 'Pendente'
    },
    expiresAt: {
        type: Date,
        // Tipando 'this' na função de validação
        required: function (this: IIngresso) {
            return this.status === 'Pendente';
        }
    }
}, { timestamps: true });

ingressoSchema.index({ status: 1, expiresAt: 1 });

// Padrão para evitar recriação de model, agora com tipos
const Ingresso = (models.Ingresso as Model<IIngresso>) || model<IIngresso>('Ingresso', ingressoSchema);

export default Ingresso;