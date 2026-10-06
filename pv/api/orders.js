import { sql, dec, tgUser, tg, saveUser, rewardRef } from "../lib/core.js";

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
    const [rateRow] = await sql`select value from settings where key = 'stars_rate'`;
    const rate = rateRow ? JSON.parse(rateRow.value) : Number(process.env.STARS_PER_RUB || 0.85);
    const stars = Math.ceil(rub * rate);
    await saveUser(u);

    // Оплата с баланса: списание, выдача слота и заказ — одной транзакцией (при ошибке всё откатывается)
    if (req.body?.method === "balance") {
      try {
        const done = await sql.begin(async (tx) => {
          const [b] = await tx`update users set balance = balance - ${rub} where id = ${u.id} and balance >= ${rub} returning balance`;
          if (!b) return null;
          const [a] = await tx`update accounts set used = used + 1 where id = (
                                 select id from accounts where pack_id = ${p.id} and used < max_slots
                                 order by used desc limit 1 for update skip locked) returning id`;
          if (!a) throw new Error("no_slots");
          const [o] = await tx`insert into orders(user_id, pack_id, account_id, price_rub, stars, status, method)
                               values (${u.id}, ${p.id}, ${a.id}, ${rub}, 0, 'paid', 'balance') returning id`;
          return { order: o.id, balance: b.balance };
        });
        if (!done) return res.status(402).json({ error: "no_funds" });
        // Бонус рефереру только если у покупателя были реальные деньги (оплаченное пополнение): так баланс не накрутить
        const [real] = await sql`select 1 as x from topups where user_id = ${u.id} and status = 'paid' limit 1`;
        if (real) await rewardRef(u.id);
        await tg("sendMessage", { chat_id: u.id, text: "Оплата прошла. Данные для входа: раздел «Мои доступы» в приложении." }).catch(() => {});
        return res.json(done);
      } catch (e) {
        if (e.message === "no_slots") return res.status(409).json({ error: "no_slots" });
        throw e;
      }
    }
    const [o] = await sql`insert into orders(user_id, pack_id, price_rub, stars) values (${u.id}, ${p.id}, ${rub}, ${stars}) returning id`;
    const r = await tg("createInvoiceLink", {
      title: p.name, description: "Оффлайн-доступ к набору игр, навсегда",
      payload: String(o.id), currency: "XTR", prices: [{ label: p.name, amount: stars }],
    });
    return res.json({ order: o.id, link: r.result });
  }
  res.status(405).end();
}
