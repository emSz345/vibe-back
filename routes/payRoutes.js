const express = require('express');
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
router.post("/create-preference", authenticateToken, async (req, res) => {
    // Não precisa de items no body, o carrinho é a fonte
    const userId = req.user.userId;

    const preference = new Preference(client);

    try {
        // 1. Busca o carrinho do usuário
        const carrinho = await Carrinho.findOne({ usuarioId: userId });

        if (!carrinho || carrinho.itens.length === 0) {
            return res.status(400).json({ error: "Carrinho vazio. Adicione itens antes de prosseguir." });
        }

        // 2. Mapeia os itens do carrinho para o formato do Mercado Pago
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

        // 3. Cria metadados estruturados (CRUCIAL para o webhook)
        const eventMetadatas = carrinho.itens.map(item => ({
            eventoId: item.eventoId.toString(),
            tipoIngresso: item.tipoIngresso,
            quantidade: item.quantidade
        }));

        const data = await preference.create({
            body: {
                items: mpItems,
                external_reference: `USER-${userId}-${Date.now()}`,
                metadata: {
                    user_id: userId.toString(),
                    cart_items: eventMetadatas // Dados do carrinho para processamento no webhook
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


router.post("/webhook", async (req, res) => {

    let body;
    try {
        // Tenta parsear o corpo da requisição, que pode vir como um Buffer
        body = JSON.parse(req.body.toString());
    } catch (e) {
        console.error("❌ Erro ao parsear corpo do webhook:", e);
        return res.status(200).send("Corpo inválido. Ignorado.");
    }

    const { data, type } = body;

    // Ignora webhooks que não são de pagamento
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
        // Busca os detalhes completos do pagamento na API do Mercado Pago
        const paymentDetails = await paymentClient.get({ id: paymentId });
        const paymentData = paymentDetails?.body || paymentDetails;

        if (!paymentData || !paymentData.status) {
            console.error(`❌ Estrutura inválida do Mercado Pago para o ID: ${paymentId}.`);
            return res.status(200).send("Resposta do MP inválida, ignorando.");
        }

        const { status, metadata } = paymentData;

        console.log(`Detalhes: ID ${paymentId}, Status: ${status}`);


        if (status === "approved") {
            // 1. Processamento e Validação de Metadados
            const userId = metadata.user_id;
            let itemsToProcess = metadata.cart_items;

            // Tenta desserializar se o MP enviou o objeto como uma string JSON
            if (typeof itemsToProcess === 'string') {
                try {
                    itemsToProcess = JSON.parse(itemsToProcess);
                    console.log("✅ Metadados (cart_items) desserializados com sucesso.");
                } catch (e) {
                    console.error("❌ Erro ao desserializar cart_items da metadata. Usando array vazio.", e);
                    itemsToProcess = [];
                }
            }

            if (!userId || !Array.isArray(itemsToProcess) || itemsToProcess.length === 0) {
                console.error("❌ Erro: Metadados do usuário ou itens ausentes/inválidos.");
                console.error("Metadata recebida:", metadata);
                return res.status(200).send("Dados do usuário/carrinho ausentes.");
            }

            const ingressosASalvar = [];

            // 2. Loop para buscar o Evento e montar o Ingresso completo
            for (const item of itemsToProcess) {

                // 🔥 CORREÇÃO: Usamos 'evento_id' (snake_case)
                if (!item.evento_id) {
                    console.error("⚠️ Item sem evento_id válido. Ignorando:", item);
                    continue;
                }

                // Usa item.evento_id para buscar o evento no DB
                const evento = await Event.findById(item.evento_id);

                if (!evento) {
                    console.error(`⚠️ Evento ID ${item.evento_id} não encontrado no DB. Ignorando item.`);
                    continue;
                }

                // 🔥 CORREÇÃO: Usamos 'tipo_ingresso' (snake_case)
                const tipoIngressoComprado = item.tipo_ingresso;

                const valorUnitario = tipoIngressoComprado === 'Inteira'
                    ? evento.valorIngressoInteira
                    : evento.valorIngressoMeia;

                const localCompleto = `${evento.rua}, ${evento.numero}, ${evento.bairro} - ${evento.cidade}, ${evento.estado}`;

                // Cria N documentos de ingresso (um para cada unidade comprada)
                for (let i = 0; i < item.quantidade; i++) {
                    ingressosASalvar.push({
                        userId: userId,
                        paymentId: paymentId,
                        // Salvamos no DB como 'eventoId' (camelCase, conforme o Schema)
                        eventoId: item.evento_id,
                        nomeEvento: evento.nome,
                        dataEvento: evento.dataInicio,
                        localEvento: localCompleto,
                        tipoIngresso: tipoIngressoComprado,
                        valor: valorUnitario,
                        status: "Pago"
                    });
                }
            }

            // 3. Salva os ingressos e limpa o carrinho
            if (ingressosASalvar.length > 0) {
                await Ingresso.insertMany(ingressosASalvar);
                console.log(`✅ ${ingressosASalvar.length} Ingresso(s) salvo(s) com sucesso.`);
            } else {
                console.log(`❌ Nenhum ingresso para salvar (Evento(s) não encontrado(s) ou metadata vazia).`);
            }

            // Limpa o carrinho do usuário
            await Carrinho.findOneAndDelete({ usuarioId: userId });
            console.log(`✅ Carrinho do usuário ${userId} limpo.`);

        } else {
            console.log(`Pagamento ID ${paymentId} não aprovado. Status: ${status}.`);
        }

        // Sempre retorna 200 OK para o Mercado Pago
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
        const ingressosDoUsuario = await Ingresso.find({ userId: userId }).select('-__v');
        res.status(200).json(ingressosDoUsuario);
    } catch (error) {
        console.error("❌ Erro ao buscar ingressos do usuário:", error);
        res.status(500).json({ error: "Erro ao buscar ingressos." });
    }
});

module.exports = router;