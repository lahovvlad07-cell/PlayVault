// Одна serverless-функция вместо пяти (лимит Vercel Hobby — 12 функций). Адреса /api/promo и т.д. ведут сюда через rewrites в vercel.json.
import promo from "../lib/h/promo.js";
import wants from "../lib/h/wants.js";
import tickets from "../lib/h/tickets.js";
import stats from "../lib/h/stats.js";
import prices from "../lib/h/steam-prices.js";

const H = { promo, wants, tickets, stats, "steam-prices": prices };
export default async function handler(req, res) {
  const h = H[req.query?.r];
  if (!h) return res.status(404).json({ error: "not_found" });
  try { return await h(req, res); }
  catch (e) {
    console.error("api/x", req.query?.r, e);
    if (res.headersSent) return;
    // 42P01 / 42703: в базе нет таблицы или колонки — не выполнен db/schema_patch3.sql
    return res.status(500).json({ error: ["42P01", "42703"].includes(e.code) ? "no_schema" : "server", detail: String(e.message || e).replace(/\s+/g, " ").slice(0, 160) });
  }
}
