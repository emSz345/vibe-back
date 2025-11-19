import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { connectDB } from './config/db';
import { iniciarCronLimpezaIngressos } from './services/limpezaScheduler';
import { iniciarCronPayout } from './services/payoutScheduler';
import { setupDirectories } from './utils/setupDirectories';

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const startServer = async () => {
  try {
    console.log(`🚀 Iniciando servidor em modo: ${NODE_ENV}`);

    // Garante que diretórios necessários existem (como uploads/public)
    setupDirectories();

    // Conexão com banco de dados
    await connectDB();

    // Inicia o servidor Express
    app.listen(PORT, () => {
      console.log(`✅ Servidor rodando na porta ${PORT}`);

      // Só inicia os CRON JOBS em produção
      if (NODE_ENV === 'production') {
        console.log('🕒 Ambiente de PRODUÇÃO detectado. Iniciando cron jobs...');
        iniciarCronPayout();
        iniciarCronLimpezaIngressos();
      } else {
        console.log('⚙️ Ambiente de DESENVOLVIMENTO — cron jobs não iniciados.');
      }
    });

  } catch (error) {
    console.error('❌ Falha ao iniciar o servidor:', error);
    process.exit(1);
  }
};

startServer();
