import { sql, tgUser, getRole, tg, APP_URL } from "../lib/core.js";

const BATCH = 15; // за один вызов; клиент вызывает с паузой ~1 с, это заметно ниже лимита Telegram (30 сообщений/с)

// Рассылка. Только admin/owner (роль проверяется на сервере по подписи Telegram).
// GET  — сколько пользователей получит рассылку.
// POST action="test"  — отправить сообщение только себе.
// POST action="batch" — отправить следующую пачку пользователей с id > after; клиент крутит цикл и показывает прогресс.
export default async function handler(req, res) {
  const u = tgUser(req);
  if (!await getRole(u)) return res.status(403).json({ error: "forbidden" });

  if (req.method === "GET") {
    const [c] = await sql`select count(*)::int as total, (count(*) filter (where not blocked))::int as active from users`;
    return res.json(c);
  }
  if (req.method !== "POST") return res.status(405).end();

  const { action, text, photo, button, after } = req.body || {};
  const msg = String(text || "").trim(), ph = String(photo || "").trim();
  if (!msg) return res.status(400).json({ error: "empty" });
  if (ph && !/^https:\/\/\S+$/.test(ph)) return res.status(400).json({ error: "bad_photo" });
  if (msg.length > (ph ? 1024 : 4096)) return res.status(400).json({ error: "too_long" });

  const reply_markup = button ? { inline_keyboard: [[{ text: "🎮 Открыть магазин", web_app: { url: APP_URL() } }]] } : undefined;
  const send = (id) => ph
    ? tg("sendPhoto", { chat_id: id, photo: ph, caption: msg, reply_markup })
    : tg("sendMessage", { chat_id: id, text: msg, reply_markup, disable_web_page_preview: true });

  if (action === "test") {
    const r = await send(u.id);
    return res.json({ ok: !!r.ok, error: r.ok ? null : r.description });
  }

  if (action === "batch") {
    const from = Number(after) || 0;
    const rows = await sql`select id from users where id > ${from} and not blocked order by id limit ${BATCH}`;
    const out = await Promise.all(rows.map(async (r) => [r.id, await send(r.id).catch((e) => ({ ok: false, description: String(e.message) }))]));
    let sent = 0, failed = 0, blocked = 0, err = null;
    for (const [id, r] of out) {
      if (r.ok) { sent++; continue; }
      failed++; err = err || r.description || null;
      if (r.error_code === 403) { blocked++; await sql`update users set blocked = true where id = ${id}`; }
    }
    return res.json({ sent, failed, blocked, err, last: rows.length ? Number(rows[rows.length - 1].id) : from, done: rows.length < BATCH });
  }
  res.status(400).json({ error: "bad_request" });
}
