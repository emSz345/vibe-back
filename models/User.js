const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String }, // mesmo se for login social, pode deixar vazio
  provedor: { type: String, default: 'local' }, // local, google, facebook, apple
  imagemPerfil: { 
    type: String, 
    default: 'blank_profile.png',
    set: function(value) {
      // Se receber nova imagem, substitui qualquer valor anterior
      // Quando uma nova imagem é definida, marca como local
      if (value && !value.startsWith('http')) {
        this.__hasLocalImage = true;
      }
      return this.imagemPerfil = value;
    }
  },
  __hasLocalImage: { type: Boolean, select: false },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String, required: false },
  resetPasswordToken: { type: String }, // Novo campo para token de redefinição
  resetPasswordExpires: { type: Date },  // Novo campo para expiração do token
  isAdmin: { type: Boolean, default: false, required: true },
  // Adicione dentro do schema
  provedor: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local'
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
