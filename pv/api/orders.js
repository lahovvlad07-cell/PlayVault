import { sql, dec, tgUser, tg, saveUser, rewardRef, promoLookup, consumePromo, isStaff } from "../lib/core.js";

export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });

  // Мои доступы: логин и пароль отдаём только по оплаченным заказам этого пользователя
  if (req.method === "GET") {
    const rows = await sql`
      select o.id, o.pack_id, o.price_rub, o.created_at, p.name,
             a.login_enc, a.pass_enc,
             a.extra_service, a.extra_login_enc, a.extra_pass_enc
      from orders o join packs p on p.id = o.pack_id join accounts a on a.id = o.account_id
      where o.user_id = ${u.id} and o.status = 'paid' order by o.id desc`;
    return res.json(rows.map(({ login_enc, pass_enc, extra_login_enc, extra_pass_enc, ...r }) => ({
      ...r,
      login: dec(login_enc),
      pass:  dec(pass_enc),
      extra_login: extra_login_enc ? dec(extra_login_enc) : null,
      extra_pass:  extra_pass_enc  ? dec(extra_pass_enc)  : null,
    })));
  }

  // Покупка: цена считается на сервере, клиенту не доверяем
  if (req.method === "POST") {
    const [p] = await sql`select id, name, price, disc from packs where id = ${Number(req.body?.pack_id)} and active`;
    if (!p) return res.status(404).json({ error: "pack" });
    const staff = await isStaff(u.id);
    // Админ/владелец: слот не занимается, поэтому достаточно любого аккаунта набора
    const free = staff
      ? await sql`select 1 from accounts where pack_id = ${p.id} limit 1`
      : await sql`select 1 from accounts where pack_id = ${p.id} and used < max_slots limit 1`;
    if (!free.length) return res.status(409).json({ error: "no_slots" });
    const base = Math.max(1, Math.round(p.price * (1 - p.disc / 100)));
    // Промокод на скидку: цену считает сервер
    let promo = null;
    if (req.body?.promo) {
      const pr = await promoLookup(req.body.promo, u.id);
      if (pr.error) return res.status(400).json({ error: "promo_" + pr.error });
      if (pr.kind !== "disc" && pr.kind !== "pack") return res.status(400).json({ error: "promo_not_discount" });
      if (pr.kind === "pack") {
        // pack-промо действует только на конкретный набор
        if (pr.pack_id !== p.id) return res.status(400).json({ error: "promo_wrong_pack" });
      }
      promo = pr;
    }
    // Скидки суммируются с cap 100%: totalDisc = min(100, packDisc + promoDisc)
    const packDisc = p.disc || 0;
    const promoDisc = promo ? promo.value : 0;
    const totalDisc = Math.min(100, packDisc + promoDisc);
    const rub = promo
      ? Math.max(1, Math.round(p.price * (1 - totalDisc / 100)))
      : base;
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
          // Для персонала счётчик used не меняем: свободные слоты клиентов не уменьшаются
          const [a] = staff
            ? await tx`select id from accounts where pack_id = ${p.id} order by (used < max_slots) desc, id limit 1`
            : await tx`update accounts set used = used + 1 where id = (
                                 select id from accounts where pack_id = ${p.id} and used < max_slots
                                 order by used desc limit 1 for update skip locked) returning id`;
          if (!a) throw new Error("no_slots");
          if (promo && !(await consumePromo(u.id, promo.code, tx))) throw new Error("promo_used");
          const [o] = await tx`insert into orders(user_id, pack_id, account_id, price_rub, stars, status, method, promo, promo_pct)
                               values (${u.id}, ${p.id}, ${a.id}, ${rub}, 0, 'paid', 'balance', ${promo ? promo.code : null}, ${promo ? promo.value : 0}) returning id`;
          return { order: o.id, balance: b.balance };
        });
        if (!done) return res.status(402).json({ error: "no_funds" });
        // Бонус рефереру только если у покупателя были реальные деньги (оплаченное пополнение): так баланс не накрутить
        const [real] = await sql`select 1 as x from topups where user_id = ${u.id} and status = 'paid' limit 1`;
        if (real && !staff) await rewardRef(u.id);
        await tg("sendMessage", { chat_id: u.id, text: "Оплата прошла. Данные для входа: раздел «Мои доступы» в приложении." }).catch(() => {});
        return res.json(done);
      } catch (e) {
        if (e.message === "no_slots") return res.status(409).json({ error: "no_slots" });
        if (e.message === "promo_used") return res.status(400).json({ error: "promo_used" });
        throw e;
      }
    }
    const [o] = await sql`insert into orders(user_id, pack_id, price_rub, stars, promo, promo_pct)
                          values (${u.id}, ${p.id}, ${rub}, ${stars}, ${promo ? promo.code : null}, ${promo ? promo.value : 0}) returning id`;
    const r = await tg("createInvoiceLink", {
      title: p.name, description: "Оффлайн-доступ к набору игр, навсегда",
      payload: String(o.id), currency: "XTR", prices: [{ label: p.name, amount: stars }],
    });
    return res.json({ order: o.id, link: r.result });
  }
  res.status(405).end();
}
