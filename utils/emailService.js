// vibe-back/utils/emailService.js (ARQUIVO ATUALIZADO E COMPLETO)

const nodemailer = require('nodemailer');
const qrcode = require('qrcode'); // 🔥 NOVO: Importa a biblioteca de QR Code
require('dotenv').config();

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
 * @param {object} mailOptions - Opções do e-mail.
 */
const enviarEmail = async ({ to, subject, html, attachments }) => { // 🔥 ATUALIZADO: Aceita 'attachments'
    try {
        await transporter.sendMail({
            from: {
                name: 'VibeTicket Eventos',
                address: process.env.EMAIL_USER
            },
            to,
            subject,
            html,
            attachments // 🔥 ATUALIZADO: Passa os anexos para o sendMail
        });
        console.log(`E-mail enviado com sucesso para ${to}`);
    } catch (error) {
        console.error(`ERRO AO ENVIAR E-MAIL para ${to}:`, error);
    }
};

/**
 * 🔥 NOVO: Envia o e-mail do ingresso com QR Code em anexo.
 * @param {object} usuario - O objeto do usuário (comprador).
 * @param {object} ingresso - O objeto do ingresso.
 */
const enviarEmailIngresso = async (usuario, ingresso) => {
    if (!usuario || !usuario.email) {
        console.error('Dados do usuário inválidos para enviar e-mail de ingresso.');
        return;
    }

    // 1. Gera o QR Code como uma imagem Data URL (Base64)
    const qrCodeDataUrl = await qrcode.toDataURL(ingresso._id.toString());

    // 2. Formata as datas e informações
    const dataFormatada = new Date(ingresso.dataEvento).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric'
    });

    // 3. Cria o template HTML do e-mail
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

    // 4. Envia o e-mail usando a função genérica, agora com o anexo
    await enviarEmail({
        to: usuario.email,
        subject: `🎟️ Seu Ingresso para: ${ingresso.nomeEvento}`,
        html: emailHtml,
        attachments: [{
            filename: 'qrcode.png',
            path: qrCodeDataUrl, // Usa a imagem Base64 gerada
            cid: 'qrcode_vibeticket' // ID de conteúdo, usado no <img src="cid:...">
        }]
    });
};


// SUAS FUNÇÕES EXISTENTES (SEM MUDANÇAS)
const enviarEmailRejeicaoEvento = async (usuario, evento, motivo) => { /* ... seu código aqui ... */ };
const enviarEmailConfirmacaoEvento = async (usuario, evento) => { /* ... seu código aqui ... */ };

// Exporta todas as funções, incluindo a nova
module.exports = { 
    enviarEmail, 
    enviarEmailConfirmacaoEvento, 
    enviarEmailRejeicaoEvento,
    enviarEmailIngresso // 🔥 NOVO
};