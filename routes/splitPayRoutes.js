// routes/splitPayRoutes.js
const express = require('express');
const router = express.Router(); 

const { MercadoPagoConfig, Preference } = require('mercadopago');

const client = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });

// Adapte esta função para buscar no seu banco de dados
const getProducerData = async (eventoId) => {
    // Exemplo: busque o ID do produtor associado ao evento no seu DB
    // Substitua este objeto por uma chamada real ao seu banco de dados
    const produtor = {
        mercadopago_account_id: 'ID_DA_CONTA_DO_PRODUTOR_AQUI' 
    };
    return produtor;
};

// Adapte esta função para buscar sua comissão
const getCommissionValue = (itemPrice, commissionPercentage = 0.1) => {
    return itemPrice * commissionPercentage;
};


router.post("/create-split-preference", async (req, res) => {
    console.log('Corpo da requisição:', req.body); 
    const { items, eventoId } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: "Nenhum item foi fornecido." });
    }

    try {
        const produtor = await getProducerData(eventoId);
        
        const totalAmount = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
        
        const marketplaceFee = getCommissionValue(totalAmount);

        const preference = new Preference(client);

        const data = await preference.create({
            body: {
                items: items,
                payer: {
                  email: req.body.payer_email,
                },
                payment_methods: {
                  excluded_payment_methods: [
                    {}
                  ],
                  excluded_payment_types: [
                    {}
                  ]
                },
                marketplace_fee: marketplaceFee
            }
        });

        res.status(200).json({
            id: data.id,
            preference_url: data.init_point,
        });

    } catch (error) {
        console.error("Erro na criação da preferência com split:", error);
        res.status(500).json({ error: "Erro na criação da preferência com split." });
    }
});

module.exports = router;