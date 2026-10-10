-- Патч 7: фото в сообщениях тикетов + автоудаление. Выполни один раз в Supabase, SQL Editor.

-- Поле photo (URL) в сообщениях тикета
alter table ticket_messages
  add column if not exists photo text;

-- Автоудаление: удаляем тикеты, закрытые более 14 дней назад
-- (каскад удалит и ticket_messages через ON DELETE CASCADE)
-- Запускается кроном ежедневно через /api/cron/steam

-- Промокод на конкретный набор (null = на все наборы)
alter table promo_codes
  add column if not exists pack_id int references packs(id) on delete cascade;
