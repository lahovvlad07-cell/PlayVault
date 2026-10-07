// Одна serverless-функция вместо пяти (лимит Vercel Hobby — 12 функций). Адреса /api/promo и т.д. ведут сюда через rewrites в vercel.json.
import promo from "../lib/h/promo.js";
import wants from "../lib/h/wants.js";
import tickets from "../lib/h/tickets.js";
import stats from "../lib/h/stats.js";
import prices from "../lib/h/steam-prices.js";

const H = { promo, wants, tickets, stats, "steam-prices": prices };
export default function handler(req, res) {
  const h = H[req.query?.r];
  return h ? h(req, res) : res.status(404).json({ error: "not_found" });
}
