const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
// 🔥 IMPORTS NECESSÁRIOS
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const Ingresso = require('../models/ingresso'); // Seu model
const Carrinho = require('../models/Carrinho');
const Event = require('../models/Event');       // Seu model
const { authenticateToken } = require('../server'); // Sua autenticação

// Configuração
const client = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });
const notification = process.env.MP_NOTIFICATION_URL
const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

// --- Rota para criar a preferência de pagamento (COM RESERVA DE ESTOQUE) ---
router.post("/iniciar-pagamento", authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    // Usaremos uma sessão para a transação
    const session = await mongoose.startSession();

    try {
        // 1. Busca o carrinho do usuário
        const carrinho = await Carrinho.findOne({ usuarioId: userId });

        if (!carrinho || carrinho.itens.length === 0) {
            return res.status(400).json({ error: "Carrinho vazio." });
        }

        // ... (Sua camada de proteção de MAX_LENGTH continua aqui, está correta) ...
        // (Validação de MAX_LENGTH_TITLE, etc.)


        // ================== INÍCIO DA RESERVA DE ESTOQUE (TRANSAÇÃO) ==================

        // Inicia a transação
        session.startTransaction();

        // 2. Agrupa o que precisamos reservar
        const contagemPorEvento = {};
        for (const item of carrinho.itens) {
            const idEvento = item.eventoId.toString();
            const tipo = item.tipoIngresso; // "Inteira" ou "Meia"
            const qtd = item.quantidade;

            if (!contagemPorEvento[idEvento]) {
                // Armazena o nome para mensagens de erro
                contagemPorEvento[idEvento] = { Inteira: 0, Meia: 0, nomeEvento: item.nomeEvento };
            }
            if (tipo === 'Inteira') contagemPorEvento[idEvento].Inteira += qtd;
            if (tipo === 'Meia') contagemPorEvento[idEvento].Meia += qtd;
        }

        // 3. Tentar decrementar o estoque de forma atômica
        const updatePromises = [];
        const rollbackErrors = []; // Armazena erros de estoque

        for (const eventoId in contagemPorEvento) {
            const contagens = contagemPorEvento[eventoId];
            const totalADecrementar = contagens.Inteira + contagens.Meia;

            // 🔥 MUDE AQUI se os nomes dos campos no seu Model 'Event' forem diferentes
            const decrementOperation = { $inc: {} };
            if (contagens.Inteira > 0) decrementOperation.$inc.quantidadeInteira = -contagens.Inteira;
            if (contagens.Meia > 0) decrementOperation.$inc.quantidadeMeia = -contagens.Meia;
            // Linha do 'quantidadeTotal' REMOVIDA

            // A consulta atômica...
            const updatePromise = Event.updateOne(
                {
                    _id: eventoId,
                    // 🔥 Nomes corrigidos
                    quantidadeInteira: { $gte: contagens.Inteira },
                    quantidadeMeia: { $gte: contagens.Meia },
                    // Linha do 'quantidadeTotal' REMOVIDA
                },
                decrementOperation,
                { session: session }
            ).then(updateResult => {
                // se 'modifiedCount' (novo driver) ou 'nModified' (antigo) for 0, a condição $gte falhou
                if (updateResult.modifiedCount === 0 && updateResult.nModified === 0) {
                    rollbackErrors.push(`Estoque insuficiente para ${contagens.nomeEvento}.`);
                }
            });

            updatePromises.push(updatePromise);
        }

        await Promise.all(updatePromises);

        // 4. VERIFICAÇÃO: Se algum erro de estoque ocorreu, aborta a transação
        if (rollbackErrors.length > 0) {
            await session.abortTransaction();
            console.warn(`❌ Falha na reserva de estoque: ${rollbackErrors[0]}`);
            return res.status(400).json({ message: rollbackErrors[0] });
        }

        console.log(`✅ Estoque reservado para usuário ${userId}.`);
        // =================== FIM DA RESERVA DE ESTOQUE ====================

        // 5. Gerar um ID único para este pedido
        const pedidoId = new mongoose.Types.ObjectId().toString();
        const ingressosASalvar = [];

        // Define o tempo de expiração (ex: 30 minutos)
        const tempoExpiracao = new Date(Date.now() + 30 * 60 * 1000);

        // 6. Criar os ingressos como "Pendentes"
        for (const item of carrinho.itens) {
            // Re-busca o evento SÓ para pegar o valor (já que o estoque foi validado)
            const evento = await Event.findById(item.eventoId).session(session);
            if (!evento) continue;

            const valorUnitario = item.tipoIngresso === 'Inteira'
                ? evento.valorIngressoInteira
                : evento.valorIngressoMeia;

            for (let i = 0; i < item.quantidade; i++) {
                ingressosASalvar.push({
                    userId: userId,
                    pedidoId: pedidoId,
                    eventoId: item.eventoId,
                    tipoIngresso: item.tipoIngresso,
                    valor: valorUnitario,
                    status: "Pendente",
                    expiresAt: tempoExpiracao // 🔥 Adiciona o prazo de expiração
                });
            }
        }

        if (ingressosASalvar.length === 0) {
            throw new Error("Não foi possível processar os itens do carrinho.");
        }

        // Salva os ingressos DENTRO da mesma transação
        await Ingresso.insertMany(ingressosASalvar, { session: session });
        console.log(`✅ ${ingressosASalvar.length} ingresso(s) pendente(s) criado(s) para o Pedido ${pedidoId}.`);

        // 7. Mapeia os itens para o formato do MP
        const mpItems = carrinho.itens.map(item => {
            const descriptionText = `${item.tipoIngresso} - ${item.localEvento}`;
            return {
                id: `${item.eventoId}-${item.tipoIngresso}`,
                title: item.nomeEvento?.substring(0, 250),
                currency_id: "BRL",
                picture_url: item.imagem?.substring(0, 2000),
                description: descriptionText.substring(0, 600),
                category_id: "tickets",
                quantity: item.quantidade,
                unit_price: item.preco,
            };
        });

        // 8. Criar a Preferência de Pagamento do MP
        const preference = new Preference(client);
        const data = await preference.create({
            body: {
                items: mpItems,
                external_reference: pedidoId,
                metadata: { userId: userId.toString(), pedido_id: pedidoId },
                notification_url: `${notification}/api/pagamento/webhook`,
                back_urls: {
                    success: `${frontendBaseUrl}/meus-ingressos`,
                    pending: `${frontendBaseUrl}/meus-ingressos`,
                    failure: `${frontendBaseUrl}/meus-ingressos`
                },
                auto_return: "all"
            }
        });

        // 9. SUCESSO! Efetiva a transação
        await session.commitTransaction();

        // 10. Retorna a URL de pagamento para o frontend
        res.status(200).json({
            id: data.id,
            preference_url: data.init_point,
        });

    } catch (error) {
        // Se qualquer coisa falhar, aborta a transação
        await session.abortTransaction();
        console.error("❌ Erro ao iniciar pagamento:", error);
        res.status(500).json({ error: "Erro interno ao iniciar o pagamento." });
    } finally {
        // Sempre termina a sessão
        session.endSession();
    }
});


router.post("/create-preference", authenticateToken, async (req, res) => {
    try {
        // 1. Pega o ID do usuário pelo Token (MUITO mais seguro)
        const userId = req.user.userId;

        // 2. Pega os itens da doação do body
        const { items } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: "Itens da doação ausentes." });
        }

        // 3. Pega o valor (garante que é um número)
        const valorDoacao = Number(items[0].unit_price);
        if (isNaN(valorDoacao) || valorDoacao <= 0) {
            return res.status(400).json({ error: "Valor da doação inválido." });
        }

        // 4. Cria um ID único para esta doação (para o webhook)
        const doacaoId = new mongoose.Types.ObjectId().toString();

        // 5. Cria o item de preferência com segurança no backend
        const mpItem = {
            id: 'doacao',
            title: "Doação para VibeTicket", // Título definido no backend
            description: "Contribuição voluntária para a plataforma",
            quantity: 1,
            currency_id: "BRL",
            unit_price: valorDoacao // Usa o valor validado
        };

        // 6. Criar a Preferência de Pagamento do MP
        const preference = new Preference(client);
        const data = await preference.create({
            body: {
                items: [mpItem],
                external_reference: doacaoId, // ID da Doação
                metadata: {
                    user_id: userId.toString(),
                    pedido_id: doacaoId,
                    // 🔥 ESSENCIAL: Informa ao webhook que esta é uma doação
                    tipo: "DOACAO"
                },
                notification_url: `${notification}/api/pagamento/webhook`,
            }
        });

        // 7. Retorna a URL de pagamento para o frontend
        res.status(200).json({
            preference_url: data.init_point,
        });

    } catch (error) {
        console.error("❌ Erro ao criar preferência de doação:", error);
        res.status(500).json({ error: "Erro interno ao processar a doação." });
    }
});

router.post("/reembolsar", authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { pedidoId } = req.body;

    if (!pedidoId) {
        return res.status(400).json({ message: "O ID do pedido é obrigatório." });
    }

    // Usaremos uma sessão para garantir que o BD e o MP estejam sincronizados
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        // 1. Encontra os ingressos e verifica a propriedade
        // Garante que o usuário logado é o dono desses ingressos
        const ingressosDoPedido = await Ingresso.find({
            pedidoId: pedidoId,
            userId: userId
        }).session(session);

        if (!ingressosDoPedido || ingressosDoPedido.length === 0) {
            return res.status(404).json({ message: "Pedido não encontrado ou não pertence a este usuário." });
        }

        // 2. Verifica o status atual
        const statusAtual = ingressosDoPedido[0].status;
        if (statusAtual !== "Pago") {
            return res.status(400).json({ message: `Não é possível reembolsar um pedido com status: ${statusAtual}` });
        }

        // 🔥 (OPCIONAL - LÓGICA DE NEGÓCIO)
        // Aqui você adicionaria regras de tempo, por exemplo:
        // const evento = await Event.findById(ingressosDoPedido[0].eventoId);
        // const dataDoEvento = new Date(evento.dataInicio);
        // if (Date.now() > dataDoEvento.getTime() - (48 * 60 * 60 * 1000)) { // 48h antes
        //     return res.status(400).json({ message: "Não é possível cancelar com menos de 48h para o evento." });
        // }

        // 3. Pega o ID de pagamento (ele é o mesmo para todos os ingressos do pedido)
        const paymentId = ingressosDoPedido[0].paymentId;
        if (!paymentId) {
            return res.status(500).json({ message: "Erro: Payment ID não encontrado no ingresso." });
        }

        // 4. 🔥 Chama a API do Mercado Pago para estornar
        const paymentRefund = new PaymentRefund(client);

        console.log(`Iniciando reembolso para Payment ID: ${paymentId} (Pedido: ${pedidoId})`);

        // Por padrão (sem 'amount'), isso reembolsa o valor TOTAL
        const refundResult = await paymentRefund.create({
            payment_id: paymentId
        });

        // Se o MP não aprovar o reembolso, paramos tudo
        if (refundResult.status !== 'approved') {
            throw new Error(`O Mercado Pago não aprovou o reembolso. Status: ${refundResult.status}`);
        }

        console.log(`✅ Reembolso (ID: ${refundResult.id}) aprovado pelo MP.`);

        // 5. 🔥 Atualiza o status dos ingressos no SEU banco de dados
        await Ingresso.updateMany(
            { pedidoId: pedidoId, userId: userId },
            { $set: { status: 'Reembolsado' } },
            { session: session }
        );

        // 6. 🔥 DEVOLVE O ESTOQUE (copiado da sua lógica do webhook)
        const contagemParaDevolver = {};
        for (const ingresso of ingressosDoPedido) {
            const idEvento = ingresso.eventoId.toString();
            const tipo = ingresso.tipoIngresso;
            if (!contagemParaDevolver[idEvento]) {
                contagemParaDevolver[idEvento] = { Inteira: 0, Meia: 0 };
            }
            if (tipo === 'Inteira') contagemParaDevolver[idEvento].Inteira++;
            if (tipo === 'Meia') contagemParaDevolver[idEvento].Meia++;
        }

        const restockPromises = [];
        for (const eventoId in contagemParaDevolver) {
            const contagens = contagemParaDevolver[eventoId];

            const incrementOperation = { $inc: {} };
            // (Use os nomes corretos do seu Event.js)
            if (contagens.Inteira > 0) incrementOperation.$inc.quantidadeInteira = contagens.Inteira;
            if (contagens.Meia > 0) incrementOperation.$inc.quantidadeMeia = contagens.Meia;

            restockPromises.push(
                Event.updateOne(
                    { _id: eventoId },
                    incrementOperation,
                    { session: session }
                )
            );
        }

        await Promise.all(restockPromises);
        console.log(`♻️ Estoque devolvido (reembolso) para Pedido ${pedidoId}.`);

        // 7. Se tudo deu certo, commita a transação
        await session.commitTransaction();
        res.status(200).json({ message: "Reembolso processado com sucesso!" });

    } catch (error) {
        // Se algo falhar (MP ou BD), desfaz tudo
        await session.abortTransaction();
        console.error(`❌ Erro ao processar reembolso para Pedido ${pedidoId}:`, error);
        res.status(500).json({ message: error.message || "Erro interno ao processar o reembolso." });
    } finally {
        session.endSession();
    }
});

// --- Rota Webhook (MODIFICADA PARA DEVOLVER ESTOQUE) ---
router.post("/webhook", async (req, res) => {
    let body;
    try { body = JSON.parse(req.body.toString()); } catch (e) {
        return res.status(200).send("Corpo inválido. Ignorado.");
    }

    const { data, type } = body;

    if (type?.toLowerCase() !== "payment") {
        return res.status(200).send("OK.");
    }

    const paymentId = data?.id;
    if (!paymentId) {
        return res.status(200).send("ID de pagamento ausente. OK.");
    }

    const paymentClient = new Payment(client);

    try {
        const paymentDetails = await paymentClient.get({ id: paymentId });
        const paymentData = paymentDetails?.body || paymentDetails;

        if (!paymentData || !paymentData.status) {
            return res.status(200).send("Resposta do MP inválida, ignorando.");
        }

        const { status, external_reference, metadata } = paymentData;
        const pedidoId = external_reference;
        const userId = metadata?.user_id;

        if (metadata?.tipo === "DOACAO") {
            if (status === "approved") {
                console.log(`✅ Doação (ID: ${pedidoId}) do usuário ${userId} aprovada.`);
                // (Opcional: Você pode salvar essa doação num Model 'Doacao' aqui)
            } else {
                console.log(`Doação (ID: ${pedidoId}) status: ${status}.`);
            }
            // MUITO IMPORTANTE: Encerra a função aqui para não
            // tentar limpar o carrinho ou atualizar ingressos.
            return res.status(200).send("OK (Doação processada).");
        }

        if (!pedidoId) {
            return res.status(200).send("external_reference ausente.");
        }

        console.log(`Processando Webhook: Pagamento ${paymentId}, Pedido ${pedidoId}, Status MP: ${status}`);

        let novoStatusIngresso;
        let deveDevolverEstoque = false;

        // Remove a data de expiração, pois o ingresso não está mais "Pendente"
        const updateFields = {
            $set: { status: '', paymentId: paymentId },
            $unset: { expiresAt: "" }
        };

        if (status === "approved") {
            novoStatusIngresso = "Pago";
            updateFields.$set.status = novoStatusIngresso;
            // NÃO DEBITA ESTOQUE (já foi debitado)

        } else if (status === "rejected" || status === "cancelled" || status === "failed") {
            novoStatusIngresso = "Recusado";
            updateFields.$set.status = novoStatusIngresso;
            // 🔥 MARCA PARA DEVOLVER O ESTOQUE
            deveDevolverEstoque = true;

        } else {
            console.log(`Status '${status}' (ID: ${paymentId}) não é final. Aguardando.`);
            return res.status(200).send("OK.");
        }

        // ATUALIZA O STATUS DOS INGRESSOS PRIMEIRO
        // Atualiza apenas os que ainda estão 'Pendente'
        const updateResult = await Ingresso.updateMany(
            { pedidoId: pedidoId, status: 'Pendente' },
            updateFields
        );

        // Se 'nModified' for 0, significa que este webhook é duplicado ou já foi processado
        // (talvez pelo Cron Job). NÃO DEVEMOS DEVOLVER O ESTOQUE DE NOVO.
        if (updateResult.nModified === 0) {
            console.warn(`Webhook (ID: ${paymentId}): Nenhum ingresso 'Pendente' encontrado/modificado para o pedido ${pedidoId}. (Pode já ter sido processado)`);
            deveDevolverEstoque = false; // Cancela a devolução
        } else {
            console.log(`✅ ${updateResult.nModified} ingresso(s) atualizado(s) para ${novoStatusIngresso} (Pedido: ${pedidoId}).`);
        }

        // Se o pagamento foi APROVADO, limpa o carrinho
        if (novoStatusIngresso === "Pago" && userId) {
            await Carrinho.findOneAndDelete({ usuarioId: userId });
            console.log(`✅ Carrinho do usuário ${userId} limpo.`);
        }

        // ================== LÓGICA DE DEVOLUÇÃO DE ESTOQUE (RESTOCK) ==================
        if (deveDevolverEstoque) {
            // 1. Precisamos saber O QUE foi comprado para devolver
            //    Buscamos os ingressos que ACABAMOS de atualizar
            const ingressosDoPedido = await Ingresso.find({
                pedidoId: pedidoId,
                status: novoStatusIngresso
            });

            if (ingressosDoPedido.length > 0) {
                // 2. Agrupamos a contagem
                const contagemParaDevolver = {};
                for (const ingresso of ingressosDoPedido) {
                    const idEvento = ingresso.eventoId.toString();
                    const tipo = ingresso.tipoIngresso;
                    if (!contagemParaDevolver[idEvento]) {
                        contagemParaDevolver[idEvento] = { Inteira: 0, Meia: 0 };
                    }
                    if (tipo === 'Inteira') contagemParaDevolver[idEvento].Inteira++;
                    if (tipo === 'Meia') contagemParaDevolver[idEvento].Meia++;
                }

                // 3. Devolve (re-incrementa) o estoque
                const restockPromises = [];
                for (const eventoId in contagemParaDevolver) {
                    const contagens = contagemParaDevolver[eventoId];
                    const totalADevolver = contagens.Inteira + contagens.Meia;

                    // 🔥 MUDE AQUI se os nomes dos campos forem diferentes
                    const incrementOperation = { $inc: {} };
                    if (contagens.Inteira > 0) incrementOperation.$inc.quantidadeInteira = contagens.Inteira;
                    if (contagens.Meia > 0) incrementOperation.$inc.quantidadeMeia = contagens.Meia;

                    restockPromises.push(
                        Event.updateOne(
                            { _id: eventoId },
                            incrementOperation
                        ).catch(err => {
                            console.error(`❌ FALHA CRÍTICA AO DEVOLVER ESTOQUE: Evento ${eventoId}, Pedido ${pedidoId}. Erro:`, err);
                        })
                    );
                }

                await Promise.all(restockPromises);
                console.log(`♻️ Estoque devolvido (pagamento recusado) para Pedido ${pedidoId}.`);
            }
        }
        // =================== FIM DA LÓGICA DE DEVOLUÇÃO ====================

        res.status(200).send("OK");

    } catch (error) {
        console.error(`❌ Erro FATAL no processamento do webhook (ID ${paymentId}):`, error);
        res.status(200).send("Erro interno tratado.");
    }
});


// --- Rota para LISTAR os ingressos do usuário (Mantida) ---
router.get("/ingressos/user", authenticateToken, async (req, res) => {
    // ... (Sua rota original está correta)
    const userId = req.user.userId;
    try {
        const ingressosDoUsuario = await Ingresso.find({ userId: userId })
            .populate('eventoId')
            .select('-__v')
            .sort({ createdAt: -1 });
        res.status(200).json(ingressosDoUsuario);
    } catch (error) {
        console.error("❌ Erro ao buscar ingressos do usuário:", error);
        res.status(500).json({ error: "Erro ao buscar ingressos." });
    }
});

module.exports = router;