import { sql, tgUser, getRole, saveUser, tg, notifyAdmins, APP_URL } from "../core.js";

const clip = (s, n) => String(s || "").trim().slice(0, n);

async function withMsgs(rows) {
  if (!rows.length) return [];
  const ids = rows.map((t) => t.id);
  const ms = await sql`select ticket_id, from_admin, body, photo, created_at from ticket_messages
                       where ticket_id = any(${ids}) order by id`;
  const by = {};
  ms.forEach((m) => (by[m.ticket_id] = by[m.ticket_id] || []).push(m));
  return rows.map((t) => ({ ...t, user_id: String(t.user_id), msgs: by[t.id] || [] }));
}

// Тикеты поддержки. Пользователь видит только свои, администратор — все (?all=1).
export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });
  const role = await getRole(u);

  if (req.method === "GET") {
    if (req.query?.all) {
      if (!role) return res.status(403).json({ error: "forbidden" });
      const rows = await sql`select t.id, t.user_id, t.subject, t.status, t.unread_user, t.unread_admin, t.created_at, t.updated_at,
                                    us.username, us.first_name
                             from tickets t join users us on us.id = t.user_id
                             order by t.updated_at desc limit 100`;
      return res.json(await withMsgs(rows));
    }
    const rows = await sql`select id, user_id, subject, status, unread_user, unread_admin, created_at, updated_at
                           from tickets where user_id = ${u.id} order by updated_at desc limit 50`;
    return res.json(await withMsgs(rows));
  }

  if (req.method !== "POST") return res.status(405).end();
  const b = req.body || {};

  if (b.action === "create") {
    await saveUser(u);
    const subject = clip(b.subject, 100), body = clip(b.body, 2000);
    if (!subject || !body) return res.status(400).json({ error: "bad_request" });
    const [n] = await sql`select count(*)::int as c from tickets where user_id = ${u.id} and created_at > now() - interval '1 day'`;
    if (n.c >= 5) return res.status(429).json({ error: "limit" });
    const id = await sql.begin(async (tx) => {
      const [t] = await tx`insert into tickets(user_id, subject) values (${u.id}, ${subject}) returning id`;
      await tx`insert into ticket_messages(ticket_id, from_admin, author_id, body) values (${t.id}, false, ${u.id}, ${body})`;
      return t.id;
    });
    // Уведомления админам в бота отключены: новые тикеты видны в админ-панели (счётчик непрочитанных).
    return res.json({ ok: true, id });
  }

  const id = +b.id;
  if (!id) return res.status(400).json({ error: "bad_request" });
  const [t] = await sql`select id, user_id, status, subject from tickets where id = ${id}`;
  if (!t) return res.status(404).json({ error: "not_found" });
  const mine = String(t.user_id) === String(u.id);
  const adm = !!role && b.admin === true;
  if (!mine && !adm) return res.status(403).json({ error: "forbidden" });

  if (b.action === "reply") {
    const body = clip(b.body, 2000);
    const photo = typeof b.photo === "string" && b.photo.startsWith("https://") ? b.photo.slice(0, 500) : null;
    if (!body && !photo) return res.status(400).json({ error: "bad_request" });
    if (t.status === "closed" && !adm) return res.status(409).json({ error: "closed" });
    await sql.begin(async (tx) => {
      await tx`insert into ticket_messages(ticket_id, from_admin, author_id, body, photo) values (${id}, ${adm}, ${u.id}, ${body || ""}, ${photo})`;
      if (adm) await tx`update tickets set updated_at = now(), unread_user = true, unread_admin = false where id = ${id}`;
      else await tx`update tickets set updated_at = now(), unread_admin = true, unread_user = false where id = ${id}`;
    });
    if (adm) {
      await tg("sendMessage", { chat_id: t.user_id, text: `💬 Ответ поддержки по обращению «${t.subject}»:\n\n${body.slice(0, 600)}`,
        reply_markup: { inline_keyboard: [[{ text: "Открыть", web_app: { url: APP_URL() } }]] } }).catch(() => {});
    }
    return res.json({ ok: true });
  }
  if (b.action === "read") {
    if (adm && !mine) await sql`update tickets set unread_admin = false where id = ${id}`;
    else await sql`update tickets set unread_user = false where id = ${id}`;
    return res.json({ ok: true });
  }
  if (b.action === "close" || b.action === "reopen") {
    await sql`update tickets set status = ${b.action === "close" ? "closed" : "open"}, updated_at = now() where id = ${id}`;
    return res.json({ ok: true });
  }
  res.status(400).json({ error: "bad_request" });
}
