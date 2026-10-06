import { sql } from "../lib/core.js";

// { "Игра": { avg, sale, pct } }: ровно тот формат, который ждёт фронтенд
export default async function handler(req, res) {
  const rows = await sql`select game, avg, sale, pct from steam_prices`;
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.json(Object.fromEntries(rows.map((r) => [r.game, { avg: r.avg, sale: r.sale, pct: r.pct }])));
}
