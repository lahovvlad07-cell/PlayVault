import { sql, tg } from "../lib/core.js";

// Вебхук Telegram: подтверждение оплаты Stars и выдача слота
export default async function handler(req, res) {
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.WEBHOOK_SECRET) return res.status(401).end();
  const u = req.body || {};

  if (u.pre_checkout_query) {
    const q = u.pre_checkout_query;
    const [o] = await sql`select id from orders where id = ${Number(q.invoice_payload)} and user_id = ${q.from.id}
                          and status = 'pending' and stars = ${q.total_amount}`;
    await tg("answerPreCheckoutQuery", { pre_checkout_query_id: q.id, ok: !!o, error_message: "Заказ не найден" });
  }

  const pay = u.message?.successful_payment;
  if (pay) {
    const uid = u.message.from.id;
    // Пополнение баланса
    if (String(pay.invoice_payload).startsWith("topup:")) {
      const tid = Number(pay.invoice_payload.split(":")[1]);
      const [t] = await sql`update topups set status='paid', tg_charge_id=${pay.telegram_payment_charge_id}
                            where id=${tid} and user_id=${uid} and status='pending' returning rub`;
      if (t) await tg("sendMessage", { chat_id: uid, text: `✅ Баланс пополнен на ${t.rub} ₽` });
      res.json({ ok: true }); return;
    }
    const id = Number(pay.invoice_payload), uid2 = uid;
    // Идемпотентность: повторный вебхук не выдаст второй слот (обновится только pending-заказ)
    const [o] = await sql`update orders set status = 'paid', tg_charge_id = ${pay.telegram_payment_charge_id}
                          where id = ${id} and user_id = ${uid2} and status = 'pending' and stars = ${pay.total_amount}
                          returning pack_id`;
    if (o) {
      const [a] = await sql`update accounts set used = used + 1 where id = (
                              select id from accounts where pack_id = ${o.pack_id} and used < max_slots
                              order by used desc limit 1 for update skip locked) returning id`;
      if (a) {
        await sql`update orders set account_id = ${a.id} where id = ${id}`;
        await tg("sendMessage", { chat_id: uid2, text: "Оплата прошла. Данные для входа: раздел «Мои доступы» в приложении." });
      } else {
        // Слоты разобрали, пока шла оплата: возвращаем Stars автоматически
        await sql`update orders set status = 'refunded' where id = ${id}`;
        await tg("refundStarPayment", { user_id: uid2, telegram_payment_charge_id: pay.telegram_payment_charge_id });
        await tg("sendMessage", { chat_id: uid2, text: "Свободных слотов не осталось, Stars возвращены." });
      }
    }
  }
  res.json({ ok: true });
}
