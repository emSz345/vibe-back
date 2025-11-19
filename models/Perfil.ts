// models/Perfil.ts
import { Schema, model, Document, Types } from 'mongoose';

// Interface para o subdocumento 'dadosPessoais'
export interface IDadosPessoais {
    cpf?: string;
    cnpj?: string;
    dataNascimento?: Date;
    telefone?: string;
    nomeCompleto?: string;
}

// Interface para o subdocumento 'dadosOrganizacao'
export interface IDadosOrganizacao {
    razaoSocial?: string;
    nomeFantasia?: string;
    inscricaoMunicipal?: string;
    cpfSocio?: string;
}

// Interface principal do Perfil
export interface IPerfil extends Document {
    userId: Types.ObjectId; // Ref: 'User'
    tipoPessoa: 'cpf' | 'cnpj';
    dadosPessoais: IDadosPessoais;
    dadosOrganizacao: IDadosOrganizacao;

    // Vínculo com o Mercado Pago (todos opcionais)
    mercadoPagoAccountId?: string;
    mercadoPagoAccessToken?: string;
    mercadoPagoRefreshToken?: string;
    mercadoPagoPublicKey?: string;
    mercadoPagoEmail?: string;
    
    // Timestamps
    createdAt: Date;
    updatedAt: Date;
}

// Schema tipado com a interface
const PerfilSchema = new Schema<IPerfil>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  tipoPessoa: {
    type: String,
    enum: ['cpf', 'cnpj'],
    required: true
  },
  // Definindo os objetos aninhados
  dadosPessoais: {
    cpf: { type: String },
    cnpj: { type: String },
    dataNascimento: { type: Date },
    telefone: { type: String },
    nomeCompleto: { type: String }
  },
  dadosOrganizacao: {
    razaoSocial: { type: String },
    nomeFantasia: { type: String },
    inscricaoMunicipal: { type: String },
    cpfSocio: { type: String }
  },

  // Vínculo com o Mercado Pago
  mercadoPagoAccountId: { type: String },
  mercadoPagoAccessToken: { type: String },
  mercadoPagoRefreshToken: { type: String },
  mercadoPagoPublicKey: { type: String },
  mercadoPagoEmail: { type: String },

}, { timestamps: true });

export default model<IPerfil>('Perfil', PerfilSchema);