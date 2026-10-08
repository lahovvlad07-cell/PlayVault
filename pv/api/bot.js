import { sql, tg, bindRef, rewardRef, consumePromo, REF_BONUS, APP_URL, isStaff } from "../lib/core.js";

// Приветствие: фото + дружелюбный текст + кнопка, открывающая Mini App
async function welcome(m) {
  const url = APP_URL(), name = (m.from?.first_name || "друг").slice(0, 40), bonus = REF_BONUS();
  const caption =
    `Привет, ${name}! 👋\n\n` +
    `Добро пожаловать в PlayVault — здесь игры становятся ближе 🎮\n\n` +
    `🔑 Гарантированный доступ через Steam Guard\n` +
    `📦 Топ-игры и готовые наборы по честным ценам\n` +
    `🎧 Играй офлайн, когда и где удобно\n\n` +
    `Нажми кнопку ниже, выбери набор — и доступ у тебя уже через минуту ✨` +
    (bonus > 0 ? `\n\n🎁 Зови друзей: за каждого, кто купит доступ, ты получишь ${bonus} ₽ на баланс.` : "");
  const reply_markup = { inline_keyboard: [[{ text: "🎮 Выбрать набор", web_app: { url } }]] };
  const r = await tg("sendPhoto", { chat_id: m.chat.id, photo: `${url}/welcome.jpg`, caption, reply_markup });
  if (!r.ok) await tg("sendMessage", { chat_id: m.chat.id, text: caption, reply_markup });
}

// Вебхук Telegram: /start, подтверждение оплаты Stars, пополнение баланса, выдача слота
export default async function handler(req, res) {
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.WEBHOOK_SECRET) return res.status(401).end();
  const u = req.body || {};

  // Пользователь заблокировал бота или вернулся: рассылка пропускает заблокировавших
  const cm = u.my_chat_member;
  if (cm && cm.chat?.type === "private") {
    await sql`update users set blocked = ${cm.new_chat_member?.status === "kicked"} where id = ${cm.chat.id}`;
    return res.json({ ok: true });
  }

  // /start (и /start ref_123 по реферальной ссылке)
  const m = u.message;
  const st = m && m.chat?.type === "private" && /^\/start(@\w+)?(\s+(\S+))?\s*$/.exec(m.text || "");
  if (st) {
    await sql`insert into users(id, username, first_name, last_seen) values (${m.from.id}, ${m.from.username || null}, ${m.from.first_name || null}, now())
              on conflict (id) do update set username = excluded.username,
                first_name = coalesce(excluded.first_name, users.first_name), blocked = false, last_seen = now()`;
    await bindRef(m.from.id, st[3]);
    await welcome(m);
    return res.json({ ok: true });
  }

  if (u.pre_checkout_query) {
    const q = u.pre_checkout_query, pl = String(q.invoice_payload || "");
    const [row] = pl.startsWith("topup:")
      ? await sql`select id from topups where id = ${Number(pl.slice(6)) || 0} and user_id = ${q.from.id}
                  and status = 'pending' and stars = ${q.total_amount}`
      : await sql`select id from orders where id = ${Number(pl) || 0} and user_id = ${q.from.id}
                  and status = 'pending' and stars = ${q.total_amount}`;
    await tg("answerPreCheckoutQuery", { pre_checkout_query_id: q.id, ok: !!row, ...(row ? {} : { error_message: "Заказ не найден" }) });
    return res.json({ ok: true });
  }

  const pay = m?.successful_payment;
  if (pay) {
    const uid = m.from.id;
    // Пополнение баланса: статус и зачисление одной транзакцией, повторный вебхук ничего не добавит
    if (String(pay.invoice_payload).startsWith("topup:")) {
      const tid = Number(pay.invoice_payload.split(":")[1]);
      const done = await sql.begin(async (tx) => {
        const [t] = await tx`update topups set status = 'paid', tg_charge_id = ${pay.telegram_payment_charge_id}
                             where id = ${tid} and user_id = ${uid} and status = 'pending' returning rub`;
        if (!t) return null;
        const [b] = await tx`update users set balance = balance + ${t.rub} where id = ${uid} returning balance`;
        return { rub: t.rub, balance: b.balance };
      });
      if (done) await tg("sendMessage", { chat_id: uid, text: `✅ Баланс пополнен на ${done.rub} ₽. Сейчас на балансе: ${done.balance} ₽.` });
      return res.json({ ok: true });
    }
    const id = Number(pay.invoice_payload);
    // Идемпотентность: повторный вебхук не выдаст второй слот (обновится только pending-заказ)
    const [o] = await sql`update orders set status = 'paid', tg_charge_id = ${pay.telegram_payment_charge_id}
                          where id = ${id} and user_id = ${uid} and status = 'pending' and stars = ${pay.total_amount}
                          returning pack_id, promo`;
    if (o) {
      // Админ/владелец: слот не занимается (used не меняется), берём любой аккаунт набора
      const staff = await isStaff(uid);
      const [a] = staff
        ? await sql`select id from accounts where pack_id = ${o.pack_id} order by (used < max_slots) desc, id limit 1`
        : await sql`update accounts set used = used + 1 where id = (
                              select id from accounts where pack_id = ${o.pack_id} and used < max_slots
                              order by used desc limit 1 for update skip locked) returning id`;
      if (a) {
        await sql`update orders set account_id = ${a.id} where id = ${id}`;
        await tg("sendMessage", { chat_id: uid, text: "Оплата прошла. Данные для входа: раздел «Мои доступы» в приложении." });
        await consumePromo(uid, o.promo).catch(() => {}); // промокод засчитывается после оплаты
        if (!staff) await rewardRef(uid); // бонус пригласившему и уведомление ему в бота
      } else {
        // Слоты разобрали, пока шла оплата: возвращаем Stars автоматически
        await sql`update orders set status = 'refunded' where id = ${id}`;
        await tg("refundStarPayment", { user_id: uid, telegram_payment_charge_id: pay.telegram_payment_charge_id });
        await tg("sendMessage", { chat_id: uid, text: "Свободных слотов не осталось, Stars возвращены." });
      }
    }
  }
  res.json({ ok: true });
}
