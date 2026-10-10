import { sql, tgUser, getRole, saveUser, promoLookup, consumePromo } from "../core.js";

const CODE_RE = /^[A-Z0-9А-ЯЁ_-]{3,20}$/;

// Промокоды. Пользователь: check / redeem. Админ: список, create / toggle / delete.
export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });
  const role = await getRole(u);

  if (req.method === "GET") {
    if (!role) return res.status(403).json({ error: "forbidden" });
    const rows = await sql`select code, kind, value, max_uses, used, active, expires_at, pack_id, created_at
                           from promo_codes order by created_at desc`;
    return res.json(rows);
  }

  if (req.method === "POST") {
    const b = req.body || {};

    if (b.action === "check" || b.action === "redeem") {
      await saveUser(u);
      const packId = b.pack_id ? Number(b.pack_id) : null;
      const p = await promoLookup(b.code, u.id, packId);
      if (p.error) return res.status(400).json({ error: p.error });
      if (b.action === "check") return res.json({ code: p.code, kind: p.kind, value: p.value, pack_id: p.pack_id || null });
      if (p.kind !== "bal") return res.status(400).json({ error: "not_balance" });
      const bal = await sql.begin(async (tx) => {
        if (!(await consumePromo(u.id, p.code, tx))) return null;
        const [r] = await tx`update users set balance = balance + ${p.value} where id = ${u.id} returning balance`;
        return r.balance;
      });
      if (bal === null) return res.status(400).json({ error: "used" });
      return res.json({ ok: true, added: p.value, balance: bal });
    }

    // дальше — только администраторы
    if (!role) return res.status(403).json({ error: "forbidden" });

    if (b.action === "create") {
      const code = String(b.code || "").trim().toUpperCase();
      const kind = b.kind === "bal" ? "bal" : "disc";
      const value = Math.floor(+b.value || 0);
      const max = Math.max(0, Math.floor(+b.max || 0));
      // pack_id: только для kind=disc, опционально (null = скидка на все наборы)
      const packId = (kind === "disc" && b.pack_id) ? Number(b.pack_id) : null;
      if (!CODE_RE.test(code)) return res.status(400).json({ error: "bad_code" });
      if (kind === "disc" ? (value < 1 || value > 100) : (value < 10 || value > 10000))
        return res.status(400).json({ error: "bad_value" });
      // Проверяем что такой набор существует
      if (packId) {
        const [pk] = await sql`select id from packs where id = ${packId}`;
        if (!pk) return res.status(400).json({ error: "pack_not_found" });
      }
      let exp = null;
      if (b.expires) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.expires)) return res.status(400).json({ error: "bad_date" });
        exp = new Date(b.expires + "T23:59:59+03:00"); // до конца дня по Москве
        if (isNaN(exp) || exp < new Date()) return res.status(400).json({ error: "bad_date" });
      }
      const [r] = await sql`insert into promo_codes(code, kind, value, max_uses, expires_at, pack_id)
                            values (${code}, ${kind}, ${value}, ${max}, ${exp}, ${packId}) on conflict do nothing returning code`;
      if (!r) return res.status(409).json({ error: "exists" });
      return res.json({ ok: true, code });
    }
    if (b.action === "toggle") {
      const [r] = await sql`update promo_codes set active = not active where code = ${String(b.code)} returning active`;
      return r ? res.json({ ok: true, active: r.active }) : res.status(404).json({ error: "not_found" });
    }
    if (b.action === "delete") {
      await sql`delete from promo_codes where code = ${String(b.code)}`;
      return res.json({ ok: true });
    }
  }
  res.status(405).end();
}
