// routes/carrosselRoutes.ts

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs'; // Ainda precisamos do 'fs' para o 'unlinkSync' (deletar)
import CarrosselImage, { ICarrosselImage } from '../models/CarrosselImage';

const router = Router();

// --- CORREÇÃO ---
// 1. Usamos process.cwd() para pegar a raiz do projeto ('vibe-back')
// 2. Construímos o caminho a partir daí.
const projectRoot = process.cwd();
const carrosselDir = path.join(projectRoot, 'uploads', 'carrossel');
// --- FIM DA CORREÇÃO ---


// --- REMOVIDO ---
// O bloco 'if (!fs.existsSync...)' foi removido.
// O server.ts (via setupDirectories) é o único responsável por criar pastas.
// --- FIM DA REMOÇÃO ---


const storage = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb: Function) => {
        // Agora esta variável 'carrosselDir' está correta
        cb(null, carrosselDir);
    },
    filename: (req: Request, file: Express.Multer.File, cb: Function) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Rota POST para upload
router.post('/upload', upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Nenhum arquivo enviado.' });
        }

        const { eventoId } = req.body as { eventoId?: string };

        const newImage = new CarrosselImage({
            filename: req.file.filename,
            eventoId: eventoId || null
        });
        await newImage.save();

        res.status(201).json({
            message: 'Imagem enviada e salva com sucesso!',
            filename: req.file.filename,
            eventoId: eventoId || null
        });
    } catch (error) {
        next(error);
    }
});

// Rota GET para listar
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const images: ICarrosselImage[] = await CarrosselImage.find({});
        res.status(200).json(images.map(img => ({
            filename: img.filename,
            eventoId: img.eventoId
        })));
    } catch (error) {
        next(error);
    }
});

// Rota DELETE para remover
router.delete('/delete/:imageName', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { imageName } = req.params;
        const decodedImageName = decodeURIComponent(imageName);

        // Esta variável 'carrosselDir' também está correta agora
        const imagePath = path.join(carrosselDir, decodedImageName);

        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath); // Deleta o arquivo físico
        } else {
            console.warn(`Arquivo não encontrado: ${imagePath}`);
            // Não retorne um erro 404 aqui, pois podemos querer deletar
            // apenas a referência do banco de dados se o arquivo já se foi.
        }

        const result = await CarrosselImage.deleteOne({ filename: decodedImageName });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Imagem não encontrada no banco de dados.' });
        }

        res.status(200).json({ message: 'Imagem removida com sucesso!' });
    } catch (error) {
        next(error);
    }
});

export default router;