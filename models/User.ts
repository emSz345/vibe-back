// models/User.ts
import { Schema, model, Document, Types } from 'mongoose';

// Enumerações para reuso
export type UserProvider = 'local' | 'google' | 'facebook';
export type UserRole = 'USER' | 'MANAGER_SITE' | 'SUPER_ADMIN';

// Interface principal do Usuário
export interface IUser extends Document {
  _id: Types.ObjectId;
  nome: string;
  email: string;
  senha?: string;
  provedor: UserProvider;
  imagemPerfil: string;
  __hasLocalImage?: boolean; // Interno do Mongoose (select: false)
  isVerified: boolean;
  verificationToken?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  role: UserRole;

  // Virtual
  isAdmin?: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  senha: { type: String },
  provedor: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local'
  },
  imagemPerfil: {
    type: String,
    default: 'blank_profile.png',
    // Tipando o 'this' dentro do setter
    set: function (this: IUser, value: string) {
      if (value && !value.startsWith('http')) {
        this.__hasLocalImage = true;
      }
      // Note: O setter original tinha um bug. Ele retornava o valor
      // mas não o atribuía a this.imagemPerfil. 
      // O Mongoose lida com a atribuição implicitamente ao retornar o valor.
      // A linha 'this.imagemPerfil = value' é redundante e pode causar loop.
      // Apenas retornando o valor é o padrão.
      // No entanto, se o seu código original 'return this.imagemPerfil = value'
      // estava funcionando, pode mantê-lo.
      // O padrão Mongoose é:
      this.set('imagemPerfil', value); // Forma segura
      return value; // Retorna o valor processado
    }
  },
  __hasLocalImage: { type: Boolean, select: false },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String, required: false },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  role: {
    type: String,
    enum: ['USER', 'MANAGER_SITE', 'SUPER_ADMIN'],
    default: 'USER'
  }
}, {
  timestamps: true,
  // Garante que os virtuais sejam incluídos ao usar .toJSON() ou .toObject()
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Tipando o 'this' dentro do getter do virtual
userSchema.virtual('isAdmin').get(function (this: IUser) {
  return this.role === 'SUPER_ADMIN' || this.role === 'MANAGER_SITE';
});


export default model<IUser>('User', userSchema);