// models/CarrosselImage.ts
import { Schema, model, Document, Types } from 'mongoose';

// Interface que define a "forma" do documento
export interface ICarrosselImage extends Document {
    filename: string;
    eventoId?: Types.ObjectId; // '?' indica que é opcional
}

// Schema tipado com a interface
const carrosselImageSchema = new Schema<ICarrosselImage>({
    filename: {
        type: String,
        required: true,
        unique: true
    },
    eventoId: {
        type: Schema.Types.ObjectId,
        ref: 'Event',
        required: false // O 'required: false' alinha com o '?' da interface
    }
});

// Exportação tipada
export default model<ICarrosselImage>('CarrosselImage', carrosselImageSchema);