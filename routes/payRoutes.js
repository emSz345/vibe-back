const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');
const Ingresso = require('../models/ingresso'); // Importe o modelo de ingresso
const { authenticateToken } = require('../server'); // Importe o middleware de autenticação

const client = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });

// Rota para criar a preferência de pagamento (mantida e melhorada)
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
                back_urls: {
                    success: `${process.env.BASE_URL}/meus-ingressos?status=approved`,
                    pending: `${process.env.BASE_URL}/meus-ingressos?status=pending`,
                    failure: `${process.env.BASE_URL}/meus-ingressos?status=rejected`,
                },
                auto_return: "approved",
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

// Rota de webhook para SALVAR o ingresso (adicionada)
// Esta URL deve ser configurada no painel de webhooks do Mercado Pago
// Rota de webhook para SALVAR o ingresso (atualizada)
router.post("/webhook", async (req, res) => {
    const { data, type } = req.body;

    // Log para ver o que o Mercado Pago enviou.
    console.log("Webhook recebido. Tipo:", type, "Dados:", data);

    if (type === "payment") {
        const paymentId = data.id;
        const payment = new Payment(client);

        try {
            const paymentDetails = await payment.get({ id: paymentId });
            const { status, metadata, additional_info } = paymentDetails.body;

            // Log para inspecionar os detalhes do pagamento. Isso é crucial para depuração.
            console.log("Detalhes do pagamento:", paymentDetails.body);

            if (status === "approved") {
                // Verificar se os dados necessários existem antes de prosseguir
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
                    dataEvento: "Data do Evento", // Substitua pela data real do evento
                    valor: item.unit_price,
                    status: "Pago"
                }));

                await Ingresso.insertMany(ingressosASalvar);
                console.log(`✅ Ingresso(s) salvo(s) com sucesso para o usuário ${userId}.`);

            } else {
                console.log(`Pagamento com ID ${paymentId} não foi aprovado. Status: ${status}`);
            }

            // Sempre retorne um 200 OK para o Mercado Pago, mesmo que o status não seja 'approved'
            res.status(200).send("OK");
        } catch (error) {
            console.error("❌ Erro ao processar o webhook do Mercado Pago:", error);
            res.status(500).send("Erro interno ao processar o webhook.");
        }
    } else {
        // Ignora outros tipos de webhook, como 'merchant_order'
        res.status(200).send("OK");
    }
});

// Rota para LISTAR os ingressos do usuário (adicionada e protegida)
router.get("/ingressos/user", authenticateToken, async (req, res) => {
    // Usamos o ID do usuário do token (req.user.userId) para segurança
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
