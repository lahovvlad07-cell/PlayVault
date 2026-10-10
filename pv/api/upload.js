import { tgUser, getRole, tg } from "../lib/core.js";

// Загрузка изображения через Telegram:
// Принимаем base64, отправляем боту как фото, получаем file_id → постоянный URL
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });
  // Загрузка фото разрешена любому авторизованному пользователю (для тикетов)

  const { data, mime } = req.body || {};
  if (!data || !mime?.startsWith("image/")) return res.status(400).json({ error: "bad_request" });

  try {
    const buf = Buffer.from(data, "base64");
    if (buf.length > 10 * 1024 * 1024) return res.status(413).json({ error: "too_large" });

    // Отправляем боту фото через multipart (sendPhoto с Buffer)
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("chat_id", u.id);
    form.append("photo", buf, { filename: "upload.jpg", contentType: mime });
    form.append("disable_notification", "true");

    const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    }).then(x => x.json());

    if (!r.ok) return res.status(500).json({ error: "tg_error", detail: r.description });

    // Берём наибольший размер фото
    const photo = r.result.photo;
    const fileId = photo[photo.length - 1].file_id;

    // Удаляем сообщение чтобы не засорять чат
    tg("deleteMessage", { chat_id: u.id, message_id: r.result.message_id }).catch(() => {});

    // Возвращаем file_id — Telegram принимает его в sendPhoto, в отличие от прямого URL
    return res.json({ ok: true, file_id: fileId });
  } catch (e) {
    return res.status(500).json({ error: "server", detail: e.message });
  }
}
