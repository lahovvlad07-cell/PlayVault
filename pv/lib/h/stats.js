import { sql, tgUser, getRole } from "../core.js";

// Статистика для админ-панели: только реальные данные из БД. Дни считаются по Москве.
export default async function handler(req, res) {
  const u = tgUser(req);
  if (!(await getRole(u))) return res.status(403).json({ error: "forbidden" });
  const days = Math.min(90, Math.max(7, Math.floor(+req.query?.days || 30)));
  const tz = "Europe/Moscow";

  const qSeries = sql`
    with d as (select generate_series((now() at time zone ${tz})::date - ${2 * days - 1}::int,
                                      (now() at time zone ${tz})::date, interval '1 day')::date as day)
    select d.day::text as day,
      (select count(*)::int from users x where (x.created_at at time zone ${tz})::date = d.day) as users,
      (select count(*)::int from orders o where o.status = 'paid' and (o.created_at at time zone ${tz})::date = d.day) as orders,
      (select coalesce(sum(o.price_rub), 0)::int from orders o where o.status = 'paid' and (o.created_at at time zone ${tz})::date = d.day) as revenue
    from d order by d.day`;

  const qTotals = sql`
    select (select count(*)::int from users) as users,
           (select count(*)::int from users where last_seen > now() - interval '7 days') as active7,
           (select count(distinct user_id)::int from orders where status = 'paid') as buyers,
           (select count(*)::int from orders where status = 'paid') as orders,
           (select coalesce(sum(price_rub), 0)::int from orders where status = 'paid') as revenue,
           (select coalesce(sum(balance), 0)::int from users) as balances,
           (select coalesce(sum(rub), 0)::int from topups where status = 'paid') as topups,
           (select count(*)::int from users where referred_by is not null) as invited,
           (select count(*)::int from users where ref_rewarded) as ref_buyers`;

  const qPack = sql`
    select p.id, p.name, count(o.id)::int as orders, coalesce(sum(o.price_rub), 0)::int as revenue,
           (select coalesce(sum(a.used), 0)::int from accounts a where a.pack_id = p.id) as used,
           (select coalesce(sum(a.max_slots), 0)::int from accounts a where a.pack_id = p.id) as slots
    from packs p left join orders o on o.pack_id = p.id and o.status = 'paid'
    group by p.id order by revenue desc, p.id`;
  const qMethod = sql`select coalesce(method, 'stars') as method, count(*)::int as orders, coalesce(sum(price_rub), 0)::int as revenue
                             from orders where status = 'paid' group by 1 order by 3 desc`;
  const qTk = sql`select (count(*) filter (where status = 'open'))::int as open,
                                (count(*) filter (where status = 'open' and unread_admin))::int as waiting from tickets`;
  const qW = sql`select count(distinct w.gkey)::int as pending from wants w
                        where not exists (select 1 from want_done d where d.gkey = w.gkey)`;

  // все запросы уходят разом по одному соединению: одна задержка до базы вместо семи
  const [series, [t], byPack, byMethod, [tk], [w]] = await Promise.all([qSeries, qTotals, qPack, qMethod, qTk, qW]);
  res.json({ days, series, totals: t, byPack, byMethod, tickets: tk, wantsPending: w.pending });
}
