import { sql, dec, tgUser } from "../lib/core.js";

export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });

  // Мои доступы: логин и пароль отдаём по оплаченным заказам
  if (req.method === "GET") {
    const rows = await sql`
      select o.id, o.pack_id, o.price_rub, o.created_at, p.name, a.login_enc, a.pass_enc
      from orders o join packs p on p.id = o.pack_id join accounts a on a.id = o.account_id
      where o.user_id = ${u.id} and o.status = 'paid' order by o.id desc`;
    return res.json(rows.map(({ login_enc, pass_enc, ...r }) => ({ ...r, login: dec(login_enc), pass: dec(pass_enc) })));
  }

  // Покупка (БЕСКОНЕЧНАЯ ЭМУЛЯЦИЯ ДЛЯ ТЕСТИРОВАНИЯ)
  if (req.method === "POST") {
    const packId = Number(req.body?.pack_id);
    const [p] = await sql`select id, name, price, disc from packs where id = ${packId} and active`;
    if (!p) return res.status(404).json({ error: "pack" });

    // 1. Пытаемся найти существующий аккаунт со свободным слотом
    let [a] = await sql`update accounts set used = used + 1 where id = (
                          select id from accounts where pack_id = ${p.id} and used < max_slots
                          order by used desc limit 1 for update skip locked) returning id`;

    // 2. Если свободных слотов в БД нет — создаём тестовый аккаунт на ходу
    if (!a) {
      const testLogin = `demo_user_${Math.floor(1000 + Math.random() * 9000)}`;
      const testPass = `pass_${Math.random().toString(36).substring(2, 8)}`;

      const [newAcc] = await sql`
        insert into accounts (pack_id, login_enc, pass_enc, max_slots, used)
        values (${p.id}, ${testLogin}, ${testPass}, 9999, 1)
        returning id`;
      a = newAcc;
    }

    const rub = Math.max(1, Math.round(p.price * (1 - p.disc / 100)));

    // Фиксируем пользователя в таблице users
    await sql`insert into users(id, username) values (${u.id}, ${u.username || null}) on conflict (id) do nothing`;

    // Создаем сразу оплаченный заказ
    const [o] = await sql`insert into orders(user_id, pack_id, account_id, price_rub, stars, status) 
                          values (${u.id}, ${p.id}, ${a.id}, ${rub}, 0, 'paid') returning id`;

    // Возвращаем пустую строку в link, чтобы Mini App не выдавал ошибку вызова Telegram API
    return res.json({ order: o.id, success: true, link: "" });
  }

  res.status(405).end();
}
