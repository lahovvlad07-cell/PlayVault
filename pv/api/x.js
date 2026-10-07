// Одна serverless-функция вместо пяти (лимит Vercel Hobby — 12 функций). Адреса /api/promo и т.д. ведут сюда через rewrites в vercel.json.
import promo from "../lib/h/promo.js";
import wants from "../lib/h/wants.js";
import tickets from "../lib/h/tickets.js";
import stats from "../lib/h/stats.js";
import prices from "../lib/h/steam-prices.js";

import { sql } from "../lib/core.js";

// Диагностика: открыть /api/x?r=ping в браузере. Показывает, какой запрос к базе тормозит. Данных не отдаёт, только время и счётчики.
async function ping(req, res) {
  const out = {};
  const run = async (name, q) => {
    const t0 = Date.now();
    try {
      const r = await Promise.race([q(), new Promise((_, rej) => setTimeout(() => rej(new Error("нет ответа за 5 с")), 5000))]);
      out[name] = { ms: Date.now() - t0, ...(r || {}) };
    } catch (e) { out[name] = { ms: Date.now() - t0, error: e.code || String(e.message || e).slice(0, 100) }; }
  };
  await run("select1", async () => { await sql`select 1`; });
  await run("connections", async () => { const [r] = await sql`select count(*)::int as total, (count(*) filter (where state = 'idle in transaction'))::int as idle_in_tx from pg_stat_activity`; return r; });
  for (const t of ["users", "promo_codes", "wants", "tickets", "ticket_messages", "promo_uses", "want_done"])
    await run(t, async () => { const [r] = await sql`select count(*)::int as rows from ${sql(t)}`; return r; });
  return res.status(200).json(out);
}

const H = { ping, promo, wants, tickets, stats, "steam-prices": prices };
export default async function handler(req, res) {
  const h = H[req.query?.r];
  if (!h) return res.status(404).json({ error: "not_found" });
  try {
    // если база не отвечает — не висим 300 секунд, отвечаем ошибкой через 15
    let t; const guard = new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error("db timeout"), { code: "TIMEOUT" })), req.query?.r === "ping" ? 60000 : 15000); });
    try { return await Promise.race([h(req, res), guard]); } finally { clearTimeout(t); }
  }
  catch (e) {
    console.error("api/x", req.query?.r, e);
    if (res.headersSent) return;
    // 42P01 / 42703: в базе нет таблицы или колонки — не выполнен db/schema_patch3.sql
    return res.status(500).json({ error: ["42P01", "42703"].includes(e.code) ? "no_schema" : e.code === "TIMEOUT" ? "timeout" : "server", detail: String(e.message || e).replace(/\s+/g, " ").slice(0, 160) });
  }
}
