import { sql, tgUser, tg } from "../lib/core.js";

// Пополнение баланса через Telegram Stars
export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });

  if (req.method === "POST") {
    const rub = Math.round(+(req.body?.amount) || 0);
    if (rub < 10 || rub > 10000) return res.status(400).json({ error: "bad_amount" });
    // Курс берём из settings таблицы, клиентское значение используем как запасное
    const [rateRow] = await sql`select value from settings where key = 'stars_rate'`;
    const rate = rateRow ? JSON.parse(rateRow.value) : Number(process.env.STARS_PER_RUB || 0.85);
    const stars = Math.ceil(rub * rate);
    await sql`insert into users(id, username) values (${u.id}, ${u.username || null})
              on conflict (id) do nothing`;
    const [o] = await sql`insert into topups(user_id, rub, stars, status)
                          values (${u.id}, ${rub}, ${stars}, 'pending') returning id`;
    const r = await tg("createInvoiceLink", {
      title: "Пополнение баланса", description: `${rub} ₽ на баланс в PlayVault`,
      payload: "topup:" + o.id, currency: "XTR", prices: [{ label: "Пополнение", amount: stars }],
    });
    return res.json({ topup: o.id, link: r.result, stars, rub });
  }
  res.status(405).end();
}
