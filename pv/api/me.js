import { sql, tgUser, getRole, saveUser, bindRef, startParam, botName, getRefBonus, tg } from "../lib/core.js";

// Получаем URL аватарки пользователя из Telegram.
// Логика: при каждом входе спрашиваем у Telegram file_unique_id текущего фото.
// Если он совпадает с закэшированным — отдаём кэш (без лишнего getFile).
// Если изменился (или кэша нет) — скачиваем новый URL и обновляем базу.
// file_unique_id стабилен и не меняется при ротации серверных ключей Telegram,
// поэтому это надёжный способ детектировать смену аватарки.
async function fetchPhotoUrl(userId) {
  try {
    // Шаг 1: узнаём у Telegram актуальный file_unique_id (дёшево — один запрос)
    const r1 = await tg("getUserProfilePhotos", { user_id: userId, limit: 1 });
    if (!r1.ok || !r1.result?.photos?.[0]?.[0]) {
      // У пользователя нет аватарки — сбрасываем кэш
      await sql`update users set photo_url = null, photo_unique_id = null, photo_updated_at = now() where id = ${userId}`;
      return null;
    }

    // Берём самый большой размер фото (последний в массиве)
    const sizes = r1.result.photos[0];
    const largest = sizes[sizes.length - 1];
    const currentUniqueId = largest.file_unique_id;

    // Шаг 2: сравниваем с кэшем в БД
    const [cached] = await sql`select photo_url, photo_unique_id from users where id = ${userId}`;

    if (cached?.photo_unique_id === currentUniqueId && cached?.photo_url) {
      // Аватарка не менялась — возвращаем кэш
      return cached.photo_url;
    }

    // Шаг 3: аватарка новая — получаем актуальный URL через getFile
    const r2 = await tg("getFile", { file_id: largest.file_id });
    if (!r2.ok || !r2.result?.file_path) return cached?.photo_url || null;

    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${r2.result.file_path}`;
    await sql`
      update users
      set photo_url = ${url}, photo_unique_id = ${currentUniqueId}, photo_updated_at = now()
      where id = ${userId}
    `;
    return url;
  } catch {
    // При ошибке возвращаем кэш (если есть) — не ломаем ответ
    try {
      const [cached] = await sql`select photo_url from users where id = ${userId}`;
      return cached?.photo_url || null;
    } catch { return null; }
  }
}

export default async function handler(req, res) {
  const u = tgUser(req);
  if (!u) return res.status(401).json({ error: "auth" });
  await saveUser(u);
  await bindRef(u.id, startParam(req));
  const [me] = await sql`select balance from users where id = ${u.id}`;
  const [st] = await sql`select count(*)::int as friends, (count(*) filter (where ref_rewarded))::int as bought
                         from users where referred_by = ${u.id}`;
  const photo_url = await fetchPhotoUrl(u.id);
  res.json({
    id: u.id, username: u.username || null, role: await getRole(u),
    balance: me ? me.balance : 0, bot: await botName(), ref_bonus: await getRefBonus(),
    friends: st.friends, bought: st.bought, photo_url,
  });
}
