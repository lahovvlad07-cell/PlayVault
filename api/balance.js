import { sql, tg, tgUser } from "../lib/core.js";

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
    on conflict (id) do update set username = excluded.username
  `;

  /*
   * TEST MODE:
   * When TEST_BALANCE_MODE=true, no Telegram invoice is created.
   * The requested amount is immediately credited to the server balance.
   * This is intentionally disabled by default and should only be used for testing.
   */
  if (String(process.env.TEST_BALANCE_MODE).toLowerCase() === "true") {
    const testChargeId = `test_topup:${u.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const result = await sql.begin(async tx => {
      const [t] = await tx`
        insert into balance_transactions(
          user_id, type, amount_rub, tg_charge_id
        )
        values (${u.id}, 'topup', ${amount}, ${testChargeId})
        returning id
      `;

      const [a] = await tx`
        update users
        set balance_rub = balance_rub + ${amount}
        where id = ${u.id}
        returning balance_rub
      `;

      return { balance: Number(a.balance_rub), transaction_id: t.id };
    });

    return res.json({
      test: true,
      amount_rub: amount,
      balance: result.balance
    });
  }

  const stars = Math.ceil(amount * Number(process.env.STARS_PER_RUB || 1));
  const payload = `balance:${u.id}:${amount}:${stars}:${Date.now()}`;

  const r = await tg("createInvoiceLink", {
    title: "Пополнение баланса",
    description: `Зачисление ${amount} ₽ на баланс PlayVault`,
    payload,
    currency: "XTR",
    prices: [{ label: `Баланс ${amount} ₽`, amount: stars }],
  });

  if (!r?.ok || !r?.result) return res.status(502).json({ error: "invoice" });

  return res.json({ link: r.result, amount_rub: amount, stars });
}
