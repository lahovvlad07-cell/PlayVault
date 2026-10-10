// Единая serverless-функция-роутер (лимит Vercel Hobby — 12 функций).
// Адреса /api/promo, /api/me и т.д. ведут сюда через rewrites в vercel.json.
import promo    from "../lib/h/promo.js";
import wants    from "../lib/h/wants.js";
import tickets  from "../lib/h/tickets.js";
import stats    from "../lib/h/stats.js";
import prices   from "../lib/h/steam-prices.js";

import { sql, mkSql, tgUser, getRole, saveUser, bindRef, startParam, botName, getRefBonus, tg } from "../lib/core.js";

// ─── /api/me ────────────────────────────────────────────────────────────────

async function fetchPhotoUrl(userId) {
  try {
    const r1 = await tg("getUserProfilePhotos", { user_id: userId, limit: 1 });
    if (!r1.ok || !r1.result?.photos?.[0]?.[0]) {
      await sql`update users set photo_url = null, photo_unique_id = null, photo_updated_at = now() where id = ${userId}`;
      return null;
    }
    const sizes = r1.result.photos[0];
    const largest = sizes[sizes.length - 1];
    const currentUniqueId = largest.file_unique_id;
    const [cached] = await sql`select photo_url, photo_unique_id from users where id = ${userId}`;
    if (cached?.photo_unique_id === currentUniqueId && cached?.photo_url) return cached.photo_url;
    const r2 = await tg("getFile", { file_id: largest.file_id });
    if (!r2.ok || !r2.result?.file_path) return cached?.photo_url || null;
    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${r2.result.file_path}`;
    await sql`update users set photo_url = ${url}, photo_unique_id = ${currentUniqueId}, photo_updated_at = now() where id = ${userId}`;
    return url;
  } catch {
    try { const [c] = await sql`select photo_url from users where id = ${userId}`; return c?.photo_url || null; }
    catch { return null; }
  }
}

async function me(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });
  await saveUser(u);
  await bindRef(u.id, startParam(req));
  const [row] = await sql`select balance from users where id = ${u.id}`;
  const [st]  = await sql`select count(*)::int as friends, (count(*) filter (where ref_rewarded))::int as bought
                           from users where referred_by = ${u.id}`;
  const photo_url = await fetchPhotoUrl(u.id);
  return res.json({
    id: u.id, username: u.username || null, role: await getRole(u),
    balance: row ? row.balance : 0, bot: await botName(), ref_bonus: await getRefBonus(),
    friends: st.friends, bought: st.bought, photo_url,
  });
}

// ─── /api/settings ──────────────────────────────────────────────────────────

async function settings(req, res) {
  if (req.method === "GET") {
    const rows  = await sql`select key, value from settings`;
    const obj   = Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]));
    const slots = await sql`select pack_id, max_slots, max_slots - used as free from accounts`;
    obj.slots   = Object.fromEntries(slots.map(r => [r.pack_id, { total: r.max_slots, free: r.free }]));
    return res.json(obj);
  }
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

// ─── /api/topup ─────────────────────────────────────────────────────────────

async function topup(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });
  if (req.method !== "POST") return res.status(405).end();
  const rub = Math.round(+(req.body?.amount) || 0);
  if (rub < 10 || rub > 10000) return res.status(400).json({ error: "bad_amount" });
  const [rateRow] = await sql`select value from settings where key = 'stars_rate'`;
  const rate  = rateRow ? JSON.parse(rateRow.value) : Number(process.env.STARS_PER_RUB || 0.85);
  const stars = Math.ceil(rub * rate);
  await sql`insert into users(id, username) values (${u.id}, ${u.username || null}) on conflict (id) do nothing`;
  const [o] = await sql`insert into topups(user_id, rub, stars, status) values (${u.id}, ${rub}, ${stars}, 'pending') returning id`;
  const r = await tg("createInvoiceLink", {
    title: "Пополнение баланса", description: `${rub} ₽ на баланс в PlayVault`,
    payload: "topup:" + o.id, currency: "XTR", prices: [{ label: "Пополнение", amount: stars }],
  });
  return res.json({ topup: o.id, link: r.result, stars, rub });
}

// ─── /api/x?r=ping (диагностика БД) ────────────────────────────────────────

async function ping(req, res) {
  const out = {};
  const cap = (p, ms = 5000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("нет ответа за " + ms / 1000 + " с")), ms))]);
  const run = async (name, q) => {
    const t0 = Date.now();
    try { const r = await cap(q()); out[name] = { ms: Date.now() - t0, ...(r || {}) }; }
    catch (e) { out[name] = { ms: Date.now() - t0, error: e.code || String(e.message || e).slice(0, 100) }; }
  };
  const d = mkSql();
  const tables = ["users", "promo_codes", "wants", "tickets"];
  await Promise.all([
    run("fresh_select1",   async () => { await d`select 1`; }),
    run("fresh_activity",  async () => ({ rows: (await d`select state, wait_event_type as wait, (extract(epoch from now() - query_start))::int as age_s, left(query, 60) as q
                                                         from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle' order by query_start limit 8`) })),
    ...tables.map((n) => run("fresh_" + n, async () => { const [r] = await d`select count(*)::int as rows from ${d(n)}`; return r; })),
    run("shared_select1",  async () => { await sql`select 1`; }),
    run("shared_users",    async () => { const [r] = await sql`select count(*)::int as rows from users`; return r; }),
  ]);
  d.end({ timeout: 1 }).catch(() => {});
  const u = process.env.DATABASE_URL || "";
  out.env = { has_db_url: !!u, pooler: /pooler\.supabase/.test(u), port: (u.match(/:(\d{4,5})\//) || [])[1] || null, region: process.env.VERCEL_REGION || null };
  return res.status(200).json(out);
}

// ─── Роутер ─────────────────────────────────────────────────────────────────

const H = { ping, me, settings, topup, promo, wants, tickets, stats, "steam-prices": prices };

export default async function handler(req, res) {
  const h = H[req.query?.r];
  if (!h) return res.status(404).json({ error: "not_found" });
  try {
    let t;
    const guard = new Promise((_, rej) => {
      t = setTimeout(
        () => rej(Object.assign(new Error("db timeout"), { code: "TIMEOUT" })),
        req.query?.r === "ping" ? 12000 : 15000
      );
    });
    try { return await Promise.race([h(req, res), guard]); }
    finally { clearTimeout(t); }
  } catch (e) {
    console.error("api/x", req.query?.r, e);
    if (res.headersSent) return;
    return res.status(500).json({
      error: ["42P01", "42703"].includes(e.code) ? "no_schema" : e.code === "TIMEOUT" ? "timeout" : "server",
      detail: String(e.message || e).replace(/\s+/g, " ").slice(0, 160),
    });
  }
}
