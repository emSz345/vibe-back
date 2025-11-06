// ==========================
// 📦 payRoutes.js
// ==========================
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const {
    MercadoPagoConfig,
    Preference,
    Payment,
    PaymentRefund,
} = require("mercadopago");

const Ingresso = require("../models/ingresso");
const Carrinho = require("../models/Carrinho");
const Event = require("../models/Event");
const Perfil = require("../models/Perfil");
const Payout = require("../models/Payout");
const { protect: authenticateToken } = require("../authMiddleware");

const router = express.Router();

// ==========================
// ⚙️ CONFIGURAÇÕES
// ==========================
const notification = process.env.MP_NOTIFICATION_URL;
const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

// ==========================
// 🧰 FUNÇÕES AUXILIARES
// ==========================
function escapeRegex(text) {
    if (typeof text !== "string") return "";
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

const getCommissionValue = (totalAmount, commissionPercentage = 0.1) =>
    Number((totalAmount * commissionPercentage).toFixed(2));

// 🚨 MUDANÇA AQUI: A função getProducerAccessToken não é mais usada para
// criar o pagamento, mas o produtor ainda pode precisar dela para outras
// coisas no futuro, então podemos mantê-la. O código de validação
// problemático já está comentado, o que está correto.
async function getProducerAccessToken(userId) {
    const produtor = await Perfil.findOne({ userId });
    if (!produtor) throw new Error("Produtor não encontrado.");
    if (!produtor.mercadoPagoAccessToken)
        throw new Error("Produtor não vinculado ao Mercado Pago.");

    let token = produtor.mercadoPagoAccessToken;

    // 🔍 Log de diagnóstico
    console.log("🔑 Token atual do produtor:", token.slice(0, 10) + "...");
    return token;
}

// ==========================
// 💳 INICIAR PAGAMENTO (RESERVA DE ESTOQUE)
// ==========================
router.post("/iniciar-pagamento", authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const carrinho = await Carrinho.findOne({ usuarioId: userId });
        if (!carrinho || carrinho.itens.length === 0) {
            await session.abortTransaction();
            return res.status(400).json({ error: "Carrinho vazio." });
        }

        // ... (Sua lógica de reserva de estoque está correta) ...
        // Agrupa itens por evento e tipo
        const contagemPorEvento = {};
        for (const item of carrinho.itens) {
            const idEvento = item.eventoId.toString();
            const tipo = item.tipoIngresso;
            const qtd = item.quantidade;

            if (!contagemPorEvento[idEvento])
                contagemPorEvento[idEvento] = { Inteira: 0, Meia: 0, nomeEvento: item.nomeEvento };

            if (tipo === "Inteira") contagemPorEvento[idEvento].Inteira += qtd;
            if (tipo === "Meia") contagemPorEvento[idEvento].Meia += qtd;
        }

        // Reserva de estoque
        for (const eventoId in contagemPorEvento) {
            const { Inteira, Meia, nomeEvento } = contagemPorEvento[eventoId];
            const update = { $inc: {} };
            if (Inteira > 0) update.$inc.quantidadeInteira = -Inteira;
            if (Meia > 0) update.$inc.quantidadeMeia = -Meia;

            const result = await Event.updateOne(
                { _id: eventoId, quantidadeInteira: { $gte: Inteira }, quantidadeMeia: { $gte: Meia } },
                update,
                { session }
            );

            if (result.modifiedCount === 0) {
                await session.abortTransaction();
                return res.status(400).json({ error: `Estoque insuficiente para ${nomeEvento}.` });
            }
        }

        // Identifica produtor (para o Payout)
        const evento = await Event.findById(carrinho.itens[0].eventoId).session(session);
        if (!evento) throw new Error("Evento não encontrado.");
        const produtorId = evento.criadoPor;

        // 🚨 MUDANÇA AQUI: Não usamos mais o token do produtor para a venda.
        // O pagamento será centralizado na sua conta da plataforma.
        // const producerToken = await getProducerAccessToken(produtorId);
        console.log(`🎭 Produtor ID ${produtorId} identificado para Payout futuro.`);


        // ... (Seu código de criar ingressos pendentes está correto) ...
        const pedidoId = new mongoose.Types.ObjectId().toString();
        const expiracao = new Date(Date.now() + 30 * 60 * 1000);
        const ingressosASalvar = [];

        for (const item of carrinho.itens) {
            const eventoItem = await Event.findById(item.eventoId).session(session);
            const valor = item.tipoIngresso === "Inteira"
                ? eventoItem.valorIngressoInteira
                : eventoItem.valorIngressoMeia;

            for (let i = 0; i < item.quantidade; i++) {
                ingressosASalvar.push({
                    userId,
                    pedidoId,
                    eventoId: item.eventoId,
                    tipoIngresso: item.tipoIngresso,
                    valor,
                    status: "Pendente",
                    expiresAt: expiracao,
                });
            }
        }
        await Ingresso.insertMany(ingressosASalvar, { session });
        console.log(`✅ ${ingressosASalvar.length} ingressos criados.`);

        const total = carrinho.itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
        const fee = getCommissionValue(total); // A comissão da sua plataforma

        // 🚨 MUDANÇA AQUI: Usamos o MP_TOKEN da sua plataforma (do .env)
        const appClient = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });
        const preference = new Preference(appClient);
        const mpItems = carrinho.itens.map((i) => ({
            id: `${i.eventoId}-${i.tipoIngresso}`,
            title: i.nomeEvento,
            currency_id: "BRL",
            picture_url: i.imagem,
            description: `${i.tipoIngresso} - ${i.localEvento}`,
            category_id: "tickets",
            quantity: i.quantidade,
            unit_price: i.preco,
        }));

        console.log("🧾 Criando preferência (Conta Centralizadora)...");
        console.log("🛒 [DEBUG] Itens enviados para o MP:", JSON.stringify(mpItems, null, 2));


        const data = await preference.create({
            body: {
                items: mpItems,
                external_reference: pedidoId,
                metadata: {
                    user_id: userId.toString(),
                    pedido_id: pedidoId,
                    produtor_id: produtorId.toString(),
                    // 🚨 MUDANÇA AQUI: Salvamos a comissão no metadata
                    // O Webhook vai ler isso para calcular o Payout.
                    marketplace_fee: fee,
                },
                notification_url: `${notification}/api/pagamento/webhook`,
                back_urls: {
                    success: `${frontendBaseUrl}/meus-ingressos`,
                    pending: `${frontendBaseUrl}/meus-ingressos`,
                    failure: `${frontendBaseUrl}/meus-ingressos`,
                },
                auto_return: "all",
            },
        });

        console.log("✅ Preferência criada com sucesso no Mercado Pago:", data.id);

        await session.commitTransaction();

        res.status(200).json({
            id: data.id,
            preference_url: data.init_point,
        });
    } catch (error) {
        await session.abortTransaction();
        console.error("❌ Erro ao iniciar pagamento:", error);
        res.status(500).json({ error: error.message });
    } finally {
        session.endSession();
    }
});

// ==========================
// 💖 CRIAR PREFERÊNCIA DE DOAÇÃO
// ==========================
// ... (Nenhuma mudança aqui, está correto) ...
router.post("/create-preference", authenticateToken, async (req, res) => {
    try {
        const appClient = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });
        const preference = new Preference(appClient);
        const userId = req.user.userId;
        const { items } = req.body;
        if (!items?.length) return res.status(400).json({ error: "Itens ausentes." });

        const valor = Number(items[0].unit_price);
        if (isNaN(valor) || valor <= 0)
            return res.status(400).json({ error: "Valor inválido." });

        const doacaoId = new mongoose.Types.ObjectId().toString();
        const data = await preference.create({
            body: {
                items: [
                    {
                        id: "doacao",
                        title: "Doação para VibeTicket",
                        description: "Contribuição voluntária para a plataforma",
                        quantity: 1,
                        currency_id: "BRL",
                        unit_price: valor,
                    },
                ],
                external_reference: doacaoId,
                metadata: { user_id: userId, pedido_id: doacaoId, tipo: "DOACAO" },
                notification_url: `${notification}/api/pagamento/webhook`,
            },
        });

        res.status(200).json({ preference_url: data.init_point });
    } catch (error) {
        console.error("❌ Erro ao criar preferência de doação:", error);
        res.status(500).json({ error: "Erro interno." });
    }
});

// ==========================
// 💰 REEMBOLSAR PEDIDO
// ==========================
router.post("/reembolsar", authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { pedidoId } = req.body;
    if (!pedidoId) return res.status(400).json({ error: "pedidoId é obrigatório." });

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const ingressos = await Ingresso.find({ pedidoId, userId }).session(session);
        if (!ingressos.length) {
            await session.abortTransaction();
            return res.status(404).json({ error: "Pedido não encontrado." });
        }

        if (ingressos[0].status !== "Pago") {
            await session.abortTransaction();
            return res.status(400).json({ error: "Somente pedidos pagos podem ser reembolsados." });
        }

        const paymentId = ingressos[0].paymentId;
        if (!paymentId) throw new Error("Payment ID não encontrado.");

        // 🚨 MUDANÇA AQUI: Corrigi o bug do 'client' indefinido.
        // Agora ele usa o token da sua aplicação para fazer o reembolso.
        const appClient = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });
        const refund = new PaymentRefund(appClient);
        const result = await refund.create({ payment_id: paymentId });

        if (result.status !== "approved") throw new Error(`Reembolso não aprovado.`);

        // 🚨 MUDANÇA AQUI: Também cancelamos o Payout agendado
        await Payout.findOneAndUpdate(
            { pedidoId, status: "Pendente" },
            { status: "Reembolsado" }, // Alterado de "Cancelado" para "Reembolsado"
            { session }
        );

        await Ingresso.updateMany({ pedidoId, userId }, { status: "Reembolsado" }, { session });

        // ... (Sua lógica de devolver estoque está correta) ...
        const contagem = {};
        for (const i of ingressos) {
            const e = i.eventoId.toString();
            contagem[e] ??= { Inteira: 0, Meia: 0 };
            contagem[e][i.tipoIngresso]++;
        }

        const ops = Object.entries(contagem).map(([eventoId, { Inteira, Meia }]) =>
            Event.updateOne(
                { _id: eventoId },
                {
                    $inc: {
                        quantidadeInteira: Inteira,
                        quantidadeMeia: Meia,
                    },
                    s
                },
                { session }
            )
        );
        await Promise.all(ops);

        await session.commitTransaction();
        res.status(200).json({ message: "Reembolso concluído." });
    } catch (error) {
        await session.abortTransaction();
        console.error("❌ Erro no reembolso:", error);
        res.status(500).json({ error: error.message });
    } finally {
        session.endSession();
    }
});

// ==========================
// 📩 WEBHOOK MERCADO PAGO
// ==========================
router.post("/webhook", async (req, res) => {
    // O cliente do Webhook deve ser o da sua aplicação.
    const appClient = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });
    const paymentClient = new Payment(appClient);
    let body;

    // 🚨 MUDANÇA AQUI: Corrigindo o parse do Buffer que vem do "express.raw"
    try {
        if (Buffer.isBuffer(req.body)) {
            // Se for um Buffer (do express.raw), converte para string e depois para JSON
            body = JSON.parse(req.body.toString());
        } else if (typeof req.body === "string") {
            // Se já for string (em algum outro cenário)
            body = JSON.parse(req.body);
        } else {
            // Se já for um objeto (caso mude o middleware no server.js)
            body = req.body;
        }
    } catch (error) {
        console.error("❌ Erro ao decodificar o corpo do webhook:", error.message);
        return res.status(200).send("Corpo inválido."); // Responde 200 para o MP não continuar enviando
    }

    const { data, type } = body;

    // Log de diagnóstico
    console.log(`[Webhook Recebido] Tipo: ${type}, Data ID: ${data?.id}`);

    if (type?.toLowerCase() !== "payment") {
        return res.status(200).send("OK (Não é um pagamento)");
    }

    const paymentId = data?.id;
    if (!paymentId) {
        console.log("[Webhook] Sem ID de pagamento no corpo.");
        return res.status(200).send("Sem ID de pagamento.");
    }

    // O resto da sua lógica original continua daqui
    try {
        const paymentDetails = await paymentClient.get({ id: paymentId });
        const p = paymentDetails.body || paymentDetails;

        const { status, external_reference: pedidoId, metadata } = p;
        const userId = metadata?.user_id;

        if (metadata?.tipo === "DOACAO") {
            if (status === "approved") console.log(`✅ Doação ${pedidoId} aprovada.`);
            return res.status(200).send("OK (doação)");
        }

        if (!pedidoId) {
            console.log(`[Webhook] Pagamento ${paymentId} sem referência externa (pedidoId).`);
            return res.status(200).send("Sem referência externa.");
        }

        console.log(`📦 Webhook pagamento ${paymentId} - status: ${status}`);

        let novoStatus;
        let devolverEstoque = false;

        if (status === "approved") novoStatus = "Pago";
        else if (["rejected", "cancelled", "failed"].includes(status)) {
            novoStatus = "Recusado";
            devolverEstoque = true;
        } else {
            console.log(`[Webhook] Status ${status} não é final. Ignorando.`);
            return res.status(200).send("Status não final.");
        }

        const update = {
            $set: { status: novoStatus, paymentId },
            $unset: { expiresAt: "" },
        };

        const updateResult = await Ingresso.updateMany(
            { pedidoId, status: "Pendente" }, // Importante: Só atualiza se ainda estiver "Pendente"
            update
        );

        if (updateResult.modifiedCount === 0) {
            console.log(`[Webhook] Pedido ${pedidoId} já foi processado anteriormente.`);
            return res.status(200).send("Já processado.");
        }

        if (novoStatus === "Pago" && userId) {
            console.log(`[Webhook] Limpando carrinho do usuário ${userId}.`);
            await Carrinho.findOneAndDelete({ usuarioId: userId });
        }

        // Lógica do Payout de 7 dias
        if (status === "approved") {
            const produtorId = metadata?.produtor_id;
            const taxa = Number(metadata?.marketplace_fee);
            const total = Number(p.transaction_amount);

            if (produtorId && !isNaN(taxa) && !isNaN(total)) {
                const valorProdutor = total - taxa;
                const dataLiberacao = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

                await new Payout({
                    produtorId,
                    pedidoId,
                    paymentId,
                    valorAPagar: valorProdutor,
                    status: "Pendente",
                    dataLiberacao,
                }).save();

                console.log(`✅ Payout (R$${valorProdutor}) agendado para ${produtorId} em ${dataLiberacao.toISOString()}`);
            } else {
                console.warn(`[Webhook] Payout não agendado. Dados do metadata ausentes. produtorId: ${produtorId}, taxa: ${taxa}, total: ${total}`);
            }
        }

        if (devolverEstoque) {
            console.log(`[Webhook] Pagamento ${paymentId} recusado. Devolvendo estoque...`);
            const ingressos = await Ingresso.find({ pedidoId });
            const contagem = {};
            for (const i of ingressos) {
                const e = i.eventoId.toString();
                contagem[e] ??= { Inteira: 0, Meia: 0 };
                contagem[e][i.tipoIngresso]++;
            }
            const ops = Object.entries(contagem).map(([id, { Inteira, Meia }]) =>
                Event.updateOne(
                    { _id: id },
                    {
                        $inc: { quantidadeInteira: Inteira, quantidadeMeia: Meia },
                    }
                )
            );
            await Promise.all(ops);
        }

        res.status(200).send("OK");
    } catch (error) {
        console.error("❌ Erro no processamento do webhook:", error);
        res.status(200).send("Erro tratado."); // Responde 200 para o MP não continuar enviando
    }
});

// ==========================
// 🎟️ LISTAR INGRESSOS DO USUÁRIO
// ==========================
// ... (Nenhuma mudança aqui, está correto) ...
router.get("/ingressos/user", authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { search } = req.query;

    try {
        if (!search) {
            const ingressos = await Ingresso.find({ userId })
                .populate("eventoId")
                .select("-__v")
                .sort({ createdAt: -1 });
            return res.status(200).json(ingressos);
        }

        const regex = new RegExp(escapeRegex(search), "i");
        const ingressos = await Ingresso.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            {
                $lookup: {
                    from: "events",
                    localField: "eventoId",
                    foreignField: "_id",
                    as: "evento",
                },
            },
            { $unwind: { path: "$evento", preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    $or: [{ "evento.nome": regex }, { pedidoId: regex }, { tipoIngresso: regex }],
                },
            },
            { $sort: { createdAt: -1 } },
        ]);

        res.status(200).json(ingressos);
    } catch (error) {
        console.error("❌ Erro ao buscar ingressos:", error);
        res.status(500).json({ error: "Erro interno." });
    }
});

module.exports = router;