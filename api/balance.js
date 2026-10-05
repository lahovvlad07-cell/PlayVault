import { sql, tg, tgUser } from "../lib/core.js";

export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });
  if (req.method !== "POST") return res.status(405).end();

  const amount = Math.floor(Number(req.body?.amount_rub));
  if (!Number.isSafeInteger(amount) || amount < 10 || amount > 100000) {
    return res.status(400).json({ error: "bad_amount" });
  }

  const stars = Math.ceil(amount * Number(process.env.STARS_PER_RUB || 1));

  await sql`
    insert into users(id, username)
    values (${u.id}, ${u.username || null})
    on conflict (id) do update set username = excluded.username
  `;

  // Пополнение баланса — отдельный платеж, не заказ и не покупка товара.
  // Все необходимые данные находятся в payload; после successful_payment
  // деньги сразу зачисляются на users.balance_rub.
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
