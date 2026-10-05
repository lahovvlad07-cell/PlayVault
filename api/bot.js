import { sql, tg } from "../lib/core.js";

// Вебхук Telegram: подтверждение Stars, пополнение баланса и выдача слота.
export default async function handler(req, res) {
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.WEBHOOK_SECRET) {
    return res.status(401).end();
  }

  const u = req.body || {};

  // Обычная команда /start: Telegram доставляет её сюда тем же webhook,
  // что и платежные события. Раньше она молча игнорировалась.
  const msg = u.message;
  const text = String(msg?.text || "").trim();
  if (msg && text.split(/\s+/)[0].toLowerCase().split("@")[0] === "/start") {
    const webappUrl = process.env.WEBAPP_URL || `https://${req.headers.host}`;
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      text: "Добро пожаловать! Откройте магазин кнопкой ниже.",
      reply_markup: {
        inline_keyboard: [[{ text: "🎮 Открыть магазин", web_app: { url: webappUrl } }]]
      }
    });
    return res.json({ ok: true });
  }

  if (u.pre_checkout_query) {
    const q = u.pre_checkout_query;
    const payload = String(q.invoice_payload || "");

    if (payload.startsWith("balance:")) {
      const parts = payload.split(":");
      const payloadUser = Number(parts[1]);
      const amount = Number(parts[2]);
      const stars = Number(parts[3]);
      const ok = payloadUser === q.from.id && Number.isSafeInteger(amount) && amount >= 10 && amount <= 100000
        && Number.isSafeInteger(stars) && stars === Number(q.total_amount);
      await tg("answerPreCheckoutQuery", {
        pre_checkout_query_id: q.id,
        ok,
        error_message: ok ? undefined : "Пополнение не найдено"
      });
    } else {

      const [o] = await sql`
        select id
        from orders
        where id = ${Number(payload)}
          and user_id = ${q.from.id}
          and status = 'pending'
          and payment_method = 'stars'
          and stars = ${q.total_amount}
      `;
      await tg("answerPreCheckoutQuery", {
        pre_checkout_query_id: q.id,
        ok: !!o,
        error_message: "Заказ не найден"
      });
    }
  }

  const pay = u.message?.successful_payment;
  if (pay) {
    const idRaw = String(pay.invoice_payload || "");
    const uid = u.message.from.id;

    if (idRaw.startsWith("balance:")) {
      const parts = idRaw.split(":");
      const payloadUser = Number(parts[1]);
      const amount = Number(parts[2]);
      const stars = Number(parts[3]);

      if (payloadUser !== uid || !Number.isSafeInteger(amount) || amount < 10 || amount > 100000 || stars !== Number(pay.total_amount)) {
        return res.json({ ok: true });
      }

      const chargeId = String(pay.telegram_payment_charge_id || "");
      const credited = await sql.begin(async tx => {
        // Уникальный Telegram charge ID делает webhook идемпотентным:
        // повторная доставка одного платежа не начислит деньги второй раз.
        const [t] = await tx`
          insert into balance_transactions(
            user_id, type, amount_rub, tg_charge_id
          )
          values (${uid}, 'topup', ${amount}, ${chargeId})
          on conflict (tg_charge_id) do nothing
          returning id, amount_rub
        `;

        if (!t) return null;

        const [a] = await tx`
          update users
          set balance_rub = balance_rub + ${t.amount_rub}
          where id = ${uid}
          returning balance_rub
        `;

        return { amount: Number(t.amount_rub), balance: Number(a.balance_rub) };
      });

      if (credited) {
        await tg("sendMessage", {
          chat_id: uid,
          text: `Баланс пополнен на ${credited.amount} ₽. Текущий баланс: ${credited.balance} ₽.`
        });
      }

      return res.json({ ok: true });
    }

    const id = Number(idRaw);
    const result = await sql.begin(async tx => {
      const [o] = await tx`
        update orders
        set status = 'paid',
            tg_charge_id = ${pay.telegram_payment_charge_id}
        where id = ${id}
          and user_id = ${uid}
          and status = 'pending'
          and payment_method = 'stars'
          and stars = ${pay.total_amount}
        returning id, pack_id, price_rub
      `;

      if (!o) return null;

      const [a] = await tx`
        select id
        from accounts
        where pack_id = ${o.pack_id}
          and used < max_slots
        order by used asc, id asc
        limit 1
        for update skip locked
      `;

      if (!a) return { noSlot: true, orderId: o.id };

      await tx`
        update accounts
        set used = used + 1
        where id = ${a.id}
      `;

      await tx`
        update orders
        set account_id = ${a.id}
        where id = ${o.id}
      `;

      return { orderId: o.id, accountId: a.id };
    });

    if (result?.noSlot) {
      await sql`
        update orders
        set status = 'refunded'
        where id = ${result.orderId}
      `;
      await tg("refundStarPayment", {
        user_id: uid,
        telegram_payment_charge_id: pay.telegram_payment_charge_id
      });
      await tg("sendMessage", {
        chat_id: uid,
        text: "Свободных слотов не осталось, Stars возвращены."
      });
    } else if (result?.accountId) {
      await tg("sendMessage", {
        chat_id: uid,
        text: "Оплата прошла. Данные для входа: раздел «Мои доступы» в приложении."
      });
    }
  }

  return res.json({ ok: true });
}
