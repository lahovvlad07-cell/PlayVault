import { sql, tgUser, getRole, enc, dec } from "../lib/core.js";

// Аккаунты наборов: логин и пароль хранятся зашифрованными (AES-256-GCM). Только admin/owner.
// GET  ?pack_id=N
// POST {pack_id, login, password, max_slots, used_slots?, extra_service?, extra_login?, extra_password?}
// PATCH {id, max_slots?, used?, login?, password?, extra_service?, extra_login?, extra_password?}
// DELETE {id}
export default async function handler(req, res) {
  const u = tgUser(req);
  if (!await getRole(u)) return res.status(403).json({ error: "forbidden" });

  if (req.method === "GET") {
    const rows = await sql`select id, pack_id, login_enc, max_slots, used, extra_service, extra_login_enc
                           from accounts
                           where pack_id = ${Number(req.query?.pack_id) || 0} order by id`;
    return res.json(rows.map(({ login_enc, extra_login_enc: el, ...r }) => ({
      ...r,
      login: dec(login_enc),
      extra_login: el ? dec(el) : null,
    })));
  }

  if (req.method === "POST") {
    const { pack_id, login, password, extra_service, extra_login, extra_password } = req.body || {};
    const l = String(login || "").trim(), p = String(password || "");
    const slots = Math.floor(Number(req.body?.max_slots) || 5);
    const usedSlots = Math.max(0, Math.min(slots, Math.floor(Number(req.body?.used_slots ?? 0))));
    if (!l || !p || l.length > 100 || p.length > 200 || slots < 1 || slots > 100)
      return res.status(400).json({ error: "bad_request" });
    const [pk] = await sql`select id from packs where id = ${Number(pack_id) || 0}`;
    if (!pk) return res.status(404).json({ error: "pack" });

    const svc = extra_service && String(extra_service).trim() ? String(extra_service).trim() : null;
    const el  = extra_login    && String(extra_login).trim()    ? enc(String(extra_login).trim())    : null;
    const ep  = extra_password && String(extra_password).trim() ? enc(String(extra_password).trim()) : null;

    const [a] = await sql`
      insert into accounts(pack_id, login_enc, pass_enc, max_slots, used, extra_service, extra_login_enc, extra_pass_enc)
      values (${pk.id}, ${enc(l)}, ${enc(p)}, ${slots}, ${usedSlots}, ${svc}, ${el}, ${ep})
      returning id`;
    return res.json({ id: a.id, max_slots: slots, used: usedSlots });
  }

  if (req.method === "PATCH") {
    const { id, max_slots, used, login, password, extra_service, extra_login, extra_password } = req.body || {};
    if (!id) return res.status(400).json({ error: "bad_request" });
    const [a] = await sql`select id, max_slots, used from accounts where id = ${Number(id)}`;
    if (!a) return res.status(404).json({ error: "not_found" });

    const newMax  = max_slots != null ? Math.max(1, Math.min(100, Math.floor(Number(max_slots)))) : a.max_slots;
    const newUsed = used      != null ? Math.max(0, Math.min(newMax, Math.floor(Number(used))))   : a.used;
    const newLogin = login     != null && String(login).trim()    ? enc(String(login).trim())    : null;
    const newPass  = password  != null && String(password).trim() ? enc(String(password).trim()) : null;

    // extra: null = не менять, "" = очистить, строка = обновить
    const svc = extra_service !== undefined ? (String(extra_service || "").trim() || null) : undefined;
    const el  = extra_login    !== undefined ? (String(extra_login    || "").trim() ? enc(String(extra_login).trim())    : null) : undefined;
    const ep  = extra_password !== undefined ? (String(extra_password || "").trim() ? enc(String(extra_password).trim()) : null) : undefined;

    await sql`update accounts set
      max_slots        = ${newMax},
      used             = ${newUsed},
      login_enc        = coalesce(${newLogin},  login_enc),
      pass_enc         = coalesce(${newPass},   pass_enc),
      extra_service    = case when ${svc !== undefined} then ${svc ?? null}    else extra_service    end,
      extra_login_enc  = case when ${el  !== undefined} then ${el  ?? null}    else extra_login_enc  end,
      extra_pass_enc   = case when ${ep  !== undefined} then ${ep  ?? null}    else extra_pass_enc   end
      where id = ${Number(id)}`;

    return res.json({ ok: true, max_slots: newMax, used: newUsed });
  }

  if (req.method === "DELETE") {
    const id = Number(req.body?.id) || 0;
    const [a] = await sql`select used from accounts where id = ${id}`;
    if (!a) return res.status(404).json({ error: "not_found" });
    if (a.used > 0) return res.status(409).json({ error: "in_use" });
    try { await sql`delete from accounts where id = ${id}`; } catch { return res.status(409).json({ error: "in_use" }); }
    return res.json({ ok: true });
  }
  res.status(405).end();
}
