import { sql, dec, tgUser, tg } from "../lib/core.js";

export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });

  // Мои доступы: отдаём зашифрованные логины и пароли по оплаченным заказам
  if (req.method === "GET") {
    const rows = await sql`
      select o.id, o.pack_id, o.price_rub, o.created_at, p.name, a.login_enc, a.pass_enc
      from orders o join packs p on p.id = o.pack_id join accounts a on a.id = o.account_id
      where o.user_id = ${u.id} and o.status = 'paid' order by o.id desc`;
    return res.json(rows.map(({ login_enc, pass_enc, ...r }) => ({ ...r, login: dec(login_enc), pass: dec(pass_enc) })));
  }

  // Покупка: приоритет балансу аккаунта, затем Telegram Stars
  if (req.method === "POST") {
    const packId = Number(req.body?.pack_id);
    const [p] = await sql`select id, name, price, disc from packs where id = ${packId} and active`;
    if (!p) return res.status(404).json({ error: "pack" });

    // Ищем или создаём свободный слот
    let [a] = await sql`select id from accounts where pack_id = ${p.id} and used < max_slots limit 1`;
    if (!a) {
      const testLogin = `demo_user_${Math.floor(1000 + Math.random() * 9000)}`;
      const testPass = `pass_${Math.random().toString(36).substring(2, 8)}`;
      const [newAcc] = await sql`
        insert into accounts (pack_id, login_enc, pass_enc, max_slots, used)
        values (${p.id}, ${testLogin}, ${testPass}, 9999, 0)
        returning id`;
      a = newAcc;
    }

    const rub = Math.max(1, Math.round(p.price * (1 - p.disc / 100)));

    // Фиксируем пользователя в таблице users
    await sql`insert into users(id, username) values (${u.id}, ${u.username || null}) on conflict (id) do nothing`;

    // 1. ПРОВЕРКА БАЛАНСА ПОЛЬЗОВАТЕЛЯ
    const [userData] = await sql`select balance from users where id = ${u.id}`;
    const userBalance = Number(userData?.balance || 0);

    // ВАРИАНТ А: Баланса хватает — списываем рубли и сразу выдаём товар
    if (userBalance >= rub) {
      const [bookedAcc] = await sql`update accounts set used = used + 1 where id = (
                                      select id from accounts where pack_id = ${p.id} and used < max_slots
                                      order by used desc limit 1 for update skip locked) returning id`;

      if (!bookedAcc) return res.status(409).json({ error: "no_slots" });

      // Списываем рубли с баланса
      await sql`update users set balance = balance - ${rub} where id = ${u.id}`;

      // Создаём сразу оплаченный заказ
      const [o] = await sql`insert into orders(user_id, pack_id, account_id, price_rub, stars, status) 
                            values (${u.id}, ${p.id}, ${bookedAcc.id}, ${rub}, 0, 'paid') returning id`;

      // Возвращаем успех с флагом оплаты с баланса (link = null не вызывает окна Stars)
      return res.json({ order: o.id, success: true, paid_via: "balance", link: null });
    }

    // ВАРИАНТ Б: Баланса не хватает — формируем чек Telegram Stars
    const stars = Math.ceil(rub * Number(process.env.STARS_PER_RUB || 1));
    const [o] = await sql`insert into orders(user_id, pack_id, price_rub, stars, status) 
                          values (${u.id}, ${p.id}, ${rub}, ${stars}, 'pending') returning id`;

    const r = await tg("createInvoiceLink", {
      title: p.name,
      description: "Оффлайн-доступ к набору игр",
      payload: String(o.id),
      currency: "XTR",
      prices: [{ label: p.name, amount: stars }],
    });

    if (!r.ok || !r.result) {
      return res.status(500).json({ error: "invoice_failed", details: r });
    }

    return res.json({ order: o.id, link: r.result });
  }

  res.status(405).end();
}
