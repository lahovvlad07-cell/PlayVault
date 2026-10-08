import { sql, tgUser, getRole, saveUser, bindRef, startParam, botName, getRefBonus } from "../lib/core.js";

// Вход через Telegram: проверяем подпись, запоминаем пользователя, отдаём роль, баланс и данные для реф-ссылки
export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });
  await saveUser(u);
  await bindRef(u.id, startParam(req));
  const [me] = await sql`select balance from users where id = ${u.id}`;
  const [st] = await sql`select count(*)::int as friends, (count(*) filter (where ref_rewarded))::int as bought
                         from users where referred_by = ${u.id}`;
  res.json({
    id: u.id, username: u.username || null, role: await getRole(u),
    balance: me ? me.balance : 0, bot: await botName(), ref_bonus: await getRefBonus(),
    friends: st.friends, bought: st.bought,
  });
}
