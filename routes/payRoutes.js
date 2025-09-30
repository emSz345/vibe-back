const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago'); // Importe 'Payment'
const Ingresso = require('../models/ingresso'); // Importe o modelo de ingresso
const { authenticateToken } = require('../server'); // Importe o middleware de autenticação

// O cliente é configurado globalmente, mas o token é dinâmico no webhook.
const client = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });

// Rota para criar a preferência de pagamento
router.post("/create-preference", async (req, res) => {
    const { items, userId } = req.body;

    if (!items || items.length === 0 || !userId) {
        return res.status(400).json({ error: "Dados do carrinho ou ID do usuário não fornecidos." });
    }

    const preference = new Preference(client);

    try {
        const data = await preference.create({
            body: {
                items: items,
                metadata: {
                    user_id: userId,
                },
            }
        });

        res.status(200).json({
            id: data.id,
            preference_url: data.init_point,
        });
    } catch (error) {
        console.error("Erro na criação da preferência:", error);
        res.status(500).json({ error: "Erro na criação da preferência." });
    }
});

// ---

// Middleware específico para a rota de webhook para processar o corpo raw

// Rota de webhook para SALVAR o ingresso
router.post("/webhook", async (req, res) => {
    // O req.body já é um objeto JavaScript graças ao express.json()
    const { data, type, live_mode } = req.body;

    console.log("Webhook recebido. Tipo:", type, "Live Mode:", live_mode, "Dados:", data);

    switch (type) {
        case "payment": {
            const paymentId = data.id;

            const client = new MercadoPagoConfig({
                accessToken: process.env.MP_TOKEN
            });
            const payment = new Payment(client);

            try {
                const paymentDetails = await payment.get({ id: paymentId });
                
                // 🚩 TRATAMENTO DE ERRO CRÍTICO (Evita o 500 e a falha de desestruturação)
                if (!paymentDetails || !paymentDetails.body || !paymentDetails.body.status) {
                    console.error("❌ Erro de Estrutura: Resposta inesperada da API do Mercado Pago para o ID:", paymentId);
                    // Retorna 200 OK para o Mercado Pago e evita o reenvio infinito do webhook
                    return res.status(200).send("Resposta do MP inválida, ignorando."); 
                }
                // 🚩 FIM DO TRATAMENTO

                const { status, metadata, additional_info } = paymentDetails.body;

                console.log("Detalhes do pagamento:", paymentDetails.body);

                if (status === "approved") {
                    if (!metadata || !metadata.user_id) {
                        console.error("Erro: user_id não encontrado na metadata do webhook.");
                        // Mudamos para 200 OK para evitar reenvios em falhas controladas
                        return res.status(200).send("Dados do usuário ausentes.");
                    }
                    if (!additional_info || !additional_info.items || additional_info.items.length === 0) {
                        console.error("Erro: Itens da compra não encontrados na additional_info.");
                        // Mudamos para 200 OK
                        return res.status(200).send("Itens da compra ausentes.");
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
                console.error("❌ Erro fatal ou de rede ao processar o webhook do Mercado Pago:", error);
                // 🚨 MUITO IMPORTANTE: Retornar 200 OK no catch evita o loop infinito de reenvio
                // pelo Mercado Pago (que espera uma resposta 200/201 para confirmar a entrega).
                res.status(200).send("Erro interno tratado.");
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

// ---

// Rota para LISTAR os ingressos do usuário
router.get("/ingressos/user", authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        const ingressosDoUsuario = await Ingresso.find({ userId: userId });
        res.status(200).json(ingressosDoUsuario);
    } catch (error) {
        console.error("Erro ao buscar ingressos do usuário:", error);
        res.status(500).json({ error: "Erro ao buscar ingressos." });
    }
});

module.exports = router;
