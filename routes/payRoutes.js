// routes/payRoutes.js
const express = require('express');
const router = express.Router(); 

const { MercadoPagoConfig, Preference } = require('mercadopago');

const client = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });

router.post("/create-preference", async (req, res) => {
    console.log('Corpo da requisição:', req.body); 
    const { items } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: "Nenhum item foi fornecido." });
    }

    const preference = new Preference(client);

    try {
        const data = await preference.create({
            body: {
                items: items, // Seu backend agora espera isso
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

module.exports = router;