const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Payment } = require('mercadopago');
const Ingresso = require('../models/ingresso'); 

// Rota de webhook para processar as notificações do Mercado Pago
// REMOVA o middleware 'express.raw' daqui, pois 'express.json' já lida com o JSON
router.post("/", async (req, res) => {
    // O corpo da requisição (req.body) já é um objeto JSON graças ao middleware em server.js
    const { data, type, live_mode } = req.body;
    
    // Log para depuração: Mostra o tipo de evento e os dados recebidos
    console.log("Webhook recebido. Tipo:", type, "Live Mode:", live_mode, "Dados:", data);

    switch (type) {
        case "payment": {
            const paymentId = data.id;

            const client = new MercadoPagoConfig({
                accessToken: live_mode ? process.env.MP_TOKEN : process.env.MP_TEST_TOKEN
            });
            const payment = new Payment(client);

            try {
                const paymentDetails = await payment.get({ id: paymentId });
                const { status, metadata, additional_info } = paymentDetails.body;

                console.log("Detalhes do pagamento:", paymentDetails.body);

                if (status === "approved") {
                    if (!metadata || !metadata.user_id) {
                        console.error("Erro: user_id não encontrado na metadata do webhook.");
                        return res.status(400).send("Dados do usuário ausentes.");
                    }
                    if (!additional_info || !additional_info.items || additional_info.items.length === 0) {
                        console.error("Erro: Itens da compra não encontrados na additional_info.");
                        return res.status(400).send("Itens da compra ausentes.");
                    }

                    const userId = metadata.user_id;
                    const ingressosASalvar = additional_info.items.map(item => ({
                        userId: userId,
                        paymentId: paymentId,
                        nomeEvento: item.title,
                        dataEvento: "Data do Evento",
                        valor: item.unit_price,
                        status: "Pago"
                    }));

                    await Ingresso.insertMany(ingressosASalvar);

                    console.log(`✅ Ingresso(s) salvo(s) com sucesso para o usuário ${userId}.`);
                } else {
                    console.log(`Pagamento com ID ${paymentId} não foi aprovado. Status: ${status}`);
                }
                
                res.status(200).send("OK");
            } catch (error) {
                console.error("❌ Erro ao processar o webhook do Mercado Pago:", error);
                res.status(500).send("Erro interno ao processar o webhook.");
            }
            break;
        }
        default: {
            console.log(`Tipo de webhook '${type}' não suportado. Ignorando.`);
            res.status(200).send("OK");
            break;
        }
    }
});

module.exports = router;
