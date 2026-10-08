import { sql, tgUser, getRole } from "../lib/core.js";

// Управление админами. Доступ только у owner и admin; роль берётся из БД, а не от клиента.
export default async function handler(req, res) {
  const u = tgUser(req);
  const role = await getRole(u);
  if (!role) return res.status(403).json({ error: "forbidden" });

  if (req.method === "GET") {
    const admins = await sql`select a.user_id::text as user_id, a.role, coalesce(u.username, a.username) as username
                             from admins a left join users u on u.id = a.user_id
                             order by (a.role = 'owner') desc, a.created_at`;
    return res.json({ admins, me: { id: u.id, role } });
  }

  if (req.method === "POST") {
    const { action, target, user_id } = req.body || {};

    if (action === "grant") {
      const t = String(target || "").trim().replace(/^@/, "");
      if (!t) return res.status(400).json({ error: "bad_request" });
      const isId = /^\d+$/.test(t);
      const [f] = isId ? await sql`select id, username from users where id = ${t}`
                       : await sql`select id, username from users where lower(username) = lower(${t})`;
      if (!f && !isId) return res.status(404).json({ error: "not_found" });
      await sql`insert into admins(user_id, role, username, added_by) values (${f ? f.id : t}, 'admin', ${f?.username || null}, ${u.id})
                on conflict (user_id) do nothing`;
      return res.json({ ok: true });
    }

    if (action === "revoke") {
      const [t] = await sql`select role from admins where user_id = ${String(user_id)}`;
      if (!t) return res.status(404).json({ error: "not_found" });
      if (t.role === "owner") return res.status(403).json({ error: "owner" }); // владельца не понижает никто, даже он сам
      await sql`delete from admins where user_id = ${String(user_id)}`;
      return res.json({ ok: true });
    }
  }
  res.status(405).end();
}
