import cron from "node-cron";
import PayoutModel from "../models/Payout";
import Perfil from "../models/Perfil";
import SchedulerLock from "../models/SchedulerLock";

const { MercadoPagoConfig, Payouts } = require("mercadopago");

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_TOKEN,
});

export async function executarPagamentos() {
  const cronName = "payout_scheduler";

  console.log("🤖 [PAYOUT CRON] Iniciando execução...");

  const lock = await SchedulerLock.findOneAndUpdate(
    { name: cronName },
    { name: cronName, isRunning: true, updatedAt: new Date() },
    { upsert: true, new: true }
  );

  if (lock.isLocked()) {
    console.log("⛔ [PAYOUT CRON] Já está sendo executado em outro processo.");
    return;
  }

  try {
    const pendentes = await PayoutModel.find({
      status: "Pendente",
      dataLiberacao: { $lte: new Date() },
    });

    if (pendentes.length === 0) {
      console.log("🤖 [PAYOUT CRON] Nenhum payout pendente.");
      return;
    }

    console.log(`🤖 [PAYOUT CRON] ${pendentes.length} payout(s) encontrados.`);

    const payoutClient = new Payouts(client);

    for (const payout of pendentes) {
      try {
        const produtor = await Perfil.findById(payout.produtorId);

        if (!produtor?.mercadoPagoAccountId) {
          throw new Error("Produtor sem conta MercadoPago.");
        }

        const req = {
          receiver_id: produtor.mercadoPagoAccountId,
          transaction_amount: payout.valorAPagar,
          currency_id: "BRL",
          description: `Repasse VibeTicket - Pedido: ${payout.pedidoId}`,
          external_reference: `PAYOUT-${payout.pedidoId}`,
        };

        const mp = await payoutClient.create(req);

        await PayoutModel.updateOne(
          { _id: payout._id },
          { status: "Pago", mpPayoutId: mp.id?.toString() }
        );

        console.log(`✅ Payout ${payout._id} pago.`);
      } catch (err: any) {
        const msg = err.response?.data
          ? JSON.stringify(err.response.data)
          : err.message;

        console.error(`❌ Erro no payout ${payout._id}: ${msg}`);

        await PayoutModel.updateOne(
          { _id: payout._id },
          { status: "Erro", erro: msg }
        );
      }
    }
  } catch (err) {
    console.error("🔥 Erro geral payout:", err);
  } finally {
    await SchedulerLock.updateOne(
      { name: cronName },
      { isRunning: false }
    );
  }
}

export function iniciarCronPayout() {
  console.log("🕒 [PAYOUT CRON] Agendado para 03:00 (America/Sao_Paulo).");

  cron.schedule(
    "0 3 * * *",
    executarPagamentos,
    { timezone: "America/Sao_Paulo" }
  );
}
