import { sql, dec, tgUser } from "../lib/core.js";

export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });

  // Мои доступы: выдаем купленные логины и пароли
  if (req.method === "GET") {
    const rows = await sql`
      select o.id, o.pack_id, o.price_rub, o.created_at, p.name, a.login_enc, a.pass_enc
      from orders o join packs p on p.id = o.pack_id join accounts a on a.id = o.account_id
      where o.user_id = ${u.id} and o.status = 'paid' order by o.id desc`;
    return res.json(rows.map(({ login_enc, pass_enc, ...r }) => ({ ...r, login: dec(login_enc), pass: dec(pass_enc) })));
  }

  // Покупка (ЭМУЛЯЦИЯ / ТЕСТОВЫЙ РЕЖИМ): моментальная выдача слота без оплаты
  if (req.method === "POST") {
    const [p] = await sql`select id, name, price, disc from packs where id = ${Number(req.body?.pack_id)} and active`;
    if (!p) return res.status(404).json({ error: "pack" });
    
    // Ищем доступный аккаунт со свободным слотом
    const [a] = await sql`update accounts set used = used + 1 where id = (
                            select id from accounts where pack_id = ${p.id} and used < max_slots
                            order by used desc limit 1 for update skip locked) returning id`;
    
    if (!a) return res.status(409).json({ error: "no_slots" });

    const rub = Math.max(1, Math.round(p.price * (1 - p.disc / 100)));
    
    // Записываем пользователя в БД
    await sql`insert into users(id, username) values (${u.id}, ${u.username || null}) on conflict (id) do nothing`;
    
    // Создаём сразу статусом 'paid'
    const [o] = await sql`insert into orders(user_id, pack_id, account_id, price_rub, stars, status) 
                          values (${u.id}, ${p.id}, ${a.id}, ${rub}, 0, 'paid') returning id`;

    // Возвращаем фейковую ссылку/успех, чтобы Mini App обновился
    return res.json({ order: o.id, success: true, link: null });
  }

  res.status(405).end();
}
