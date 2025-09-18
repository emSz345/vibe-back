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
                    success: `${process.env.FRONTEND_URL}/meus-ingressos?status=approved`,
                    pending: `${process.env.FRONTEND_URL}/meus-ingressos?status=pending`,
                    failure: `${process.env.FRONTEND_URL}/meus-ingressos?status=rejected`,
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
router.post("/webhook", async (req, res) => {
    const { data, type } = req.body;

    if (type === "payment") {
        const paymentId = data.id;
        const payment = new Payment(client);

        try {
            const paymentDetails = await payment.get({ id: paymentId });
            const { status, metadata, additional_info } = paymentDetails.body;

            if (status === "approved") {
                const userId = metadata.user_id;

                const ingressosASalvar = additional_info.items.map(item => ({
                    userId: userId,
                    paymentId: paymentId,
                    nomeEvento: item.title,
                    dataEvento: "Data do Evento", // Substitua pela data real
                    valor: item.unit_price,
                    status: "Pago"
                }));

                await Ingresso.insertMany(ingressosASalvar);
                console.log(`Ingresso(s) salvo(s) com sucesso para o usuário ${userId}.`);
            }

            res.status(200).send("OK");
        } catch (error) {
            console.error("Erro no webhook do Mercado Pago:", error);
            res.status(500).send("Erro interno ao processar o webhook.");
        }
    } else {
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
