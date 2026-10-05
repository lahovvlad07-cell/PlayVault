import crypto from "node:crypto";
import postgres from "postgres";

// Supabase: строка подключения «Transaction pooler» (порт 6543), подходит для serverless
export const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false, max: 1 });

// Шифрование логинов и паролей аккаунтов (AES-256-GCM). ACC_KEY: openssl rand -base64 32
const key = () => Buffer.from(process.env.ACC_KEY, "base64");
export const enc = (t) => {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(t, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
};
export const dec = (s) => {
  const [iv, tag, ct] = s.split(".").map((x) => Buffer.from(x, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
};

// Проверка подписи Telegram initData. Клиент шлёт заголовок: Authorization: tma <initData>
export function tgUser(req) {
  const p = new URLSearchParams((req.headers.authorization || "").replace(/^tma /, ""));
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const str = [...p.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN).digest();
  const calc = Buffer.from(crypto.createHmac("sha256", secret).update(str).digest("hex"));
  const got = Buffer.from(hash);
  if (calc.length !== got.length || !crypto.timingSafeEqual(calc, got)) return null;
  if (Date.now() / 1000 - Number(p.get("auth_date")) > 86400) return null;
  try { return JSON.parse(p.get("user")); } catch { return null; }
}
// Роль пользователя: "owner" | "admin" | null. Определяется только на сервере по подписанному Telegram ID.
// Владелец: числовой ID из OWNER_ID (надёжно). Если OWNER_ID не задан, первый вход @nellmet привязывает его ID навсегда.
export async function getRole(u) {
  if (!u) return null;
  const [r] = await sql`select role from admins where user_id = ${u.id}`;
  if (r) return r.role;
  const byId = process.env.OWNER_ID && String(u.id) === process.env.OWNER_ID;
  let byName = false;
  if (!process.env.OWNER_ID && (u.username || "").toLowerCase() === "nellmet") {
    const [o] = await sql`select 1 as x from admins where role = 'owner'`;
    byName = !o;
  }
  if (!byId && !byName) return null;
  await sql`insert into admins(user_id, role, username) values (${u.id}, 'owner', ${u.username || null})
            on conflict (user_id) do update set role = 'owner'`;
  return "owner";
}

export const tg = (method, body) =>
  fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then((r) => r.json());
