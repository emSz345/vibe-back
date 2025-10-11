// models/CarrosselImage.js
const mongoose = require('mongoose');

const carrosselImageSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true,
        unique: true
    },
    eventoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: false
    }
});

const CarrosselImage = mongoose.model('CarrosselImage', carrosselImageSchema);

module.exports = CarrosselImage;
