import mongoose from 'mongoose';

export const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI as string;

    if (!mongoUri) {
        console.error("❌ ERRO: MONGO_URI não definida no .env");
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoUri);
        console.log("✅ MongoDB conectado");
    } catch (err) {
        console.error("❌ Erro ao conectar MongoDB:", err);
        process.exit(1);
    }
};