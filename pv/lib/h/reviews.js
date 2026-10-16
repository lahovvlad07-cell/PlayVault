// lib/h/reviews.js — отзывы на наборы
// GET  /api/x?r=reviews            → список всех отзывов (без авторизации)
// POST /api/x?r=reviews {action:"create", pack_id, stars, text} → добавить отзыв
// POST /api/x?r=reviews {action:"delete", id} → удалить (только admin/owner)

import { sql, tgUser, getRole, saveUser } from "../core.js";

export default async function reviews(req, res) {
  if (req.method === "GET") {
    const rows = await sql`
      select r.id, r.user_id, r.username, r.pack_id, r.pack_name,
             r.stars, r.text, r.created_at
      from reviews r
      order by r.created_at desc
      limit 200`;
    return res.json(rows);
  }

  if (req.method === "POST") {
    const u = tgUser(req);
    if (!u) return res.status(401).json({ error: "auth" });
    const { action, pack_id, stars, text, id } = req.body || {};

    // ── Создать отзыв ──
    if (action === "create") {
      const pid = Number(pack_id);
      const st  = Number(stars);
      const tx  = String(text || "").trim();
      if (!pid || st < 1 || st > 5 || tx.length < 3 || tx.length > 500)
        return res.status(400).json({ error: "bad_request" });

      // Проверяем что пользователь купил этот набор
      const [bought] = await sql`
        select 1 as x from orders
        where user_id = ${u.id} and pack_id = ${pid} and status = 'paid'
        limit 1`;
      if (!bought) return res.status(403).json({ error: "not_bought" });

      // Берём название набора
      const [pack] = await sql`select name from packs where id = ${pid}`;
      if (!pack) return res.status(404).json({ error: "pack_not_found" });

      await saveUser(u);
      try {
        const [r] = await sql`
          insert into reviews(user_id, username, pack_id, pack_name, stars, text)
          values (${u.id}, ${u.username || null}, ${pid}, ${pack.name}, ${st}, ${tx})
          on conflict (user_id, pack_id) do update
            set stars = excluded.stars, text = excluded.text, created_at = now()
          returning id, created_at`;
        return res.json({ ok: true, id: r.id, created_at: r.created_at });
      } catch (e) {
        return res.status(500).json({ error: "server", detail: e.message });
      }
    }

    // ── Удалить отзыв (только admin/owner) ──
    if (action === "delete") {
      if (!await getRole(u)) return res.status(403).json({ error: "forbidden" });
      await sql`delete from reviews where id = ${Number(id)}`;
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "bad_action" });
  }

  res.status(405).end();
}
