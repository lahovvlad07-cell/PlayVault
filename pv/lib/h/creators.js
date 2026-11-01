import { sql, tgUser, getRole, saveUser, tg, notifyAdmins, APP_URL } from "../core.js";

// Программа для авторов: человек добавляет баннер PlayVault в своё видео и присылает ссылку.
// Админ может сделать только две вещи: выдать промокод на баланс или отказать по готовой причине.
// Свободного текста в этом потоке нет, это не чат поддержки.

const PLATFORMS = ["youtube", "vk", "tiktok", "instagram"];
const TOPICS    = ["games", "cinema", "tech", "edu", "fun", "music", "sport", "blog", "other"];
const HOST = {
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/i,
  vk:      /(^|\.)(vk\.com|vk\.ru|vkvideo\.ru|vk\.cc)$/i,
  tiktok:  /(^|\.)tiktok\.com$/i,
  instagram: /(^|\.)instagram\.com$/i,
};
const FILES = {
  fhd:  { file: "playvault_banner.mp4",      w: 1920, h: 480 },
  "4k": { file: "playvault_banner_4k.mp4",   w: 3840, h: 960 },
  s:    { file: "playvault_banner_1080.mp4", w: 1080, h: 270 },
  iv:   { file: "playvault_insert_v.mp4",    w: 1080, h: 1920, insert: true },
  ih:   { file: "playvault_insert_h.mp4",    w: 1920, h: 1080, insert: true },
};
const REASONS = {
  no_banner: "Баннер PlayVault не найден в видео или виден меньше 5 секунд.",
  views:     "Просмотров пока недостаточно. Отправьте заявку заново, когда наберётся больше.",
  bad_views: "Указанное число просмотров не совпадает с реальным.",
  private:   "Видео закрыто, удалено или недоступно по ссылке.",
  dup:       "Это видео уже проверялось.",
  rules:     "Видео нарушает правила площадки или нашей программы.",
  fake:      "Есть признаки накрутки просмотров.",
};
const PAY_DAYS = 30;

function parseUrl(raw, platform) {
  let s = String(raw || "").trim();
  if (!s || s.length > 300) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u; try { u = new URL(s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
  if (HOST[platform] && !HOST[platform].test(u.hostname)) return null;
  // ключ для защиты от повторов: хост + путь (+ параметр v у YouTube), без трекинговых параметров
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const v = u.searchParams.get("v");
  const key = host + u.pathname.replace(/\/+$/, "").toLowerCase() + (v ? "?v=" + v : "");
  return { url: u.toString().slice(0, 300), key };
}

const code7 = () => {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "V";
  for (let i = 0; i < 7; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
};

export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });
  const role = await getRole(u);

  if (req.method === "GET") {
    if (req.query?.all) {
      if (!role) return res.status(403).json({ error: "forbidden" });
      const rows = await sql`
        select s.id, s.user_id::text as user_id, s.platform, s.topic, s.url, s.views, s.status, s.reward, s.promo_code, s.reject_reason, s.with_insert,
               s.created_at, s.resolved_at, us.username, us.first_name
        from creator_submissions s join users us on us.id = s.user_id
        order by (s.status = 'pending') desc, s.created_at desc limit 80`;
      return res.json(rows);
    }
    const rows = await sql`
      select s.id, s.platform, s.topic, s.url, s.views, s.status, s.reward, s.promo_code, s.reject_reason, s.with_insert, s.created_at, s.resolved_at,
             coalesce(pc.used, 0) > 0 as redeemed
      from creator_submissions s left join promo_codes pc on pc.code = s.promo_code
      where s.user_id = ${u.id} order by s.id desc limit 50`;
    return res.json(rows);
  }

  if (req.method !== "POST") return res.status(405).end();
  const b = req.body || {};

  // ── автор: прислать баннер в чат с ботом ──
  if (b.action === "banner") {
    const f = FILES[String(b.v || "fhd")];
    if (!f) return res.status(400).json({ error: "bad_request" });
    const r = await tg("sendVideo", {
      chat_id: u.id, video: APP_URL() + "/promo/" + f.file, supports_streaming: true, width: f.w, height: f.h,
      caption: f.insert
        ? "🎬 Рекламная вставка PlayVault (3 сек). Встройте её в своё видео целиком, со звуком, опубликуйте ролик и отправьте ссылку в разделе «Заработок на видео» с отметкой о вставке: получите надбавку к ставке."
        : "🎬 Баннер PlayVault. Добавьте его в своё видео (минимум на 5 секунд), опубликуйте ролик и отправьте ссылку в разделе «Заработок на видео».",
    }).catch(() => null);
    if (!r || !r.ok) return res.status(409).json({ error: "send_failed" });
    return res.json({ ok: true });
  }

  // ── автор: новая заявка ──
  if (b.action === "create") {
    await saveUser(u);
    const platform = String(b.platform || ""), topic = String(b.topic || "");
    if (!PLATFORMS.includes(platform) || !TOPICS.includes(topic)) return res.status(400).json({ error: "bad_request" });
    const p = parseUrl(b.url, platform);
    if (!p) return res.status(400).json({ error: "bad_url" });
    const views = Math.floor(+b.views || 0);
    if (!(views >= 1 && views <= 1e9)) return res.status(400).json({ error: "bad_views" });
    const [c] = await sql`select count(*) filter (where status = 'pending')::int as pend,
                                 count(*) filter (where created_at > now() - interval '1 day')::int as day
                          from creator_submissions where user_id = ${u.id}`;
    if (c.pend >= 3) return res.status(429).json({ error: "limit_pending" });
    if (c.day >= 10) return res.status(429).json({ error: "limit_day" });
    const [r] = await sql`insert into creator_submissions(user_id, platform, topic, url, url_key, views, with_insert)
                          values (${u.id}, ${platform}, ${topic}, ${p.url}, ${p.key}, ${views}, ${b.insert === true})
                          on conflict (url_key) do nothing returning id`;
    if (!r) return res.status(409).json({ error: "dup" });
    notifyAdmins("🎬 Новая заявка автора: открыть админ-панель → Видео.").catch(() => {});
    return res.json({ ok: true, id: r.id });
  }

  // дальше только администраторы
  if (!role) return res.status(403).json({ error: "forbidden" });
  const id = Math.floor(+b.id);
  if (!id) return res.status(400).json({ error: "bad_request" });

  // ── админ: выдать промокод на баланс ──
  if (b.action === "pay") {
    const amount = Math.floor(+b.amount || 0);
    if (!(amount >= 1 && amount <= 10000)) return res.status(400).json({ error: "bad_value" });
    const out = await sql.begin(async (tx) => {
      const [s] = await tx`select id, user_id from creator_submissions where id = ${id} and status = 'pending' for update`;
      if (!s) return null;
      let code = null;
      for (let i = 0; i < 6 && !code; i++) {
        const c = code7();
        const [ins] = await tx`insert into promo_codes(code, kind, value, max_uses, expires_at)
                               values (${c}, 'bal', ${amount}, 1, now() + ${PAY_DAYS + " days"}::interval)
                               on conflict do nothing returning code`;
        if (ins) code = ins.code;
      }
      if (!code) throw new Error("code_gen");
      await tx`update creator_submissions set status = 'paid', reward = ${amount}, promo_code = ${code},
                      resolved_at = now(), resolved_by = ${u.id} where id = ${id}`;
      return { code, user_id: s.user_id };
    });
    if (!out) return res.status(409).json({ error: "already" });
    await tg("sendMessage", {
      chat_id: out.user_id, parse_mode: "HTML",
      text: `🎬 <b>Заявка одобрена!</b>\nВознаграждение: <b>${amount} ₽</b>\n\nПромокод: <code>${out.code}</code>\nВведите его в разделе «Профиль» → «Промокод», и сумма сразу попадёт на баланс. Код действует ${PAY_DAYS} дней.`,
      reply_markup: { inline_keyboard: [[{ text: "Открыть PlayVault", web_app: { url: APP_URL() } }]] },
    }).catch(() => {});
    return res.json({ ok: true, code: out.code });
  }

  // ── админ: отказать (только из готового списка причин) ──
  if (b.action === "reject") {
    const text = REASONS[String(b.reason || "")];
    if (!text) return res.status(400).json({ error: "bad_reason" });
    const [s] = await sql`update creator_submissions set status = 'rejected', reject_reason = ${text},
                                 resolved_at = now(), resolved_by = ${u.id}
                          where id = ${id} and status = 'pending' returning user_id`;
    if (!s) return res.status(409).json({ error: "already" });
    await tg("sendMessage", {
      chat_id: s.user_id,
      text: `🎬 Заявка отклонена.\nПричина: ${text}`,
    }).catch(() => {});
    return res.json({ ok: true });
  }

  res.status(400).json({ error: "bad_request" });
}
