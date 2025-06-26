// utils/emailService.js

const nodemailer = require('nodemailer');
require('dotenv').config();

// Configura o "transportador" de e-mail uma única vez
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
 * Função genérica para enviar e-mails.
 * @param {object} mailOptions - Opções do e-mail.
 */
const enviarEmail = async ({ to, subject, html }) => {
    try {
        await transporter.sendMail({
            from: {
                name: 'NaVibe Eventos',
                address: process.env.EMAIL_USER
            },
            to,
            subject,
            html
        });
        console.log(`E-mail enviado com sucesso para ${to}`);
    } catch (error) {
        console.error(`ERRO AO ENVIAR E-MAIL para ${to}:`, error);
        // Não lançamos um erro para não quebrar o fluxo principal da aplicação.
    }
};

/**
 * NOVO: Envia um e-mail de confirmação quando um novo evento é criado.
 * @param {object} usuario - O objeto do usuário que criou o evento.
 * @param {string} usuario.nome - Nome do usuário.
 * @param {string} usuario.email - E-mail do usuário.
 * @param {object} evento - O objeto do evento que foi criado.
 */
const enviarEmailConfirmacaoEvento = async (usuario, evento) => {
    // Formata a data para uma leitura mais agradável
    const dataFormatada = new Date(evento.dataInicio).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
    
    // Constrói o endereço completo do evento
    const enderecoCompleto = `${evento.rua}, ${evento.numero} - ${evento.bairro}, ${evento.cidade} - ${evento.estado}`;

    const subject = `🎉 Evento Criado: ${evento.nome}`;
    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #ddd; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
            .header { font-size: 24px; font-weight: bold; color: #0969fb; text-align: center; margin-bottom: 20px; }
            .content p { line-height: 1.6; font-size: 16px; }
            .event-details { background-color: #f9f9f9; border-left: 4px solid #0969fb; padding: 15px; margin: 20px 0; border-radius: 4px;}
            .footer { font-size: 12px; color: #888; text-align: center; margin-top: 30px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">Seu Evento Foi Criado!</div>
            <div class="content">
                <p>Olá, <strong>${usuario.nome}</strong>!</p>
                <p>Seu evento foi criado com sucesso e enviado para analise, em breve lhe retornaremos com mais informações.</p>
                
                <div class="event-details">
                    <p><strong>Evento:</strong> ${evento.nome}</p>
                    <p><strong>Data:</strong> ${dataFormatada} às ${evento.horaInicio}</p>
                    <p><strong>Local:</strong> ${enderecoCompleto}</p>
                </div>

                <p>Obrigado por escolher a NaVibe Eventos para divulgar seu evento!</p>
            </div>
            <div class="footer">
                <p>Você recebeu este e-mail porque criou um evento na NaVibe Eventos.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    // Reutiliza a função genérica para enviar o e-mail
    await enviarEmail({
        to: usuario.email,
        subject,
        html
    });
};


// Exporta ambas as funções
module.exports = { enviarEmail, enviarEmailConfirmacaoEvento };
