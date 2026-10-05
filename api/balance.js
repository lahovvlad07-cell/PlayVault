import { sql, tgUser } from "../lib/core.js";

export default async function handler(req, res) {
  try {
    const u = tgUser(req);

    if (!u) {
      return res.status(401).json({ error: "auth" });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "method" });
    }

    const amount = Math.floor(Number(req.body?.amount_rub));

    if (!Number.isSafeInteger(amount) || amount < 10 || amount > 100000) {
      return res.status(400).json({ error: "bad_amount" });
    }

    // Создаём пользователя, если его ещё нет.
    await sql`
      insert into users(id, username, balance_rub)
      values (${u.id}, ${u.username || null}, 0)
      on conflict (id)
      do update set username = excluded.username
    `;

    /*
     * ТЕСТОВОЕ ПОПОЛНЕНИЕ.
     *
     * Никаких Telegram Stars.
     * Никаких invoice.
     * Никаких orders.
     * Никаких дополнительных таблиц/миграций.
     *
     * Баланс изменяется напрямую атомарным UPDATE.
     */

    const rows = await sql`
      update users
      set balance_rub = balance_rub + ${amount}
      where id = ${u.id}
      returning balance_rub
    `;

    if (!rows.length) {
      return res.status(500).json({ error: "balance_update" });
    }

    const balance = Number(rows[0].balance_rub);

    return res.status(200).json({
      ok: true,
      test: true,
      amount_rub: amount,
      balance
    });

  } catch (err) {
    console.error("balance topup error:", err);
    return res.status(500).json({
      error: "server",
      message: process.env.NODE_ENV === "development"
        ? String(err?.message || err)
        : undefined
    });
  }
}
