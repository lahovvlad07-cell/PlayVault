// Одна serverless-функция вместо пяти (лимит Vercel Hobby — 12 функций). Адреса /api/promo и т.д. ведут сюда через rewrites в vercel.json.
import promo from "../lib/h/promo.js";
import wants from "../lib/h/wants.js";
import tickets from "../lib/h/tickets.js";
import stats from "../lib/h/stats.js";
import prices from "../lib/h/steam-prices.js";

import { sql, mkSql } from "../lib/core.js";

// Диагностика: открыть /api/x?r=ping в браузере. Показывает, где именно зависает база. Данных не отдаёт.
async function ping(req, res) {
  const out = {};
  const cap = (p, ms = 5000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("нет ответа за " + ms / 1000 + " с")), ms))]);
  const run = async (name, q) => {
    const t0 = Date.now();
    try { const r = await cap(q()); out[name] = { ms: Date.now() - t0, ...(r || {}) }; }
    catch (e) { out[name] = { ms: Date.now() - t0, error: e.code || String(e.message || e).slice(0, 100) }; }
  };
  const d = mkSql(); // новое соединение, отдельное от общего
  const tables = ["users", "promo_codes", "wants", "tickets"];
  await Promise.all([
    run("fresh_select1", async () => { await d`select 1`; }),
    run("fresh_activity", async () => ({ rows: (await d`select state, wait_event_type as wait, (extract(epoch from now() - query_start))::int as age_s, left(query, 60) as q
                                                    from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle' order by query_start limit 8`) })),
    ...tables.map((n) => run("fresh_" + n, async () => { const [r] = await d`select count(*)::int as rows from ${d(n)}`; return r; })),
    run("shared_select1", async () => { await sql`select 1`; }),
    run("shared_users", async () => { const [r] = await sql`select count(*)::int as rows from users`; return r; }),
  ]);
  d.end({ timeout: 1 }).catch(() => {});
  const u = process.env.DATABASE_URL || "";
  out.env = { has_db_url: !!u, pooler: /pooler\.supabase/.test(u), port: (u.match(/:(\d{4,5})\//) || [])[1] || null, region: process.env.VERCEL_REGION || null };
  return res.status(200).json(out);
}

const H = { ping, promo, wants, tickets, stats, "steam-prices": prices };
export default async function handler(req, res) {
  const h = H[req.query?.r];
  if (!h) return res.status(404).json({ error: "not_found" });
  try {
    // если база не отвечает — не висим 300 секунд, отвечаем ошибкой через 15
    let t; const guard = new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error("db timeout"), { code: "TIMEOUT" })), req.query?.r === "ping" ? 12000 : 15000); });
    try { return await Promise.race([h(req, res), guard]); } finally { clearTimeout(t); }
  }
  catch (e) {
    console.error("api/x", req.query?.r, e);
    if (res.headersSent) return;
    // 42P01 / 42703: в базе нет таблицы или колонки — не выполнен db/schema_patch3.sql
    return res.status(500).json({ error: ["42P01", "42703"].includes(e.code) ? "no_schema" : e.code === "TIMEOUT" ? "timeout" : "server", detail: String(e.message || e).replace(/\s+/g, " ").slice(0, 160) });
  }
}
