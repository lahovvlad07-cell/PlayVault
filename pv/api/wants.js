import { sql, tgUser, getRole, saveUser } from "../lib/core.js";

const gkey = (s) => String(s).toLowerCase().replace(/[^a-z0-9а-яё]+/g, "");

// Запросы игр («хочу такую игру»). Пользователь: POST. Админ: GET (сводка), PATCH (выполнено), DELETE.
export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });

  if (req.method === "POST") {
    await saveUser(u);
    const game = String(req.body?.game || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const src = req.body?.src === "wish" ? "wish" : "search";
    const key = gkey(game);
    if (key.length < 2) return res.status(400).json({ error: "bad_game" });
    const [ex] = await sql`select 1 as x from pack_games where lower(regexp_replace(game, '[^a-zA-Z0-9А-Яа-яЁё]+', '', 'g')) = ${key}`;
    if (ex) return res.status(409).json({ error: "in_catalog" });
    const [n] = await sql`select count(*)::int as c from wants where user_id = ${u.id} and created_at > now() - interval '1 day'`;
    if (n.c >= 20) return res.status(429).json({ error: "limit" });
    const [r] = await sql`insert into wants(user_id, game, gkey, src) values (${u.id}, ${game}, ${key}, ${src})
                          on conflict (user_id, gkey) do nothing returning id`;
    return res.json({ ok: true, dup: !r });
  }

  if (!(await getRole(u))) return res.status(403).json({ error: "forbidden" });

  if (req.method === "GET") {
    const rows = await sql`
      select w.gkey, (array_agg(w.game order by w.created_at))[1] as game,
             count(*)::int as n,
             (count(*) filter (where w.src = 'search'))::int as search,
             (count(*) filter (where w.src = 'wish'))::int as wish,
             max(w.created_at) as last,
             (d.gkey is not null) as done
      from wants w left join want_done d on d.gkey = w.gkey
      group by w.gkey, d.gkey
      order by (d.gkey is not null), n desc, last desc limit 200`;
    return res.json(rows);
  }
  if (req.method === "PATCH") {
    const key = String(req.body?.gkey || "");
    if (!key) return res.status(400).json({ error: "bad_request" });
    if (req.body.done) await sql`insert into want_done(gkey) values (${key}) on conflict do nothing`;
    else await sql`delete from want_done where gkey = ${key}`;
    return res.json({ ok: true });
  }
  if (req.method === "DELETE") {
    const key = String(req.body?.gkey || "");
    await sql`delete from wants where gkey = ${key}`;
    await sql`delete from want_done where gkey = ${key}`;
    return res.json({ ok: true });
  }
  res.status(405).end();
}
