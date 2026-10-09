-- Патч 6: аватарка пользователя из Telegram + жалобы на обложки игр. Выполни один раз в Supabase, SQL Editor.

-- Аватарка пользователя (кэш file_url из Telegram)
alter table users
  add column if not exists photo_url text,
  add column if not exists photo_updated_at timestamptz;

-- Категория тикета для жалоб на обложку (просто subject-метка, новых таблиц не нужно)
-- Убедись что патч 3 уже применён (таблица tickets существует)

-- Уникальный идентификатор текущего фото (чтобы детектить смену аватарки)
alter table users
  add column if not exists photo_unique_id text;
