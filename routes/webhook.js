const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Payment } = require('mercadopago');
// Importe o seu modelo de Ingresso aqui
const Ingresso = require('../models/ingresso'); 

// Rota de webhook para processar as notificações do Mercado Pago
router.post("/", express.raw({ type: '*/*' }), async (req, res) => {
    let payload;
    try {
        // Tenta analisar o buffer da requisição como JSON
        payload = JSON.parse(req.body.toString('utf8'));
    } catch (err) {
        console.error("❌ Erro ao analisar o corpo do webhook:", err);
        return res.status(400).send('Webhook inválido.');
    }

    const { data, type, live_mode } = payload;
    
    // Log para depuração: Mostra o tipo de evento e os dados recebidos
    console.log("Webhook recebido. Tipo:", type, "Live Mode:", live_mode, "Dados:", data);

    // Use um switch para lidar com diferentes tipos de evento
    switch (type) {
        case "payment": {
            const paymentId = data.id;

            // O token do Mercado Pago deve ser escolhido com base no live_mode
            const client = new MercadoPagoConfig({
                accessToken: live_mode ? process.env.MP_TOKEN : process.env.MP_TEST_TOKEN
            });
            const payment = new Payment(client);

            try {
                // Consulta a API do Mercado Pago para obter os detalhes completos do pagamento
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
                        dataEvento: "Data do Evento", // <-- Verifique se este valor é o correto
                        valor: item.unit_price,
                        status: "Pago"
                    }));

                    // *** IMPORTANTE: AQUI É ONDE O ERRO PODE ESTAR! ***
                    // Verifique sua string de conexão com o banco de dados e as permissões de acesso.
                    // Adicione um console.log(error) no catch se a operação abaixo falhar novamente.
                    await Ingresso.insertMany(ingressosASalvar);

                    console.log(`✅ Ingresso(s) salvo(s) com sucesso para o usuário ${userId}.`);
                } else {
                    console.log(`Pagamento com ID ${paymentId} não foi aprovado. Status: ${status}`);
                }
                
                // Responde com sucesso para o Mercado Pago para evitar novas tentativas
                res.status(200).send("OK");
            } catch (error) {
                console.error("❌ Erro ao processar o webhook do Mercado Pago:", error);
                // Retorna um erro 500 para o Mercado Pago tentar novamente
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