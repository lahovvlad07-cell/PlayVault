import crypto from "node:crypto";
import postgres from "postgres";

// Supabase: строка подключения «Transaction pooler» (порт 6543), подходит для serverless
// max увеличен до 3: при stats.js делает 6 параллельных запросов через Promise.all —
// с max:1 они выстраиваются в очередь и суммарно легко выходят за 5-10 сек таймаут функции.
// idle_timeout: закрываем простаивающее соединение сами, иначе Vercel «замораживает» функцию,
// пул Supabase обрывает сокет, и следующий запрос зависает на минуты.
export const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 3,              // было 1
  idle_timeout: 5,
  max_lifetime: 300,
  connect_timeout: 10,
});

// Отдельное короткоживущее соединение (диагностика)
export const mkSql = (extra = {}) =>
  postgres(process.env.DATABASE_URL, {
    ssl: "require", prepare: false, max: 1,
    connect_timeout: 8, idle_timeout: 2, ...extra,
  });

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

export const APP_URL = () => (process.env.APP_URL || "https://playvault-ten.vercel.app").replace(/\/$/, "");
export const REF_BONUS = () => { const n = Number(process.env.REF_BONUS); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 20; };
// Асинхронная версия: читает из таблицы settings, fallback — env/дефолт 20
export async function getRefBonus() {
  try {
    const [row] = await sql`select value from settings where key = 'ref_bonus'`;
    if (row) { const n = Number(JSON.parse(row.value)); if (Number.isFinite(n) && n >= 0) return Math.floor(n); }
  } catch {}
  return REF_BONUS();
}

let _bot;
export async function botName() {
  if (process.env.BOT_USERNAME) return process.env.BOT_USERNAME.replace(/^@/, "");
  if (_bot) return _bot;
  try { _bot = (await tg("getMe", {})).result?.username || null; } catch { _bot = null; }
  return _bot;
}

export function startParam(req) {
  return new URLSearchParams((req.headers.authorization || "").replace(/^tma /, "")).get("start_param") || "";
}

export const saveUser = (u) => sql`
  insert into users(id, username, first_name, last_seen) values (${u.id}, ${u.username || null}, ${u.first_name || null}, now())
  on conflict (id) do update set username = excluded.username, first_name = coalesce(excluded.first_name, users.first_name), last_seen = now()`;

export async function bindRef(userId, param) {
  const m = /^ref_(\d{1,15})$/.exec(param || "");
  if (!m || Number(m[1]) === Number(userId)) return;
  await sql`update users set referred_by = ${Number(m[1])}
            where id = ${userId} and referred_by is null
              and not exists (select 1 from orders where user_id = ${userId} and status = 'paid')
              and exists (select 1 from users where id = ${Number(m[1])})`;
}

export async function rewardRef(buyerId) {
  const bonus = await getRefBonus();
  if (!(bonus > 0)) return;
  const got = await sql.begin(async (tx) => {
    const [r] = await tx`update users set ref_rewarded = true
                         where id = ${buyerId} and referred_by is not null and not ref_rewarded returning referred_by`;
    if (!r) return null;
    const [b] = await tx`update users set balance = balance + ${bonus} where id = ${r.referred_by} returning balance`;
    return b ? { to: r.referred_by, balance: b.balance } : null;
  });
  if (!got) return;
  await tg("sendMessage", { chat_id: got.to,
    text: `🎉 Ваш друг купил доступ в PlayVault!\nНа ваш баланс зачислено ${bonus} ₽. Сейчас на балансе: ${got.balance} ₽.` }).catch(() => {});
}

export async function promoLookup(code, userId) {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return { error: "empty" };
  const [p] = await sql`select code, kind, value, max_uses, used, active, expires_at from promo_codes where code = ${c}`;
  if (!p) return { error: "not_found" };
  if (!p.active) return { error: "inactive" };
  if (p.expires_at && new Date(p.expires_at) < new Date()) return { error: "expired" };
  if (p.max_uses && p.used >= p.max_uses) return { error: "exhausted" };
  const [u] = await sql`select 1 as x from promo_uses where code = ${c} and user_id = ${userId}`;
  if (u) return { error: "used" };
  return { code: p.code, kind: p.kind, value: p.value };
}

export async function consumePromo(userId, code, tx = sql) {
  if (!code) return false;
  const [r] = await tx`insert into promo_uses(code, user_id) values (${code}, ${userId}) on conflict do nothing returning code`;
  if (!r) return false;
  await tx`update promo_codes set used = used + 1 where code = ${code}`;
  return true;
}

export async function notifyAdmins(text) {
  const rows = await sql`select user_id from admins`;
  await Promise.all(rows.map((a) => tg("sendMessage", {
    chat_id: a.user_id, text,
    reply_markup: { inline_keyboard: [[{ text: "Открыть админ-панель", web_app: { url: APP_URL() } }]] },
  }).catch(() => {})));
}

// Персонал (owner/admin): их покупки, пополнения и баланс не входят в статистику,
// а покупка доступа не занимает слот аккаунта.
export async function staffIds() {
  const rows = await sql`select user_id from admins`;
  const ids = rows.map((r) => String(r.user_id));
  if (process.env.OWNER_ID) ids.push(String(process.env.OWNER_ID));
  return ids;
}
export async function isStaff(userId) {
  return (await staffIds()).includes(String(userId));
}
