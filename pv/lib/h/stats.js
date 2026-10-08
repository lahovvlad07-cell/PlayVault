import { sql, tgUser, getRole, staffIds } from "../core.js";

// Статистика для админ-панели: только реальные данные из БД. Дни считаются по Москве.
// Все агрегаты объединены в один запрос — одно соединение, один round-trip к БД.
export default async function handler(req, res) {
  const u = tgUser(req);
  if (!(await getRole(u))) return res.status(403).json({ error: "forbidden" });
  const days = Math.min(90, Math.max(7, Math.floor(+req.query?.days || 30)));
  const tz = "Europe/Moscow";
  // Персонал (owner/admin) в статистику не входит: ни пользователи, ни покупки, ни баланс, ни пополнения
  const staff = await staffIds();

  // Одним запросом: totals + tickets + wants (3 было отдельных → теперь 1)
  const [t] = await sql`
    select
      (select count(*)::int            from users where id::text <> all(${staff}::text[]))  as users,
      (select count(*)::int            from users where last_seen > now() - interval '7 days' and id::text <> all(${staff}::text[])) as active7,
      (select count(distinct user_id)::int from orders where status = 'paid' and user_id::text <> all(${staff}::text[])) as buyers,
      (select count(*)::int            from orders where status = 'paid' and user_id::text <> all(${staff}::text[])) as orders,
      (select coalesce(sum(price_rub),0)::int from orders where status = 'paid' and user_id::text <> all(${staff}::text[])) as revenue,
      (select coalesce(sum(balance),0)::int   from users where id::text <> all(${staff}::text[])) as balances,
      (select coalesce(sum(rub),0)::int       from topups where status = 'paid' and user_id::text <> all(${staff}::text[])) as topups,
      (select count(*)::int            from users where referred_by is not null and id::text <> all(${staff}::text[])) as invited,
      (select count(*)::int            from users where ref_rewarded and id::text <> all(${staff}::text[])) as ref_buyers,
      (select count(*)::int            from tickets where status = 'open')                 as tickets_open,
      (select count(*)::int            from tickets where status = 'open' and unread_admin) as tickets_waiting,
      (select count(distinct w.gkey)::int from wants w
         where not exists (select 1 from want_done d where d.gkey = w.gkey))               as wants_pending`;

  // Серия по дням (generate_series — отдельный запрос, нельзя свернуть без потери читаемости)
  const series = await sql`
    with d as (
      select generate_series(
        (now() at time zone ${tz})::date - ${2 * days - 1}::int,
        (now() at time zone ${tz})::date,
        interval '1 day'
      )::date as day
    )
    select d.day::text as day,
      (select count(*)::int from users x
         where (x.created_at at time zone ${tz})::date = d.day and x.id::text <> all(${staff}::text[])) as users,
      (select count(*)::int from orders o
         where o.status = 'paid' and (o.created_at at time zone ${tz})::date = d.day and o.user_id::text <> all(${staff}::text[])) as orders,
      (select coalesce(sum(o.price_rub),0)::int from orders o
         where o.status = 'paid' and (o.created_at at time zone ${tz})::date = d.day and o.user_id::text <> all(${staff}::text[])) as revenue
    from d order by d.day`;

  // byPack и byMethod — небольшие, быстрые, оставляем параллельно
  const [byPack, byMethod] = await Promise.all([
    sql`select p.id, p.name,
               count(o.id)::int                                                           as orders,
               coalesce(sum(o.price_rub),0)::int                                          as revenue,
               (select coalesce(sum(a.used),0)::int   from accounts a where a.pack_id = p.id) as used,
               (select coalesce(sum(a.max_slots),0)::int from accounts a where a.pack_id = p.id) as slots
        from packs p left join orders o on o.pack_id = p.id and o.status = 'paid' and o.user_id::text <> all(${staff}::text[])
        group by p.id order by revenue desc, p.id`,
    sql`select coalesce(method,'stars') as method,
               count(*)::int            as orders,
               coalesce(sum(price_rub),0)::int as revenue
        from orders where status = 'paid' and user_id::text <> all(${staff}::text[])
        group by 1 order by 3 desc`,
  ]);

  res.json({
    days, series,
    totals: t,
    byPack, byMethod,
    tickets: { open: t.tickets_open, waiting: t.tickets_waiting },
    wantsPending: t.wants_pending,
  });
}
