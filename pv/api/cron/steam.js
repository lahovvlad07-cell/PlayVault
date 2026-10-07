import { sql } from "../../lib/core.js";

// Раз в сутки: цены Steam в регионе KZ (тенге) -> рубли по курсу ЦБ -> скидка или средняя цена
const CHUNK = 30, MIN_SNAPSHOTS = 14;

async function rateKztRub() {
  try {
    const j = await fetch("https://www.cbr-xml-daily.ru/daily_json.js").then((r) => r.json());
    const k = j.Valute.KZT;
    return k.Value / k.Nominal;
  } catch { return Number(process.env.KZT_RUB) || 0; } // запасной курс из переменной окружения
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  const rate = await rateKztRub();
  if (!rate) return res.status(500).json({ error: "no rate" });

  const games = await sql`select distinct game, appid from pack_games where appid is not null`;
  const now = {};
  for (let i = 0; i < games.length; i += CHUNK) {
    const part = games.slice(i, i + CHUNK);
    try {
      const url = `https://store.steampowered.com/api/appdetails?appids=${part.map((g) => g.appid).join(",")}&cc=kz&filters=price_overview`;
      const data = await fetch(url).then((r) => r.json());
      for (const g of part) {
        const po = data[g.appid]?.data?.price_overview; // у бесплатных игр и без цены в регионе его нет
        if (po) now[g.game] = { initial: (po.initial / 100) * rate, final: (po.final / 100) * rate, pct: po.discount_percent };
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }

  const names = Object.keys(now);
  await Promise.all(names.map((g) => sql`insert into price_history(game, day, final_rub) values (${g}, current_date, ${now[g].final})
                                         on conflict (game, day) do update set final_rub = excluded.final_rub`));
  const stats = await sql`select game, avg(final_rub) a, count(*) n from price_history where day > current_date - 365 group by game`;
  const st = Object.fromEntries(stats.map((s) => [s.game, s]));
  await Promise.all(names.map((g) => {
    const { initial, final, pct } = now[g];
    const avg = Math.round(st[g] && Number(st[g].n) >= MIN_SNAPSHOTS ? Number(st[g].a) : initial); // мало истории: обычная цена
    const sale = pct > 0 ? Math.round(final) : null; // есть скидка: берём цену со скидкой
    return sql`insert into steam_prices(game, avg, sale, pct, updated_at) values (${g}, ${avg}, ${sale}, ${pct}, now())
               on conflict (game) do update set avg = ${avg}, sale = ${sale}, pct = ${pct}, updated_at = now()`;
  }));
  res.json({ rate, updated: names.length, noPrice: games.length - names.length });
}
