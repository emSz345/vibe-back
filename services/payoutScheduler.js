// services/payoutScheduler.js
const cron = require('node-cron');
const { MercadoPagoConfig, Payouts } = require('mercadopago');
const Payout = require('../models/Payout');
const Perfil = require('../models/Perfil'); // Você já tem esse Model

// 🔥 IMPORTANTE: Use o Access Token da SUA PLATAFORMA (o dinheiro sai daqui)
const client = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN });

const executarPagamentos = async () => {
    console.log('--- 🤖 CRON: Iniciando verificação de Payouts Agendados ---');

    // 1. Busca Payouts que estão 'Pendentes' e cuja data de liberação já passou
    const payoutsParaPagar = await Payout.find({
        status: 'Pendente',
        dataLiberacao: { $lte: new Date() } // "menor ou igual a agora"
    });

    if (payoutsParaPagar.length === 0) {
        console.log('--- 🤖 CRON: Nenhum Payout para processar hoje. ---');
        return;
    }

    console.log(`--- 🤖 CRON: ${payoutsParaPagar.length} Payout(s) encontrado(s) para processar. ---`);

    // 2. Loop para processar cada um individualmente
    for (const payout of payoutsParaPagar) {
        try {
            // 3. Busca o ID da conta MP do produtor no Perfil dele
            const produtor = await Perfil.findById(payout.produtorId);

            if (!produtor || !produtor.mercadoPagoAccountId) {
                throw new Error(`Produtor ${payout.produtorId} não encontrado ou não tem 'mercadoPagoAccountId'.`);
            }

            // 4. Prepara a chamada para a API de Payouts do MP
            const payoutClient = new Payouts(client);

            const payoutRequest = {
                // O ID da conta do produtor (que você salvou no /callback)
                receiver_id: produtor.mercadoPagoAccountId,
                transaction_amount: payout.valorAPagar,
                currency_id: "BRL",
                description: `Repasse VibeTicket - Pedido: ${payout.pedidoId}`,
                // ID único para evitar pagamentos duplicados
                external_reference: `PAYOUT-${payout.pedidoId}`
            };

            // 5. 🔥 EXECUTA A TRANSFERÊNCIA (PAYOUT)
            const mpResponse = await payoutClient.create(payoutRequest);

            // 6. Se deu certo, atualiza nosso banco
            await Payout.updateOne(
                { _id: payout._id },
                {
                    status: 'Pago',
                    mpPayoutId: mpResponse.id // Salva o ID da transação
                }
            );
            console.log(`✅ SUCESSO: Payout ${payout._id} (R$${payout.valorAPagar}) pago ao Produtor ${produtor._id}.`);

        } catch (error) {
            // 7. Se deu erro (ex: produtor com conta bloqueada, etc.)
            const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error(`❌ FALHA ao processar Payout ${payout._id}:`, errorMsg);

            // Marca como 'Erro' para não tentar de novo automaticamente
            await Payout.updateOne(
                { _id: payout._id },
                {
                    status: 'Erro',
                    erro: errorMsg
                }
            );
        }
    }
    console.log('--- 🤖 CRON: Verificação de Payouts finalizada. ---');
};

// 8. Exporta a função para ser chamada pelo seu server.js
module.exports = {
    executarPagamentos,
    iniciarCron: () => {
        // Agenda para rodar 'executarPagamentos' todo dia às 3 da manhã
        // (Minuto '0', Hora '3', Todo Dia, Todo Mês, Toda Semana)
        cron.schedule('0 3 * * *', executarPagamentos, {
            timezone: "America/Sao_Paulo"
        });
        console.log("Serviço de Payouts agendado para 03:00 (São Paulo).");
    }
};