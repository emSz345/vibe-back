// utils/emailService.js

const nodemailer = require('nodemailer');
require('dotenv').config();

// Configura o "transportador" de e-mail uma única vez, usando as credenciais do .env
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER, // E-mail do arquivo .env
        pass: process.env.EMAIL_PASS  // Senha de App do arquivo .env
    }
});

/**
 * Função reutilizável para enviar e-mails.
 * @param {object} mailOptions - Opções do e-mail.
 * @param {string} mailOptions.to - E-mail do destinatário.
 * @param {string} mailOptions.subject - Assunto do e-mail.
 * @param {string} mailOptions.html - Corpo do e-mail em HTML.
 */
const enviarEmail = async ({ to, subject, html }) => {
    try {
        await transporter.sendMail({
            from: {
                name: 'B4Y Eventos', // O nome da sua plataforma
                address: process.env.EMAIL_USER
            },
            to,
            subject,
            html
        });
        console.log(`E-mail de boas-vindas enviado com sucesso para ${to}`);
    } catch (error) {
        console.error(`ERRO AO ENVIAR E-MAIL de boas-vindas para ${to}:`, error);
        // Não lançamos um erro aqui para não quebrar o fluxo de cadastro caso o e-mail falhe.
    }
};

// Exporta a função para que ela possa ser usada em outros arquivos
module.exports = { enviarEmail };