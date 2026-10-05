import { sql, tg } from "../lib/core.js";

export default async function handler(req, res) {
  // Проверка секретного токена вебхука
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.WEBHOOK_SECRET) {
    return res.status(401).end();
  }

  const u = req.body || {};

  // 1. Команда /start — отправка кнопки Mini App
  if (u.message?.text?.startsWith("/start")) {
    const chatId = u.message.chat.id;
    const webAppUrl = `https://${req.headers.host}`;

    await tg("sendMessage", {
      chat_id: chatId,
      text: "Привет! Нажми кнопку ниже, чтобы открыть магазин:",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎮 Открыть PlayVault", web_app: { url: webAppUrl } }]
        ]
      }
    });
    return res.json({ ok: true });
  }

  // 2. Предпроверка заказа (Pre-checkout query)
  if (u.pre_checkout_query) {
    const q = u.pre_checkout_query;
    const orderId = Number(q.invoice_payload);

    // Проверяем наличие заказа в базе
    const [o] = await sql`select id from orders where id = ${orderId} and user_id = ${q.from.id} and status = 'pending'`;

    if (o) {
      await tg("answerPreCheckoutQuery", { pre_checkout_query_id: q.id, ok: true });
    } else {
      await tg("answerPreCheckoutQuery", { 
        pre_checkout_query_id: q.id, 
        ok: false, 
        error_message: "Заказ не найден или уже оплачен" 
      });
    }
    return res.json({ ok: true });
  }

  // 3. Успешная оплата (Successful payment)
  const pay = u.message?.successful_payment;
  if (pay) {
    const id = Number(pay.invoice_payload);
    const uid = u.message.from.id;

    // Обновляем заказ, переводим в статус paid
    const [o] = await sql`update orders set status = 'paid', tg_charge_id = ${pay.telegram_payment_charge_id}
                          where id = ${id} and user_id = ${uid} and status = 'pending'
                          returning pack_id`;

    if (o) {
      // Бронируем свободный аккаунт и увеличиваем used
      const [a] = await sql`update accounts set used = used + 1 where id = (
                              select id from accounts where pack_id = ${o.pack_id} and used < max_slots
                              order by used desc limit 1 for update skip locked) returning id`;

      if (a) {
        await sql`update orders set account_id = ${a.id} where id = ${id}`;
        await tg("sendMessage", { 
          chat_id: uid, 
          text: "✅ Оплата прошла успешно! Ваши данные для входа доступны в разделе «Мои доступы» внутри приложения." 
        });
      } else {
        // Если слоты закончились прямо перед оплатой — делаем возврат Stars
        await sql`update orders set status = 'refunded' where id = ${id}`;
        await tg("refundStarPayment", { 
          user_id: uid, 
          telegram_payment_charge_id: pay.telegram_payment_charge_id 
        });
        await tg("sendMessage", { 
          chat_id: uid, 
          text: "К сожалению, свободные слоты закончились. Звёзды (Stars) автоматически возвращены на ваш баланс." 
        });
      }
    }
    return res.json({ ok: true });
  }

  res.json({ ok: true });
}
