import { sql, tgUser, getRole } from "../lib/core.js";

export default async function handler(req, res) {
  // GET — публичный: наборы + игры + слоты
  if (req.method === "GET") {
    const packs = await sql`select * from packs where active order by id`;
    const games = await sql`select pack_id, game, appid from pack_games order by game`;
    const acc   = await sql`select pack_id, max_slots, max_slots - used as free from accounts`;
    const gmap  = {}, smap = {};
    games.forEach(g => { (gmap[g.pack_id] = gmap[g.pack_id] || []).push({ game: g.game, appid: g.appid }); });
    acc.forEach(a => { smap[a.pack_id] = { total: a.max_slots, free: a.free }; });
    return res.json(packs.map(p => ({ ...p, games: gmap[p.id] || [], slots: smap[p.id] || { total: 0, free: 0 } })));
  }

  // Всё остальное — только admin/owner
  const u = tgUser(req); if (!await getRole(u)) return res.status(403).json({ error: "forbidden" });

  // POST — создать набор
  if (req.method === "POST") {
    const { name, sub, price, disc, cover_appid, cover_game, games = [] } = req.body || {};
    if (!name || !price) return res.status(400).json({ error: "bad_request" });
    const d = Math.min(90, Math.max(0, Math.round(+disc || 0)));
    // id в таблице задаётся вручную (без автонумерации), поэтому берём следующий свободный
    const [pack] = await sql`insert into packs(id, name, sub, price, disc, cover_appid, cover_game)
                             values ((select coalesce(max(id), 0) + 1 from packs), ${name}, ${sub||null}, ${+price}, ${d}, ${cover_appid||null}, ${cover_game||null}) returning id`;
    if (games.length) {
      const vals = games.map(g => ({ pack_id: pack.id, game: g.game, appid: g.appid || null }));
      await sql`insert into pack_games ${sql(vals)}`;
    }
    return res.json({ id: pack.id });
  }

  // PATCH — обновить набор или игры
  if (req.method === "PATCH") {
    const { id, name, sub, price, disc, cover_appid, cover_game,
            add_games, remove_games, set_show_games } = req.body || {};
    if (!id) return res.status(400).json({ error: "bad_request" });
    if (name || sub !== undefined || price || disc !== undefined || cover_appid !== undefined || cover_game !== undefined) {
      await sql`update packs set
        name        = coalesce(${name||null}, name),
        sub         = coalesce(${sub??null}, sub),
        price       = coalesce(${price||null}, price),
        disc        = coalesce(${disc??null}, disc),
        cover_appid = coalesce(${cover_appid??null}, cover_appid),
        cover_game  = coalesce(${cover_game??null}, cover_game)
        where id = ${+id}`;
    }
    if (add_games?.length) {
      const vals = add_games.map(g => ({ pack_id: +id, game: g.game, appid: g.appid || null }));
      await sql`insert into pack_games ${sql(vals)} on conflict do nothing`;
    }
    if (remove_games?.length) {
      await sql`delete from pack_games where pack_id = ${+id} and game = any(${remove_games})`;
    }
    if (set_show_games !== undefined) {
      await sql`update packs set show_games = ${JSON.stringify(set_show_games)} where id = ${+id}`;
    }
    return res.json({ ok: true });
  }

  // DELETE — скрыть набор
  if (req.method === "DELETE") {
    const { id } = req.body || {};
    await sql`update packs set active = false where id = ${+id}`;
    return res.json({ ok: true });
  }
  res.status(405).end();
}
