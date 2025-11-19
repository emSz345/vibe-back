// models/Carrinho.ts
import { Schema, model, Document, Types } from 'mongoose';

// Interface para o subdocumento 'itens'
// Define a "forma" de um item de carrinho em TypeScript
export interface ICarrinhoItem {
    _id?: Types.ObjectId;
    eventoId: Types.ObjectId; // Referência ao Event
    nomeEvento: string;
    tipoIngresso: 'Inteira' | 'Meia'; // Usamos Union Types para 'enum'
    preco: number;
    quantidade: number;
    imagem?: string; // O '?' torna o campo opcional
    dataEvento?: string;
    localEvento?: string;
}

// Interface principal do Carrinho
// Ela estende 'Document' para incluir propriedades do Mongoose (como _id, save(), etc.)
export interface ICarrinho extends Document {
    usuarioId: Types.ObjectId; // Referência ao User
    itens: ICarrinhoItem[]; // Um array de itens de carrinho
    dataAtualizacao: Date;
}

// Schema para o subdocumento (igual ao JS)
const CarrinhoItemSchema = new Schema<ICarrinhoItem>({
    eventoId: {
        type: Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    nomeEvento: { type: String, required: true },
    tipoIngresso: {
        type: String,
        enum: ['Inteira', 'Meia'],
        required: true
    },
    preco: { type: Number, required: true },
    quantidade: {
        type: Number,
        required: true,
        min: 1,
        max: 8
    },
    imagem: String,
    dataEvento: String,
    localEvento: String
});

// Schema principal, agora tipado com <ICarrinho>
const CarrinhoSchema = new Schema<ICarrinho>({
    usuarioId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    itens: [CarrinhoItemSchema], // Usamos o schema do subdocumento aqui
    dataAtualizacao: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Tipando 'this' no hook pre-save
CarrinhoSchema.pre('save', function(this: ICarrinho, next) {
    this.dataAtualizacao = new Date(); // Date.now() também funciona
    next();
});

// Exportamos o modelo, tipando-o com <ICarrinho>
export default model<ICarrinho>('Carrinho', CarrinhoSchema);