// models/Event.ts
import { Schema, model, Document, Types } from 'mongoose';

import { IUser } from './User';

// Interface para o subdocumento 'doadores'
export interface IDoador {
    _id?: Types.ObjectId; // Mongoose adiciona _id
    usuarioId?: Types.ObjectId;
    imagemPerfil?: string;
    nome?: string;
    valorDoacao?: number;
    dataDoacao?: Date;
    aprovadoParaCarrossel?: boolean;
}

// Interface principal do Evento
export interface IEvent extends Document {
    nome: string;
    imagem: string;
    categoria: string;
    descricao: string;
    cep: string;
    rua: string;
    bairro: string;
    numero: string;
    complemento?: string;
    cidade: string;
    estado: string;
    linkMaps: string;
    dataInicio: string;
    horaInicio: string;
    horaTermino: string;
    dataFimVendas?: string;
    dataInicioVendas?: string;
    valorIngressoInteira?: number;
    valorIngressoMeia?: number;
    quantidadeInteira?: number;
    quantidadeMeia?: number;
    temMeia?: boolean;
    querDoar?: boolean;
    valorDoacao?: number;
    criadoPor: Types.ObjectId | IUser;
    status: "em_analise" | "aprovado" | "rejeitado" | "em_reanalise";
    doadores: Types.DocumentArray<IDoador>;
    // Timestamps (createdAt, updatedAt) são adicionados automaticamente
}

const eventSchema = new Schema<IEvent>({
    nome: { type: String, required: true },
    imagem: { type: String, required: true },
    categoria: { type: String, required: true },
    descricao: { type: String, required: true },
    cep: { type: String, required: true },
    rua: { type: String, required: true },
    bairro: { type: String, required: true },
    numero: { type: String, required: true },
    complemento: { type: String },
    cidade: { type: String, required: true },
    estado: { type: String, required: true },
    linkMaps: { type: String, required: true },
    dataInicio: { type: String, required: true },
    horaInicio: { type: String, required: true },
    horaTermino: { type: String, required: true },
    dataFimVendas: { type: String },
    dataInicioVendas: { type: String },
    valorIngressoInteira: { type: Number },
    valorIngressoMeia: { type: Number },
    quantidadeInteira: { type: Number },
    quantidadeMeia: { type: Number },
    temMeia: { type: Boolean, default: false },
    querDoar: { type: Boolean, default: false },
    valorDoacao: { type: Number, default: 0 },
    criadoPor: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ["em_analise", "aprovado", "rejeitado", "em_reanalise"],
        default: "em_analise"
    },
    doadores: [{
        usuarioId: { type: Schema.Types.ObjectId, ref: 'User' },
        imagemPerfil: { type: String },
        nome: { type: String },
        valorDoacao: { type: Number },
        dataDoacao: { type: Date, default: Date.now },
        aprovadoParaCarrossel: { type: Boolean, default: false }
    }]
}, { timestamps: true });

export default model<IEvent>('Event', eventSchema);