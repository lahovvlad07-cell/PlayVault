import { sql, tgUser, getRole } from "../lib/core.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Публичные настройки (скидки, рекомендация, популярные)
    const rows = await sql`select key, value from settings`;
    const obj = Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]));
    // Актуальные слоты наборов
    const slots = await sql`select pack_id, max_slots, max_slots - used as free from accounts`;
    obj.slots = Object.fromEntries(slots.map(r => [r.pack_id, { total: r.max_slots, free: r.free }]));
    return res.json(obj);
  }
  // Запись — только для owner/admin
  if (req.method === "POST") {
    const u = tgUser(req);
    if (!await getRole(u)) return res.status(403).json({ error: "forbidden" });
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: "bad_request" });
    if (key === "ref_bonus") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 100000) return res.status(400).json({ error: "bad_value" });
    }
    await sql`insert into settings(key, value) values (${key}, ${JSON.stringify(value)})
              on conflict (key) do update set value = excluded.value`;
    return res.json({ ok: true });
  }
  res.status(405).end();
}
