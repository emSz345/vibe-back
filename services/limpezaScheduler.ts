import cron from "node-cron";
import mongoose, { ClientSession, Types } from "mongoose";
import Ingresso, { IIngresso } from "../models/ingresso";
import Event from "../models/Event";
import SchedulerLock from "../models/SchedulerLock";

export async function iniciarCronLimpezaIngressos() {
  const cronName = "limpeza_ingressos";

  // Evita duplicar agendamento no mesmo processo
  const jaAtivo = await SchedulerLock.findOne({ name: cronName });
  if (jaAtivo?.isRunning) {
    console.log(`⚠️ [${cronName}] Já está ativo neste processo.`);
  }

  console.log("🕒 [LIMPEZA CRON] Agendado a cada 5 minutos.");

  cron.schedule("*/5 * * * *", async () => {
    console.log("[LIMPEZA CRON] Executando...");

    // 🔒 Lock de execução (evita duas execuções simultâneas)
    const lock = await SchedulerLock.findOneAndUpdate(
      { name: cronName },
      { name: cronName, isRunning: true, updatedAt: new Date() },
      { upsert: true, new: true }
    ); 

    if (lock.isLocked()) {
      console.log("⛔ [LIMPEZA CRON] Já está sendo executado em outro processo.");
      return;
    }

    let session: ClientSession | null = null;

    try {
      session = await mongoose.startSession();
      await session.startTransaction();

      const ingressosExpirados: IIngresso[] = await Ingresso.find({
        status: "Pendente",
        expiresAt: { $lt: new Date() },
      }).session(session);

      if (ingressosExpirados.length === 0) {
        console.log("[LIMPEZA CRON] Nenhum ingresso expirado.");
        await session.abortTransaction();
        return;
      }

      console.log(
        `[LIMPEZA CRON] ${ingressosExpirados.length} ingressos expirados encontrados.`
      );

      const eventos = new Map<
        string,
        { Inteira: number; Meia: number }
      >();

      const idsParaAtualizar: Types.ObjectId[] = [];

      for (const ingresso of ingressosExpirados) {
        const eventoId = ingresso.eventoId.toString();
        const tipo = ingresso.tipoIngresso;

        idsParaAtualizar.push(ingresso._id);

        if (!eventos.has(eventoId)) {
          eventos.set(eventoId, { Inteira: 0, Meia: 0 });
        }

        if (tipo === "Inteira") eventos.get(eventoId)!.Inteira++;
        if (tipo === "Meia") eventos.get(eventoId)!.Meia++;
      }

      // Repor estoque
      for (const [eventoId, contagem] of eventos.entries()) {
        const inc: any = { $inc: {} };

        if (contagem.Inteira > 0)
          inc.$inc.quantidadeInteira = contagem.Inteira;
        if (contagem.Meia > 0)
          inc.$inc.quantidadeMeia = contagem.Meia;

        await Event.updateOne({ _id: eventoId }, inc, { session });
      }

      // Atualizar ingressos
      await Ingresso.updateMany(
        { _id: { $in: idsParaAtualizar } },
        { $set: { status: "Expirado" }, $unset: { expiresAt: "" } },
        { session }
      );

      await session.commitTransaction();
      console.log(
        `[LIMPEZA CRON] SUCESSO: ${idsParaAtualizar.length} ingressos expirados.`
      );
    } catch (err) {
      console.error("❌ [LIMPEZA CRON] Erro:", err);
      if (session) await session.abortTransaction();
    } finally {
      if (session) session.endSession();

      // Libera lock
      await SchedulerLock.updateOne(
        { name: cronName },
        { isRunning: false }
      );
    }
  });
}
