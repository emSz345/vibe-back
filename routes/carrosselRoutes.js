    // routes/carrosselRoutes.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

router.use(express.json());

const CarrosselImage = require('../models/CarrosselImage');

// Garante que a pasta de uploads do carrossel exista
const carrosselDir = path.join(__dirname, '..', 'uploads', 'carrossel');
if (!fs.existsSync(carrosselDir)) {
    fs.mkdirSync(carrosselDir, { recursive: true });
}

// Configuração do Multer para salvar as imagens na pasta do carrossel
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, carrosselDir);
    },
    filename: (req, file, cb) => {
        // Usa o timestamp para criar um nome de arquivo único
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Rota POST para fazer o upload de uma nova imagem
// Usa 'upload.single('image')' porque o frontend enviará apenas um arquivo por vez
router.post('/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Nenhum arquivo enviado.' });
        }

        // Cria uma nova entrada no banco de dados com o nome do arquivo
        const newImage = new CarrosselImage({ filename: req.file.filename });
        await newImage.save();

        res.status(201).json({ message: 'Imagem enviada e salva com sucesso!', filename: req.file.filename });
    } catch (error) {
        console.error('Erro ao fazer upload da imagem:', error);
        res.status(500).json({ message: 'Erro no servidor ao salvar a imagem.' });
    }
});

// Rota GET para listar todas as imagens do carrossel
router.get('/', async (req, res) => {
    try {
        const images = await CarrosselImage.find({});
        // Retorna apenas o nome do arquivo de cada imagem para o frontend
        res.status(200).json(images.map(img => img.filename));
    } catch (error) {
        console.error('Erro ao buscar imagens do carrossel:', error);
        res.status(500).json({ message: 'Erro no servidor ao buscar as imagens.' });
    }
});

// Rota DELETE para remover uma imagem
router.delete('/delete/:imageName', async (req, res) => {
    try {
        const { imageName } = req.params;
        const imagePath = path.join(carrosselDir, imageName);

        // Remove o arquivo da pasta 'uploads/carrossel'
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }

        // Remove a referência da imagem do banco de dados
        await CarrosselImage.deleteOne({ filename: imageName });

        res.status(200).json({ message: 'Imagem removida com sucesso!' });
    } catch (error) {
        console.error('Erro ao remover imagem:', error);
        res.status(500).json({ message: 'Erro no servidor ao remover a imagem.' });
    }
});

module.exports = router;
