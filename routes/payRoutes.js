const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
// 🔥 IMPORTS NECESSÁRIOS
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const Ingresso = require('../models/ingresso');
const Carrinho = require('../models/Carrinho'); // Importar Carrinho
const Event = require('../models/Event');       // Importar Event
const { authenticateToken } = require('../server');

// Configuração
const client = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });
const notification = process.env.MP_NOTIFICATION_URL


// --- Rota para criar a preferência de pagamento ---
router.post("/iniciar-pagamento", authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        // 1. Busca o carrinho do usuário
        const carrinho = await Carrinho.findOne({ usuarioId: userId });

        if (!carrinho || carrinho.itens.length === 0) {
            return res.status(400).json({ error: "Carrinho vazio." });
        }

        // 2. Gerar um ID único para este pedido
        const pedidoId = new mongoose.Types.ObjectId().toString();
        const ingressosASalvar = [];

        // 3. Criar os ingressos como "Pendentes"
        for (const item of carrinho.itens) {
            const evento = await Event.findById(item.eventoId);
            if (!evento) {
                console.error(`Evento ID ${item.eventoId} não encontrado. Pulando item.`);
                continue;
            }

            const valorUnitario = item.tipoIngresso === 'Inteira'
                ? evento.valorIngressoInteira
                : evento.valorIngressoMeia;

            for (let i = 0; i < item.quantidade; i++) {
                ingressosASalvar.push({
                    userId: userId,
                    pedidoId: pedidoId, // <-- ID do Pedido
                    eventoId: item.eventoId,
                    tipoIngresso: item.tipoIngresso,
                    valor: valorUnitario,
                    status: "Pendente" // <-- Status inicial
                });
            }
        }

        if (ingressosASalvar.length === 0) {
            return res.status(400).json({ error: "Não foi possível processar os itens do carrinho." });
        }

        // Salva os ingressos pendentes no banco
        await Ingresso.insertMany(ingressosASalvar);
        console.log(`✅ ${ingressosASalvar.length} ingresso(s) pendente(s) criado(s) para o Pedido ${pedidoId}.`);

        // 4. Mapeia os itens do carrinho para o formato do Mercado Pago
        const mpItems = carrinho.itens.map(item => ({
            id: `${item.eventoId}-${item.tipoIngresso}`,
            title: item.nomeEvento,
            currency_id: "BRL",
            picture_url: item.imagem,
            description: `${item.tipoIngresso} - ${item.localEvento}`,
            category_id: "tickets",
            quantity: item.quantidade,
            unit_price: item.preco,
        }));

        // 5. Criar a Preferência de Pagamento do MP
        const preference = new Preference(client);
        const data = await preference.create({
            body: {
                items: mpItems,
                // AQUI ESTÁ A MÁGICA: Passamos nosso pedidoId como external_reference
                external_reference: pedidoId,
                metadata: {
                    user_id: userId.toString(),
                    pedido_id: pedidoId // Boa prática duplicar no metadata
                },
                notification_url: `${notification}/api/pagamento/webhook`
            }
        });

        // 6. Retorna a URL de pagamento para o frontend
        res.status(200).json({
            id: data.id,
            preference_url: data.init_point,
        });

    } catch (error) {
        console.error("❌ Erro ao iniciar pagamento:", error);
        res.status(500).json({ error: "Erro interno ao iniciar o pagamento." });
    }
});


router.post("/webhook", async (req, res) => {
    let body;
    try {
        body = JSON.parse(req.body.toString());
    } catch (e) {
        console.error("❌ Erro ao parsear corpo do webhook:", e);
        return res.status(200).send("Corpo inválido. Ignorado.");
    }

    const { data, type } = body;

    if (type?.toLowerCase() !== "payment") {
        console.log(`Tipo de webhook '${type || 'undefined'}' ignorado.`);
        return res.status(200).send("OK.");
    }

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
            console.error(`❌ Estrutura inválida do MP para o ID: ${paymentId}.`);
            return res.status(200).send("Resposta do MP inválida, ignorando.");
        }

        const { status, external_reference, metadata } = paymentData;

        // AQUI ESTÁ A MÁGICA: Pegamos o pedidoId que enviamos
        const pedidoId = external_reference;
        const userId = metadata?.user_id;

        if (!pedidoId) {
            console.error(`❌ Webhook (ID: ${paymentId}): external_reference (pedidoId) está ausente. Ignorando.`);
            return res.status(200).send("external_reference ausente.");
        }

        console.log(`Processando Webhook: Pagamento ${paymentId}, Pedido ${pedidoId}, Status MP: ${status}`);

        let novoStatusIngresso;

        if (status === "approved") {
            novoStatusIngresso = "Pago";
        } else if (status === "rejected" || status === "cancelled" || status === "failed") {
            novoStatusIngresso = "Recusado";
        } else {
            // Se for "pending" ou "in_process", não fazemos nada.
            // Apenas esperamos o MP nos enviar um status final.
            console.log(`Status '${status}' (ID: ${paymentId}) não é final. Aguardando.`);
            return res.status(200).send("OK.");
        }

        // Atualiza TODOS os ingressos "Pendentes" desse pedido para o novo status
        const updateResult = await Ingresso.updateMany(
            { pedidoId: pedidoId, status: 'Pendente' },
            { $set: { status: novoStatusIngresso, paymentId: paymentId } }
        );

        if (updateResult.nModified === 0) {
            console.warn(`Webhook (ID: ${paymentId}): Nenhum ingresso 'Pendente' encontrado/modificado para o pedido ${pedidoId}. (Pode já ter sido processado)`);
        } else {
            console.log(`✅ ${updateResult.nModified} ingresso(s) atualizado(s) para ${novoStatusIngresso} (Pedido: ${pedidoId}).`);
        }

        // Se o pagamento foi APROVADO, limpa o carrinho do usuário
        if (novoStatusIngresso === "Pago" && userId) {
            await Carrinho.findOneAndDelete({ usuarioId: userId });
            console.log(`✅ Carrinho do usuário ${userId} limpo.`);
        }

        res.status(200).send("OK");

    } catch (error) {
        console.error(`❌ Erro FATAL no processamento do webhook (ID ${paymentId}):`, error);
        res.status(200).send("Erro interno tratado.");
    }
});

// --- Rota para LISTAR os ingressos do usuário (Mantida) ---
router.get("/ingressos/user", authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        // ANTIGO (Apenas busca o Ingresso):
        // const ingressosDoUsuario = await Ingresso.find({ userId: userId }).select('-__v');

        // NOVO (Busca o Ingresso E popula os dados do Evento associado):
        const ingressosDoUsuario = await Ingresso.find({ userId: userId })
            .populate('eventoId') // <-- MAGICA ACONTECE AQUI
            .select('-__v') // Opcional: remover __v se desejar
            .sort({ createdAt: -1 }); // Opcional: ordenar pelos mais recentes

        res.status(200).json(ingressosDoUsuario);
    } catch (error) {
        console.error("❌ Erro ao buscar ingressos do usuário:", error);
        res.status(500).json({ error: "Erro ao buscar ingressos." });
    }
});

module.exports = router;