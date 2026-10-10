import { tgUser, tg } from "../lib/core.js";

// Загрузка изображения через Telegram:
// POST: Принимаем base64, отправляем боту как фото, получаем file_id → резолвим в https:// URL
// GET ?file_id=XXX: Резолвим file_id в свежий https:// URL (для показа сохранённых фото в тикетах)

// Резолвит Telegram file_id в прямой https:// URL через getFile
async function resolveFileId(fileId) {
  const r = await tg("getFile", { file_id: fileId });
  if (!r.ok) return null;
  return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${r.result.file_path}`;
}

// Проверяет, является ли строка Telegram file_id (а не https:// URL)
function isFileId(s) {
  return typeof s === "string" && /^[A-Za-z0-9_\-]{20,}$/.test(s) && !s.startsWith("http");
}

export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });

  // GET ?file_id=XXX — резолв file_id в свежий URL для показа фото из тикетов
  if (req.method === "GET") {
    const fileId = req.query?.file_id;
    if (!fileId || !isFileId(fileId)) return res.status(400).json({ error: "bad_request" });
    const url = await resolveFileId(fileId);
    if (!url) return res.status(404).json({ error: "not_found" });
    return res.json({ ok: true, url });
  }

  if (req.method !== "POST") return res.status(405).end();

  const { data, mime } = req.body || {};
  if (!data || !mime?.startsWith("image/")) return res.status(400).json({ error: "bad_request" });

  try {
    const buf = Buffer.from(data, "base64");
    if (buf.length > 10 * 1024 * 1024) return res.status(413).json({ error: "too_large" });

    // Отправляем боту фото через нативный FormData (Node 18+, не требует npm-пакета)
    const form = new FormData();
    form.append("chat_id", String(u.id));
    form.append("photo", new Blob([buf], { type: mime }), "upload.jpg");
    form.append("disable_notification", "true");

    const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      body: form,
    }).then(x => x.json());

    if (!r.ok) return res.status(500).json({ error: "tg_error", detail: r.description });

    // Берём наибольший размер фото — file_id постоянный, используется в sendPhoto напрямую
    const photo = r.result.photo;
    const fileId = photo[photo.length - 1].file_id;

    // Резолвим в прямой URL (~1 час) для превью и для хранения в тикете
    const previewUrl = await resolveFileId(fileId);

    // Удаляем сообщение чтобы не засорять чат
    tg("deleteMessage", { chat_id: u.id, message_id: r.result.message_id }).catch(() => {});

    // url = https:// URL (сохраняется в ticket_messages.photo, показывается в <img>)
    // preview = тот же URL (для немедленного превью в UI)
    // fileId = file_id (для отправки через sendPhoto в Telegram)
    return res.json({ ok: true, url: previewUrl || fileId, preview: previewUrl, fileId });
  } catch (e) {
    return res.status(500).json({ error: "server", detail: e.message });
  }
}
