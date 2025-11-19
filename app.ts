import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';

// Importe seu roteador mestre
import apiRoutes from './routes';

// =================================================================
// 🚀 Inicialização do App
// =================================================================
const app: Express = express();
const front = process.env.FRONTEND_URL as string;

// =================================================================
// ⚙️ Configuração de Middlewares
// =================================================================
app.use(cors({
    origin: front,
    credentials: true,
    allowedHeaders: [
        'Origin', 'X-Requested-With', 'Content-Type',
        'Accept', 'Authorization', 'user-id'
    ],
    exposedHeaders: ['Set-Cookie']
}));

app.use(cookieParser());

app.use(express.json({
    limit: '10mb',
    verify: (req: any, res, buf) => {
        if (req.originalUrl.startsWith('/api/pagamento/webhook')) {
            req.rawBody = buf;
        }
    }
}));

// Servir Arquivos Estáticos
const projectRoot = process.cwd();

app.use('/uploads', express.static(path.join(projectRoot, 'uploads')));
app.use(express.static(path.join(projectRoot, 'public')));


// =================================================================
// 🗺️ Rotas da API (AGORA SÓ UMA LINHA!)
// =================================================================
app.use('/api', apiRoutes);


// =================================================================
// 🚦 Middlewares de Erro (Devem vir DEPOIS das rotas)
// =================================================================

// --- Middleware de 404 (Rota não encontrada) ---
app.use((req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: "Desculpe, a página que você procura não foi encontrada."
    });
});

// --- Middleware de Tratamento de Erros Global ---
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('🔥 ERRO NÃO TRATADO:', err.stack);
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
});

export default app; // ⬅️ Exporte o app!