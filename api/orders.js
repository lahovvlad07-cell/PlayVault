import { sql, dec, tgUser, tg } from "../lib/core.js";

export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });

  // Мои доступы: логин и пароль отдаём только по оплаченным заказам этого пользователя
  if (req.method === "GET") {
    const rows = await sql`
      select o.id, o.pack_id, o.price_rub, o.created_at, p.name, a.login_enc, a.pass_enc
      from orders o join packs p on p.id = o.pack_id join accounts a on a.id = o.account_id
      where o.user_id = ${u.id} and o.status = 'paid' order by o.id desc`;
    return res.json(rows.map(({ login_enc, pass_enc, ...r }) => ({ ...r, login: dec(login_enc), pass: dec(pass_enc) })));
  }

  // Покупка: цена считается на сервере, клиенту не доверяем
  if (req.method === "POST") {
    const [p] = await sql`select id, name, price, disc from packs where id = ${Number(req.body?.pack_id)} and active`;
    if (!p) return res.status(404).json({ error: "pack" });
    const free = await sql`select 1 from accounts where pack_id = ${p.id} and used < max_slots limit 1`;
    if (!free.length) return res.status(409).json({ error: "no_slots" });
    const rub = Math.max(1, Math.round(p.price * (1 - p.disc / 100)));
    const stars = Math.ceil(rub * Number(process.env.STARS_PER_RUB || 1));
    await sql`insert into users(id, username) values (${u.id}, ${u.username || null}) on conflict (id) do nothing`;
    const [o] = await sql`insert into orders(user_id, pack_id, price_rub, stars) values (${u.id}, ${p.id}, ${rub}, ${stars}) returning id`;
    const r = await tg("createInvoiceLink", {
      title: p.name, description: "Оффлайн-доступ к набору игр, навсегда",
      payload: String(o.id), currency: "XTR", prices: [{ label: p.name, amount: stars }],
    });
    return res.json({ order: o.id, link: r.result });
  }
  res.status(405).end();
}
