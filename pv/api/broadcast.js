import { sql, tgUser, getRole, tg, APP_URL } from "../lib/core.js";

const BATCH = 15;

const send = (id, text, photo, button) => {
  const reply_markup = button ? { inline_keyboard: [[{ text: "🎮 Открыть магазин", web_app: { url: APP_URL() } }]] } : undefined;
  return photo
    ? tg("sendPhoto", { chat_id: id, photo, caption: text, reply_markup })
    : tg("sendMessage", { chat_id: id, text, reply_markup, disable_web_page_preview: true });
};

export default async function handler(req, res) {
  const u = tgUser(req);
  if (!await getRole(u)) return res.status(403).json({ error: "forbidden" });

  if (req.method === "GET") {
    const [c] = await sql`select count(*)::int as total, (count(*) filter (where not blocked))::int as active from users`;
    return res.json(c);
  }
  if (req.method !== "POST") return res.status(405).end();

  const { action, text, photo, button, after } = req.body || {};

  // ── Ручная рассылка ───────────────────────────────────────
  if (action === "test") {
    const msg = String(text || "").trim(), ph = String(photo || "").trim();
    if (!msg) return res.status(400).json({ error: "empty" });
    const r = await send(u.id, msg, ph || null, !!button);
    return res.json({ ok: !!r.ok, error: r.ok ? null : r.description });
  }

  if (action === "batch") {
    const msg = String(text || "").trim(), ph = String(photo || "").trim();
    if (!msg) return res.status(400).json({ error: "empty" });
    const from = Number(after) || 0;
    const rows = await sql`select id from users where id > ${from} and not blocked order by id limit ${BATCH}`;
    const out = await Promise.all(rows.map(async (r) => [r.id, await send(r.id, msg, ph || null, !!button).catch((e) => ({ ok: false, error_code: 0, description: String(e.message) }))]));
    let sent = 0, failed = 0, blocked = 0, err = null;
    for (const [id, r] of out) {
      if (r.ok) { sent++; continue; }
      failed++; err = err || r.description || null;
      if (r.error_code === 403) { blocked++; await sql`update users set blocked = true where id = ${id}`; }
    }
    return res.json({ sent, failed, blocked, err, last: rows.length ? Number(rows[rows.length - 1].id) : from, done: rows.length < BATCH });
  }

  // ── Авторассылка: CRUD ────────────────────────────────────
  if (action === "schedule_list") {
    const rows = await sql`select * from scheduled_broadcasts order by created_at desc`;
    return res.json(rows);
  }

  if (action === "schedule_save") {
    const { id, text: t, photo: ph, button: btn, mode, interval_h, send_at_hour, send_at_min, min_h, max_h } = req.body || {};
    const msg = String(t || "").trim();
    if (!msg) return res.status(400).json({ error: "empty" });
    const m = (mode === "random") ? "random" : "fixed";
    const ih = Math.max(1, Math.min(8760, Number(interval_h) || 24));
    const hh = Math.max(0, Math.min(23, Number(send_at_hour) || 10));
    const mm = Math.max(0, Math.min(59, Number(send_at_min) || 0));
    const minh = Math.max(1, Math.min(8760, Number(min_h) || 24));
    const maxh = Math.max(minh, Math.min(8760, Number(max_h) || 48));
    // Принимаем https:// URL или Telegram file_id (непустая строка без пробелов)
    const phTrim = String(ph || "").trim();
    const photoUrl = phTrim && !/\s/.test(phTrim) ? phTrim : null;

    if (id) {
      // Обновление существующего поста — сбрасываем next_send_at чтобы крон пересчитал
      await sql`update scheduled_broadcasts
        set text=${msg}, photo=${photoUrl}, button=${!!btn},
            mode=${m}, interval_h=${ih}, send_at_hour=${hh}, send_at_min=${mm},
            min_h=${minh}, max_h=${maxh}, next_send_at=null
        where id=${Number(id)}`;
    } else {
      await sql`insert into scheduled_broadcasts
        (text, photo, button, mode, interval_h, send_at_hour, send_at_min, min_h, max_h, created_by)
        values (${msg}, ${photoUrl}, ${!!btn}, ${m}, ${ih}, ${hh}, ${mm}, ${minh}, ${maxh}, ${u.id})`;
    }
    return res.json({ ok: true });
  }

  if (action === "schedule_delete") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "bad_request" });
    await sql`delete from scheduled_broadcasts where id = ${Number(id)}`;
    return res.json({ ok: true });
  }

  if (action === "schedule_toggle") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "bad_request" });
    const [r] = await sql`update scheduled_broadcasts set active = not active where id = ${Number(id)} returning active`;
    return res.json({ ok: true, active: r?.active });
  }

  if (action === "schedule_now") {
    // Отправить конкретный пост прямо сейчас (не трогает расписание)
    const { id } = req.body || {};
    const [row] = id
      ? await sql`select * from scheduled_broadcasts where id = ${Number(id)}`
      : [];
    if (!row) return res.status(404).json({ error: "not_found" });
    const from_id = 0;
    const rows2 = await sql`select id from users where id > ${from_id} and not blocked order by id limit ${BATCH}`;
    const out2 = await Promise.all(rows2.map(async (r) => [r.id, await send(r.id, row.text, row.photo, row.button).catch((e) => ({ ok: false, error_code: 0, description: String(e.message) }))]));
    let sent = 0, failed = 0;
    for (const [, r] of out2) { if (r.ok) sent++; else failed++; }
    return res.json({ ok: true, sent, failed, last: rows2.length ? Number(rows2[rows2.length - 1].id) : 0, done: rows2.length < BATCH });
  }

  res.status(400).json({ error: "bad_request" });
}
