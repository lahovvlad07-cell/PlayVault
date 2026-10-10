import { sql, tg, APP_URL } from "../../lib/core.js";

// Авторассылка. Запускается ВНЕШНИМ сервисом cron-job.org (НЕ Vercel cron).
// Причина: Vercel Hobby позволяет только 1 крон в сутки; cron-job.org бесплатен и гибок.
//
// Настройка cron-job.org:
//   URL:    https://<ваш-домен>.vercel.app/api/cron/broadcast
//   Метод:  GET
//   Интервал: каждые 60 минут (или чаще — каждые 30/15 мин, не страшно)
//   Заголовок: Authorization: Bearer <значение CRON_SECRET из .env>
//
// Логика: проверяет scheduled_broadcasts, у которых next_send_at <= now(),
// отправляет пост всем незаблокированным пользователям и пересчитывает next_send_at.

const BATCH = 15;

async function sendToAll(text, photo, button) {
  const reply_markup = button
    ? { inline_keyboard: [[{ text: "🎮 Открыть магазин", web_app: { url: APP_URL() } }]] }
    : undefined;
  const send = (id) => photo
    ? tg("sendPhoto", { chat_id: id, photo, caption: text, reply_markup })
    : tg("sendMessage", { chat_id: id, text, reply_markup, disable_web_page_preview: true });

  let sent = 0, failed = 0, blocked = 0, after = 0;
  for (;;) {
    const rows = await sql`select id from users where id > ${after} and not blocked order by id limit ${BATCH}`;
    if (!rows.length) break;
    const out = await Promise.all(
      rows.map(async (r) => [r.id, await send(r.id).catch((e) => ({ ok: false, error_code: 0, description: String(e.message) }))])
    );
    for (const [id, r] of out) {
      if (r.ok) { sent++; continue; }
      failed++;
      if (r.error_code === 403) { blocked++; await sql`update users set blocked = true where id = ${id}`; }
    }
    after = Number(rows[rows.length - 1].id);
    if (rows.length < BATCH) break;
    await new Promise((r) => setTimeout(r, 1100));
  }
  return { sent, failed, blocked };
}

function calcNextSendAt(row) {
  if (row.mode === "random") {
    const minMs = row.min_h * 3600000, maxMs = row.max_h * 3600000;
    const delayMs = minMs + Math.floor(Math.random() * (maxMs - minMs + 3600000));
    return new Date(Date.now() + delayMs);
  }
  // Fixed: следующее наступление send_at_hour:send_at_min через кратное interval_h
  const base = row.last_sent_at ? new Date(row.last_sent_at) : new Date();
  const next = new Date(base.getTime() + row.interval_h * 3600000);
  if (row.send_at_hour !== null) {
    const candidate = new Date(next);
    candidate.setUTCHours(row.send_at_hour, row.send_at_min, 0, 0);
    if (candidate < next) candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate;
  }
  return next;
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();

  // Проставляем next_send_at для новых постов (только что созданных, без расписания)
  const fresh = await sql`select * from scheduled_broadcasts where active = true and next_send_at is null`;
  for (const row of fresh) {
    await sql`update scheduled_broadcasts set next_send_at = ${calcNextSendAt(row)} where id = ${row.id}`;
  }

  // Отправляем посты, у которых пришло время
  const due = await sql`
    select * from scheduled_broadcasts
    where active = true
      and next_send_at is not null
      and next_send_at <= now()
    order by next_send_at
    limit 10
  `;

  const results = [];
  for (const row of due) {
    try {
      const stats = await sendToAll(row.text, row.photo, row.button);
      const next = calcNextSendAt(row);
      await sql`
        update scheduled_broadcasts
        set last_sent_at = now(),
            sent_count   = sent_count + 1,
            next_send_at = ${next}
        where id = ${row.id}
      `;
      results.push({ id: row.id, ...stats, next_send_at: next });
    } catch (e) {
      results.push({ id: row.id, error: e.message });
    }
  }

  res.json({ ok: true, initialized: fresh.length, processed: due.length, results });
}
