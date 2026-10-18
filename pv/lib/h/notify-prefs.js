// lib/h/notify-prefs.js
// GET  /api/x?r=notify-prefs           → текущие настройки пользователя
// POST /api/x?r=notify-prefs {prefs}   → сохранить настройки

import { sql, tgUser, saveUser } from "../core.js";

export default async function notifyPrefs(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });

  if (req.method === "GET") {
    await saveUser(u);
    const [row] = await sql`select notify_prefs from users where id = ${u.id}`;
    return res.json(row?.notify_prefs || {});
  }

  if (req.method === "POST") {
    const { prefs } = req.body || {};
    if (!prefs || typeof prefs !== "object") return res.status(400).json({ error: "bad_request" });

    // Валидируем — разрешённые ключи
    const LABELS = ["all", "promo", "news", "updates"];
    const clean = {};
    for (const k of LABELS) {
      if (typeof prefs[k] === "boolean") clean[k] = prefs[k];
    }

    await sql`update users set notify_prefs = ${JSON.stringify(clean)} where id = ${u.id}`;
    return res.json({ ok: true });
  }

  res.status(405).end();
}
