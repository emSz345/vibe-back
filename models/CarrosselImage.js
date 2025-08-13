const mongoose = require('mongoose');

// Define o schema do documento no MongoDB.
// Neste caso, cada documento terá apenas o nome do arquivo da imagem.
const carrosselImageSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true,
        unique: true // Garante que não teremos nomes de arquivos duplicados
    },
    // Você pode adicionar outros campos aqui se precisar, como a data do upload
    // uploadDate: {
    //     type: Date,
    //     default: Date.now
    // }
});

const CarrosselImage = mongoose.model('CarrosselImage', carrosselImageSchema);

module.exports = CarrosselImage;
