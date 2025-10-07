const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago'); 
const Ingresso = require('../models/ingresso'); 
const { authenticateToken } = require('../server'); 

const client = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });
const notification = process.env.MP_NOTIFICATION_URL


// --- Rota para criar a preferência de pagamento (Mantida) ---
router.post("/create-preference", authenticateToken, async (req, res) => {
    const userId = req.user.userId; 
    const { items, external_reference } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: "Itens da compra não fornecidos." });
    }

    const preference = new Preference(client);

    try {
        const data = await preference.create({
            body: {
                items: items,
                external_reference: external_reference || `USER-${userId}-${Date.now()}`,
                metadata: {
                    user_id: userId,
                },
                notification_url: `${notification}/api/pagamento/webhook`
            }
        });

        res.status(200).json({
            id: data.id,
            preference_url: data.init_point,
        });
    } catch (error) {
        console.error("❌ Erro na criação da preferência:", error);
        res.status(500).json({ error: "Erro interno na criação da preferência." });
    }
});

// --- Rota de webhook para SALVAR o ingresso (CORRIGIDA) ---
router.post("/webhook", async (req, res) => {
    
    let body;
    try {
        body = JSON.parse(req.body.toString()); 
    } catch (e) {
        console.error("❌ Erro ao parsear corpo do webhook (Buffer -> JSON).");
        return res.status(200).send("Corpo inválido. Ignorado."); 
    }

    const { data, type } = body; 

    if (typeof type !== 'string' || type.toLowerCase() !== "payment") {
        console.log(`Tipo de webhook '${type || 'undefined'}' ignorado.`);
        return res.status(200).send("OK.");
    }
    
    console.log(`\n--- Webhook Recebido (Tipo: ${type}) ---`);

    const paymentId = data?.id; 
    
    if (!paymentId) {
        console.error("❌ Erro: ID do pagamento não encontrado no webhook.");
        return res.status(200).send("ID de pagamento ausente. OK.");
    }

    const paymentClient = new Payment(client);

    try {
        const paymentDetails = await paymentClient.get({ id: paymentId });
        
        const paymentData = paymentDetails?.body || paymentDetails;

        if (!paymentData || !paymentData.status) {
            console.error(`❌ Estrutura inválida da API do Mercado Pago para o ID: ${paymentId}. Resposta inesperada.`);
            return res.status(200).send("Resposta do MP inválida, ignorando."); 
        }

        // 🔑 CORREÇÃO AQUI: Captura items e additional_info
        const { status, metadata, items, additional_info } = paymentData; 
        
        console.log(`Detalhes: ID ${paymentId}, Status: ${status}`);
        
        // Determina a lista final de itens, preferindo 'items' e usando 'additional_info.items' como fallback
        const listaFinalDeItens = items && items.length > 0 
            ? items 
            : additional_info?.items;


        if (status === "approved") {
            // Validações
            if (!metadata || !metadata.user_id) {
                console.error("❌ Erro: user_id não encontrado na metadata.");
                return res.status(200).send("Dados do usuário ausentes.");
            }
            
            // 🔑 CORREÇÃO: Verifica se a lista final de itens está vazia
            if (!listaFinalDeItens || listaFinalDeItens.length === 0) { 
                console.error("❌ Erro: Itens da compra não encontrados em 'items' ou 'additional_info'.");
                return res.status(200).send("Itens da compra ausentes.");
            }

            const userId = metadata.user_id;
            const ingressosASalvar = listaFinalDeItens.map(item => ({
                userId: userId,
                paymentId: paymentId,
                nomeEvento: item.title,
                dataEvento: "Data do Evento Padrão", 
                valor: item.unit_price,
                status: "Pago"
            }));

            await Ingresso.insertMany(ingressosASalvar);
            console.log(`✅ Ingresso(s) salvo(s) com sucesso para o usuário ${userId}.`);
        } else {
            console.log(`Pagamento ID ${paymentId}. Status: ${status}.`);
        }
        
        res.status(200).send("OK");

    } catch (error) {
        console.error(`❌ Erro FATAL (Rede/DB) no processamento do webhook (ID ${paymentId}):`, error);
        res.status(200).send("Erro interno tratado.");
    }
});

// --- Rota para LISTAR os ingressos do usuário (Mantida) ---
router.get("/ingressos/user", authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        const ingressosDoUsuario = await Ingresso.find({ userId: userId }).select('-__v');
        res.status(200).json(ingressosDoUsuario);
    } catch (error) {
        console.error("❌ Erro ao buscar ingressos do usuário:", error);
        res.status(500).json({ error: "Erro ao buscar ingressos." });
    }
});

module.exports = router;
