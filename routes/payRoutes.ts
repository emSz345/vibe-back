// ==========================
// 📦 payRoutes.ts
// ==========================
import express, { Request, Response } from "express";
import mongoose, { ClientSession } from "mongoose";
import mercadopago from 'mercadopago';
import { MercadoPagoConfig, Preference, Payment, PaymentRefund } from 'mercadopago';
import Ingresso from "../models/ingresso";
import Carrinho from "../models/Carrinho";
import Event from "../models/Event";
import Payout from "../models/Payout";
import { protect as authenticateToken } from "../authMiddleware";
import User from "../models/User";
import { enviarEmailLinkPagamento } from "../utils/emailService";

// ==========================
// ⚙️ CONFIGURAÇÕES
// ==========================
const router = express.Router();
const notification = process.env.MP_NOTIFICATION_URL || "";
const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:3000";

// ==========================
// 🧰 FUNÇÕES AUXILIARES
// ==========================

const getCommissionValue = (totalAmount: number, commissionPercentage = 0.1) =>
  Number((totalAmount * commissionPercentage).toFixed(2));

// ==========================
// 💳 INICIAR PAGAMENTO (RESERVA DE ESTOQUE)
// ==========================
router.post(
  "/iniciar-pagamento",
  authenticateToken,
  async (req: Request, res: Response) => {
    const userId = (req as any).user.userId as string;
    const session: ClientSession = await mongoose.startSession();

    try {
      session.startTransaction();

      const usuario = await User.findById(userId).session(session);
      if (!usuario) {
        await session.abortTransaction();
        return res.status(404).json({ error: "Usuário não encontrado." });
      }

      const carrinho = await Carrinho.findOne({ usuarioId: userId });
      if (!carrinho || carrinho.itens.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({ error: "Carrinho vazio." });
      }

      // Agrupar itens por evento
      const contagemPorEvento: Record<
        string,
        { Inteira: number; Meia: number; nomeEvento: string }
      > = {};

      for (const item of carrinho.itens) {
        const idEvento = item.eventoId.toString();
        const tipo = item.tipoIngresso;
        const qtd = item.quantidade;

        if (!contagemPorEvento[idEvento])
          contagemPorEvento[idEvento] = {
            Inteira: 0,
            Meia: 0,
            nomeEvento: item.nomeEvento,
          };

        if (tipo === "Inteira") contagemPorEvento[idEvento].Inteira += qtd;
        if (tipo === "Meia") contagemPorEvento[idEvento].Meia += qtd;
      }

      // Reserva de estoque
      for (const eventoId in contagemPorEvento) {
        const { Inteira, Meia, nomeEvento } = contagemPorEvento[eventoId];
        const update: any = { $inc: {} };
        if (Inteira > 0) update.$inc.quantidadeInteira = -Inteira;
        if (Meia > 0) update.$inc.quantidadeMeia = -Meia;

        const result = await Event.updateOne(
          {
            _id: eventoId,
            quantidadeInteira: { $gte: Inteira },
            quantidadeMeia: { $gte: Meia },
          },
          update,
          { session }
        );

        if (result.modifiedCount === 0) {
          await session.abortTransaction();
          return res
            .status(400)
            .json({ error: `Estoque insuficiente para ${nomeEvento}.` });
        }
      }

      // Identifica produtor
      const evento = await Event.findById(carrinho.itens[0].eventoId).session(
        session
      );
      if (!evento) throw new Error("Evento não encontrado.");
      const produtorId = evento.criadoPor;

      console.log(`🎭 Produtor ID ${produtorId} identificado.`);

      // Criar ingressos pendentes
      const pedidoId = new mongoose.Types.ObjectId().toString();
      const expiracao = new Date(Date.now() + 30 * 60 * 1000);
      const ingressosASalvar: any[] = [];

      for (const item of carrinho.itens) {
        const eventoItem = await Event.findById(item.eventoId).session(session);
        if (!eventoItem) continue;
        const valor =
          item.tipoIngresso === "Inteira"
            ? eventoItem.valorIngressoInteira
            : eventoItem.valorIngressoMeia;

        for (let i = 0; i < item.quantidade; i++) {
          ingressosASalvar.push({
            userId,
            pedidoId,
            eventoId: item.eventoId,
            tipoIngresso: item.tipoIngresso,
            valor, // 'valor' vem do 'eventoItem'
            status: "Pendente",
            expiresAt: expiracao,

            // 👇 ADICIONE ESTAS 3 LINHAS (copiando do 'item' do carrinho)
            nomeEvento: item.nomeEvento,
            dataEvento: item.dataEvento as string | Date, // Tipagem para segurança
            localEvento: item.localEvento as string,   // Tipagem para segurança
          });
        }
      }

      await Ingresso.insertMany(ingressosASalvar, { session });
      console.log(`✅ ${ingressosASalvar.length} ingressos criados.`);

      const total = carrinho.itens.reduce(
        (s: number, i: any) => s + i.preco * i.quantidade,
        0
      );
      const fee = getCommissionValue(total);

      const appClient = new MercadoPagoConfig({
        accessToken: process.env.MP_TOKEN!,
      });
      const preference = new Preference(appClient);

      const mpItems = carrinho.itens.map((i: any) => ({
        id: `${i.eventoId}-${i.tipoIngresso}`,
        title: i.nomeEvento,
        currency_id: "BRL",
        picture_url: i.imagem,
        description: `${i.tipoIngresso} - ${i.localEvento}`,
        category_id: "tickets",
        quantity: i.quantidade,
        unit_price: i.preco,
      }));
      
      // 👇 ALTERADO: Adição das back_urls para redirecionar para Meus Ingressos
      const backUrls = {
        success: `${frontendBaseUrl}/meus-ingressos`,
        pending: `${frontendBaseUrl}/meus-ingressos`,
        failure: `${frontendBaseUrl}/meus-ingressos`,
      };

      const data = await preference.create({
        body: {
          items: mpItems,
          external_reference: pedidoId,
          back_urls: backUrls, // <--- NOVO
          auto_return: "approved",
          metadata: {
            user_id: userId.toString(),
            pedido_id: pedidoId,
            produtor_id: produtorId.toString(),
            marketplace_fee: fee,
          },
          notification_url: `${notification}/api/pagamento/webhook`,
          expires: true,
          expiration_date_from: new Date().toISOString(),
          expiration_date_to: expiracao.toISOString(),
        },
      });

      await session.commitTransaction();

      if (data.init_point) {

        // Se existir, chamamos a função de e-mail (sem await)
        enviarEmailLinkPagamento(
          { nome: usuario.nome, email: usuario.email },
          data.init_point // Agora o TypeScript sabe que isso é uma 'string'
        ).catch(err => {
          console.error(`[ALERTA] Falha ao enviar e-mail de link de pagamento para ${usuario.email}:`, err);
        });

      } else {
        // Se não existir, é um erro inesperado. Logamos isso.
        console.error(`[ERRO CRÍTICO] Preference ${data.id} criada sem init_point! E-mail não enviado.`);
      }

      res.status(200).json({
        id: data.id,
        preference_url: data.init_point,
      });
    } catch (error: any) {
      await session.abortTransaction();
      console.error("❌ Erro ao iniciar pagamento:", error);
      res.status(500).json({ error: error.message });
    } finally {
      session.endSession();
    }
  }
);

// ==========================
// 💖 CRIAR PREFERÊNCIA DE DOAÇÃO
// ==========================
router.post(
  "/create-preference",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const appClient = new MercadoPagoConfig({
        accessToken: process.env.MP_TOKEN!,
      });
      const preference = new Preference(appClient);
      const userId = (req as any).user.userId;
      const { items } = req.body;

      if (!items?.length)
        return res.status(400).json({ error: "Itens ausentes." });

      const valor = Number(items[0].unit_price);
      if (isNaN(valor) || valor <= 0)
        return res.status(400).json({ error: "Valor inválido." });

      const doacaoId = new mongoose.Types.ObjectId().toString();
      
      // 👇 NOVO: Definição das back_urls para redirecionar para Meus Ingressos
      const backUrls = {
        success: `${frontendBaseUrl}/meus-ingressos`,
        pending: `${frontendBaseUrl}/meus-ingressos`,
        failure: `${frontendBaseUrl}/meus-ingressos`,
      };

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
          back_urls: backUrls, // <--- NOVO
          auto_return: "approved",
          metadata: { user_id: userId, pedido_id: doacaoId, tipo: "DOACAO" },
          notification_url: `${notification}/api/pagamento/webhook`,
        },
      });

      res.status(200).json({ preference_url: data.init_point });
    } catch (error) {
      console.error("❌ Erro ao criar preferência de doação:", error);
      res.status(500).json({ error: "Erro interno." });
    }
  }
);

// ==========================
// 📩 WEBHOOK MERCADO PAGO
// ==========================
router.post("/webhook", async (req: Request, res: Response) => {
  const appClient = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN as string });
  const paymentClient = new Payment(appClient);
  let body: any;

  try {
    if (req.body && Buffer.isBuffer(req.body)) {
      body = JSON.parse(req.body.toString());
    } else {
      body = req.body;
    }

    const { data, type } = body;
    console.log(`[Webhook Recebido] Tipo: ${type}, Data ID: ${data?.id}`);

    if (type?.toLowerCase() !== "payment") {
      return res.status(200).send("OK (Não é um pagamento)");
    }

    const paymentId = data?.id; // Este é 'number | undefined'

    // 🔥 CORREÇÃO 1: Adicionar esta verificação
    // Isso garante que 'paymentId' é um 'number' nas linhas abaixo.
    if (!paymentId) {
      console.log("[Webhook] Sem ID de pagamento no corpo.");
      return res.status(200).send("Sem ID de pagamento.");
    }

    // Agora esta chamada é segura
    const paymentDetails = await paymentClient.get({ id: paymentId });
    const p = paymentDetails;

    const { status, external_reference: pedidoId, metadata } = p; // Este é 'string | undefined'
    const userId = metadata?.user_id;

    if (metadata?.tipo === "DOACAO") {
      if (status === "approved") console.log(`✅ Doação ${pedidoId} aprovada.`);
      return res.status(200).send("OK (doação)");
    }

    // 🔥 CORREÇÃO 2: Adicionar esta verificação
    // Isso garante que 'pedidoId' é uma 'string' nas linhas abaixo.
    if (!pedidoId) {
      console.log(`[Webhook] Pagamento ${paymentId} sem referência externa (pedidoId).`);
      return res.status(200).send("Sem referência externa.");
    }

    console.log(`📦 Webhook pagamento ${paymentId} - status: ${status}`);

    let novoStatus: string | null = null;
    let devolverEstoque = false;

    if (status === "approved") {
      novoStatus = "Pago";
    } else if (
      status &&
      ["rejected", "cancelled", "failed"].includes(status)
    ) {
      novoStatus = "Recusado";
      devolverEstoque = true;
    } else {
      console.log(`[Webhook] Status ${status} não é final. Ignorando.`);
      return res.status(200).send("Status não final.");
    }

    // Agora estas chamadas são seguras
    const updateResult = await Ingresso.updateMany(
      { pedidoId, status: "Pendente" }, // 'pedidoId' é 'string'
      {
        $set: { status: novoStatus, paymentId: paymentId.toString() }, // 'paymentId' é 'number'
        $unset: { expiresAt: "" },
      }
    );

    if (updateResult.modifiedCount === 0) {
      console.log(`[Webhook] Pedido ${pedidoId} já foi processado anteriormente.`);
      return res.status(200).send("Já processado.");
    }

    if (novoStatus === "Pago" && userId) {
      console.log(`[Webhook] Limpando carrinho do usuário ${userId}.`);
      await Carrinho.findOneAndDelete({ usuarioId: userId });
    }

    if (status === "approved") {
      const produtorId = metadata?.produtor_id;
      const taxa = Number(metadata?.marketplace_fee);
      const total = Number(p.transaction_amount);

      if (produtorId && !isNaN(taxa) && !isNaN(total)) {
        const valorProdutor = total - taxa;
        const dataLiberacao = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // E esta chamada também é segura
        await new Payout({
          produtorId,
          pedidoId, // 'pedidoId' é 'string'
          paymentId: paymentId.toString(), // 'paymentId' é 'number'
          valorAPagar: valorProdutor,
          status: "Pendente",
          dataLiberacao,
        }).save();

        console.log(`✅ Payout (R$${valorProdutor}) agendado para ${produtorId} em ${dataLiberacao.toISOString()}`);
      } else {
        console.warn(`[Webhook] Payout não agendado. Dados do metadata ausentes.`);
      }
    }

    // Se foi recusado, devolve o estoque
    if (devolverEstoque) {
      console.log(`[Webhook] Pagamento ${paymentId} recusado. Devolvendo estoque...`);
      const ingressos = await Ingresso.find({ pedidoId });
      const contagem: { [key: string]: { Inteira: number, Meia: number } } = {};

      for (const i of ingressos) {
        const e = i.eventoId.toString();
        contagem[e] = contagem[e] || { Inteira: 0, Meia: 0 };
        if (i.tipoIngresso === 'Inteira') contagem[e].Inteira++;
        else if (i.tipoIngresso === 'Meia') contagem[e].Meia++;
      }

      const ops = Object.entries(contagem).map(([id, { Inteira, Meia }]) =>
        Event.updateOne(
          { _id: id },
          {
            $inc: {
              quantidadeInteira: Inteira,
              quantidadeMeia: Meia
            },
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
// 💰 REEMBOLSAR PEDIDO
// ==========================
router.post("/reembolsar", authenticateToken, async (req: Request, res: Response) => {
  const userId = (req as any).user.userId;
  const { pedidoId } = req.body as { pedidoId?: string };
  if (!pedidoId) return res.status(400).json({ error: "pedidoId é obrigatório." });

  const session: ClientSession = await mongoose.startSession();
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

    const dataCompra = ingressos[0].createdAt; // Pega a data de criação do ingresso
    const dataLimite = new Date(dataCompra.getTime() + 7 * 24 * 60 * 60 * 1000); // Adiciona 7 dias
    const agora = new Date();

    if (agora > dataLimite) {
      await session.abortTransaction();
      return res.status(403).json({ error: "O prazo de 7 dias para reembolso expirou." });
    }

    const paymentId = ingressos[0].paymentId;
    if (!paymentId) throw new Error("Payment ID não encontrado.");

    const appClient = new MercadoPagoConfig({ accessToken: process.env.MP_TOKEN! });
    const refund = new PaymentRefund(appClient);
    const result = await refund.create({ payment_id: paymentId });

    if (result.status !== "approved") throw new Error(`Reembolso não aprovado.`);

    await Payout.findOneAndUpdate(
      { pedidoId, status: "Pendente" },
      { status: "Reembolsado" },
      { session }
    );

    await Ingresso.updateMany({ pedidoId, userId }, { status: "Reembolsado" }, { session });

    const contagem: Record<string, { Inteira: number; Meia: number }> = {};
    for (const i of ingressos) {
      const e = i.eventoId.toString();
      contagem[e] ??= { Inteira: 0, Meia: 0 };
      contagem[e][i.tipoIngresso]++;
    }

    const ops = Object.entries(contagem).map(([eventoId, { Inteira, Meia }]) =>
      Event.updateOne(
        { _id: eventoId },
        { $inc: { quantidadeInteira: Inteira, quantidadeMeia: Meia } },
        { session }
      )
    );
    await Promise.all(ops);

    await session.commitTransaction();
    res.status(200).json({ message: "Reembolso concluído." });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("❌ Erro no reembolso:", error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
});

export default router;
