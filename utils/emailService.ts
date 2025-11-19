// vibe-back/utils/emailService.ts

import * as nodemailer from 'nodemailer';
import { Attachment } from 'nodemailer/lib/mailer'; // Importando o tipo 'Attachment'
import * as qrcode from 'qrcode';
import 'dotenv/config'; // Usando o import para carregar o .env
import { IIngresso } from '../models/ingresso';

// --- INTERFACES TEMPORÁRIAS (Substituir pelos Models reais depois) ---
// TODO: Substituir por IUser do models/User.ts
interface MinimalUsuario {
    nome: string;
    email: string;
}

// TODO: Substituir por IIngresso do models/Ingresso.ts

// TODO: Substituir por IEvent do models/Event.ts
interface MinimalEvento {
    nome: string;
}

interface MinimalMotivo {
    titulo: string;
    descricao: string;
}

// Interface para a função genérica
interface EnviarEmailOptions {
    to: string;
    subject: string;
    html: string;
    attachments?: Attachment[]; // Usando o tipo importado
}
// --- FIM DAS INTERFACES TEMPORÁRIAS ---


const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Função genérica para enviar e-mails, agora com suporte a anexos.
 */
export const enviarEmail = async ({ to, subject, html, attachments }: EnviarEmailOptions) => {
    try {
        await transporter.sendMail({
            from: {
                name: 'VibeTicket Eventos',
                address: process.env.EMAIL_USER as string // Afirmamos que é string
            },
            to,
            subject,
            html,
            attachments
        });
        console.log(`E-mail enviado com sucesso para ${to}`);
    } catch (error) {
        console.error(`ERRO AO ENVIAR E-MAIL para ${to}:`, error);
    }
};

/**
 * Envia o e-mail do ingresso com QR Code em anexo.
 */
export const enviarEmailIngresso = async (usuario: MinimalUsuario, ingresso: IIngresso) => {
    if (!usuario || !usuario.email) {
        console.error('Dados do usuário inválidos para enviar e-mail de ingresso.');
        return;
    }
    const qrCodeDataUrl = await qrcode.toDataURL(ingresso._id.toString());
    const dataFormatada = new Date(ingresso.dataEvento).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric'
    });

    // O HTML do e-mail permanece o mesmo...
    const emailHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #ddd; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
            .header { font-size: 24px; font-weight: bold; color: #0969fb; text-align: center; margin-bottom: 20px; }
            .content p { line-height: 1.6; font-size: 16px; margin: 10px 0; }
            .ticket-details { background-color: #f9f9f9; border-left: 4px solid #0969fb; padding: 20px; margin: 20px 0; border-radius: 4px; }
            .qr-code { text-align: center; margin: 25px 0; }
            .footer { font-size: 12px; color: #888; text-align: center; margin-top: 30px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">Seu Ingresso Chegou!</div>
            <div class="content">
                <p>Olá, <strong>${usuario.nome}</strong>!</p>
                <p>Aqui está o seu ingresso para o evento. Apresente o QR Code abaixo na entrada.</p>
                
                <div class="ticket-details">
                    <p><strong>Evento:</strong> ${ingresso.nomeEvento}</p>
                    <p><strong>Data:</strong> ${dataFormatada}</p>
                    <p><strong>Local:</strong> ${ingresso.localEvento}</p>
                    <p><strong>Tipo:</strong> ${ingresso.tipoIngresso} (R$ ${ingresso.valor.toFixed(2)})</p>
                    <p><strong>Status:</strong> ${ingresso.status}</p>
                </div>

                <div class="qr-code">
                    <p style="font-weight: bold;">Seu QR Code de Entrada</p>
                    <img src="cid:qrcode_vibeticket" alt="QR Code do Ingresso"/>
                </div>

                <p>Aproveite o evento!</p>
            </div>
            <div class="footer">
                <p>Você recebeu este e-mail porque comprou um ingresso na VibeTicket Eventos.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    await enviarEmail({
        to: usuario.email,
        subject: `🎟️ Seu Ingresso para: ${ingresso.nomeEvento}`,
        html: emailHtml,
        attachments: [{
            filename: 'qrcode.png',
            path: qrCodeDataUrl,
            cid: 'qrcode_vibeticket'
        }]
    });
};


/**
 * Envia e-mail de REJEIÇÃO do evento.
 */
export const enviarEmailRejeicaoEvento = async (usuario: MinimalUsuario, evento: MinimalEvento, motivo: MinimalMotivo) => {
    if (!usuario || !usuario.email) {
        console.error('Dados do usuário inválidos para enviar e-mail de rejeição.');
        return;
    }

    // O HTML do e-mail permanece o mesmo...
    const emailHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #ddd; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
            .header { font-size: 24px; font-weight: bold; color: #e74c3c; text-align: center; margin-bottom: 20px; }
            .content p { line-height: 1.6; font-size: 16px; margin: 10px 0; }
            .evento-details { background-color: #f9f9f9; border-left: 4px solid #e74c3c; padding: 20px; margin: 20px 0; border-radius: 4px; }
            .motivo-section { background-color: #fff5f5; border: 1px solid #ffcccc; padding: 15px; margin: 15px 0; border-radius: 4px; }
            .footer { font-size: 12px; color: #888; text-align: center; margin-top: 30px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">Evento Rejeitado</div>
            <div class="content">
                <p>Olá, <strong>${usuario.nome}</strong>!</p>
                <p>Infelizmente, o evento que você submeteu não pôde ser aprovado no momento.</p>
                
                
                <div class="motivo-section">
                    <p><strong>Motivo da Rejeição: <br>   ${motivo.titulo}</strong></p>
                    <p><strong>Descrição Detalhada: <br>  ${motivo.descricao}<strong/></p>
                </div>

                <p>Você pode revisar os requisitos e submeter novamente através do nosso sistema.</p>
                <p>Agradecemos sua compreensão.</p>
            </div>
            <div class="footer">
                <p>Equipe VibeTicket Eventos</p>
            </div>
        </div>
    </body>
    </html>
    `;

    await enviarEmail({
        to: usuario.email,
        subject: `❌ Evento Não Aprovado: ${evento.nome}`,
        html: emailHtml
    });
};


/**
 * 🔥 ALTERADO: Envia e-mail de CONFIRMAÇÃO DE CRIAÇÃO (em análise).
 */
export const enviarEmailConfirmacaoEvento = async (usuario: MinimalUsuario, evento: MinimalEvento) => {
    if (!usuario || !usuario.email) {
        console.error('Dados do usuário inválidos para enviar e-mail de confirmação.');
        return;
    }

    // O HTML do e-mail permanece o mesmo...
    const emailHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #ddd; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
            /* Cor alterada para azul (pendente/informativo) */
            .header { font-size: 24px; font-weight: bold; color: #0969fb; text-align: center; margin-bottom: 20px; }
            .content p { line-height: 1.6; font-size: 16px; margin: 10px 0; }
            .evento-details { background-color: #f9f9f9; border-left: 4px solid #0969fb; padding: 20px; margin: 20px 0; border-radius: 4px; }
            .footer { font-size: 12px; color: #888; text-align: center; margin-top: 30px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">⏳ Evento Recebido para Análise</div>
            <div class="content">
                <p>Olá, <strong>${usuario.nome}</strong>!</p>
                <p>Recebemos o seu evento e ele já está em processo de análise pela nossa equipe.</p>
                
                <div class="evento-details">
                    <p><strong>Evento:</strong> ${evento.nome}</p>
                </div>

                <p>Você será notificado por e-mail assim que o processo de revisão for concluído (geralmente em até 48 horas).</p>
                <p>Obrigado por escolher a VibeTicket!</p>
            </div>
            <div class="footer">
                <p>Equipe VibeTicket Eventos</p>
            </div>
        </div>
    </body>
    </html>
    `;

    await enviarEmail({
        to: usuario.email,
        subject: `⏳ Evento em Análise: ${evento.nome}`,
        html: emailHtml
    });
};


/**
 * 🔥 NOVO: Envia e-mail de APROVAÇÃO do evento.
 */
export const enviarEmailAprovacaoEvento = async (usuario: MinimalUsuario, evento: MinimalEvento) => {
    if (!usuario || !usuario.email) {
        console.error('Dados do usuário inválidos para enviar e-mail de aprovação.');
        return;
    }

    // O HTML do e-mail permanece o mesmo...
    const emailHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #ddd; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
            .header { font-size: 24px; font-weight: bold; color: #27ae60; text-align: center; margin-bottom: 20px; }
            .content p { line-height: 1.6; font-size: 16px; margin: 10px 0; }
            .evento-details { background-color: #f9f9f9; border-left: 4px solid #27ae60; padding: 20px; margin: 20px 0; border-radius: 4px; }
            .footer { font-size: 12px; color: #888; text-align: center; margin-top: 30px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">🎉 Evento Aprovado!</div>
            <div class="content">
                <p>Olá, <strong>${usuario.nome}</strong>!</p>
                <p>Seu evento foi aprovado e já está disponível em nossa plataforma.</p>
                
                <p>Os usuários já podem visualizar e adquirir ingressos para o seu evento.</p>
                <p>Parabéns e sucesso no seu evento!</p>
            </div>
            <div class="footer">
                <p>Equipe VibeTicket Eventos</p>
            </div>
        </div>
    </body>
    </html>
    `;

    await enviarEmail({
        to: usuario.email,
        subject: `✅ Evento Aprovado: ${evento.nome}`,
        html: emailHtml
    });
};

// Não precisamos mais do module.exports, pois usamos 'export const' em cada função.

export const enviarEmailLinkPagamento = async (
    usuario: MinimalUsuario,
    linkPagamento: string
) => {
    if (!usuario || !usuario.email) {
        console.error('Dados do usuário inválidos para enviar e-mail de link de pagamento.');
        return;
    }

    // Template HTML para o e-mail de link de pagamento
    const emailHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px !important; color: #333; background-color: #f4f4f4; }
            .container { 
                max-width: 600px; 
                margin: auto; 
                background-color: #ffffff; 
                border: 1px solid #ddd; 
                padding: 30px; 
                border-radius: 8px; 
                box-shadow: 0 4px 8px rgba(0,0,0,0.1); 
            }
            .header { font-size: 24px; font-weight: bold; color: #f39c12; text-align: center; margin-bottom: 20px; }
            .content p { line-height: 1.6; font-size: 16px; margin: 10px 0; }
            
            /* --- ⬇️ INÍCIO DA ALTERAÇÃO DO BOTÃO --- */
            .button-container-table {
                /* Centraliza a tabela do botão */
                margin: 30px auto;
                text-align: center;
                /* Define uma largura para clientes de e-mail 'burros' */
                width: 90%; 
            }
            .button-td {
                /* O <td> agora tem o fundo e as bordas */
                background-color: #0969fb;
                border-radius: 5px;
                text-align: center;
            }
            .button-a {
                /* O <a> é o 'recheio' clicável */
                display: block; /* Faz o link preencher a célula da tabela */
                padding: 15px 25px; /* Padding interno do botão */
                
                /* Estilos do texto */
                color: #ffffff !important; /* !important é necessário para links de e-mail */
                font-family: Arial, sans-serif;
                font-size: 17px; /* Um pouco menor para caber melhor */
                font-weight: bold;
                text-decoration: none;
                
                /* Garante que o texto quebre bem se for muito longo */
                word-wrap: break-word;
                
                /* Ajuda a manter o clique em toda a área */
                border-radius: 5px; 
            }
            /* --- ⬆️ FIM DA ALTERAÇÃO DO BOTÃO --- */

            .expiration { 
                background-color: #fffaf0; 
                border-left: 4px solid #f39c12; 
                padding: 15px; 
                margin: 20px 0; 
                border-radius: 4px; 
            }
            .footer { font-size: 12px; color: #888; text-align: center; margin-top: 30px; }

            /* --- ⬇️ MEDIA QUERY PARA MOBILE --- */
            @media screen and (max-width: 600px) {
                .container {
                    padding: 20px !important;
                }
                .button-container-table {
                    /* Força o botão a ocupar 100% da largura no mobile */
                    width: 100% !important; 
                }
                .button-a {
                    /* Reduz o padding para não estourar */
                    padding: 15px !important;
                    font-size: 16px !important;
                }
            }
            /* --- ⬆️ FIM DA MEDIA QUERY --- */
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">⏳ Pagamento Pendente</div>
            <div class="content">
                <p>Olá, <strong>${usuario.nome}</strong>!</p>
                <p>Sua reserva de ingressos foi criada com sucesso, mas ainda está aguardando o pagamento.</p>
                <p>Para confirmar sua compra, por favor, realize o pagamento através do link abaixo:</p>
                
                <table border="0" cellpadding="0" cellspacing="0" role="presentation" class="button-container-table">
                    <tr>
                        <td align="center" class="button-td">
                            <a href="${linkPagamento}" target="_blank" class="button-a">
                                Pagar Agora com Mercado Pago
                            </a>
                        </td>
                    </tr>
                </table>
                <div class="expiration">
                    <p><strong>Atenção:</strong> Este link de pagamento é válido por <b>30 minutos</b>.</p>
                    <p>Após esse período, sua reserva será cancelada e os ingressos voltarão ao estoque.</p>
                </div>

                <p>Se você já pagou, por favor, desconsidere este e-mail. A confirmação será enviada em breve.</p>
            </div>
            <div class="footer">
                <p>Equipe VibeTicket Eventos</p>
            </div>
        </div>
    </body>
    </html>
    `;

    // Chama a função genérica de envio
    await enviarEmail({
        to: usuario.email,
        subject: `⏳ Pague sua reserva VibeTicket (Expira em 30 min)`,
        html: emailHtml
    });
};