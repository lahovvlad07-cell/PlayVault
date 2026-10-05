import { sql, tgUser } from "../lib/core.js";

export default async function handler(req, res) {
  const u = tgUser(req);

  if (!u) return res.status(401).json({ error: "auth" });
  if (req.method !== "POST") return res.status(405).end();

  const amount = Math.floor(Number(req.body?.amount_rub));

  if (!Number.isSafeInteger(amount) || amount < 10 || amount > 100000) {
    return res.status(400).json({ error: "bad_amount" });
  }

  await sql`
    insert into users(id, username)
    values (${u.id}, ${u.username || null})
    on conflict (id)
    do update set username = excluded.username
  `;

  // ТЕСТОВОЕ ПОПОЛНЕНИЕ:
  // Telegram Stars и Invoice здесь вообще не используются.
  // Средства сразу зачисляются на серверный баланс.
  // Запись создаётся только в истории balance_transactions, НЕ в orders.

  const testChargeId =
    `test_topup:${u.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  const result = await sql.begin(async tx => {
    const [transaction] = await tx`
      insert into balance_transactions(
        user_id,
        type,
        amount_rub,
        tg_charge_id
      )
      values (
        ${u.id},
        'topup',
        ${amount},
        ${testChargeId}
      )
      returning id, amount_rub
    `;

    const [user] = await tx`
      update users
      set balance_rub = balance_rub + ${amount}
      where id = ${u.id}
      returning balance_rub
    `;

    return {
      transaction_id: transaction.id,
      amount: Number(transaction.amount_rub),
      balance: Number(user.balance_rub)
    };
  });

  return res.json({
    ok: true,
    test: true,
    amount_rub: result.amount,
    balance: result.balance
  });
}
