import { sql, tgUser, getRole } from "../lib/core.js";

// Вход через Telegram: проверяем подпись, запоминаем пользователя, отдаём роль
export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });
  await sql`insert into users(id, username) values (${u.id}, ${u.username || null})
            on conflict (id) do update set username = excluded.username`;
  res.json({ id: u.id, username: u.username || null, role: await getRole(u) });
}
