const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String },
  provedor: {
    type: String,
    enum: ['local', 'google', 'facebook'], // Corrigido para ter apenas uma definição
    default: 'local'
  },
  imagemPerfil: { 
    type: String, 
    default: 'blank_profile.png',
    set: function(value) {
      if (value && !value.startsWith('http')) {
        this.__hasLocalImage = true;
      }
      return this.imagemPerfil = value;
    }
  },
  __hasLocalImage: { type: Boolean, select: false },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String, required: false },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  
  // SUBSTITUA O CAMPO 'isAdmin' POR ESTE:
  role: {
    type: String,
    enum: ['USER', 'MANAGER_SITE', 'SUPER_ADMIN'], // Nossas 3 funções possíveis
    default: 'USER' // Todo novo usuário é 'USER' por padrão
  }

}, { timestamps: true });

// Pequeno ajuste para garantir que o campo 'isAdmin' não será mais considerado
// se você quiser mantê-lo por um tempo para migração. Se não, pode remover.
userSchema.virtual('isAdmin').get(function() {
  return this.role === 'SUPER_ADMIN' || this.role === 'MANAGER_SITE';
});


module.exports = mongoose.model('User', userSchema);