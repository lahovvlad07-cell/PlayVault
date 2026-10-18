-- ============================================================
-- Патч 10: настройки уведомлений
-- Supabase → SQL Editor → Run
-- ============================================================

-- Добавляем поле notify_prefs в users
-- Структура: {"all": false} — отключить всё
-- {"promo": false, "news": false} — отдельные метки
alter table users add column if not exists notify_prefs jsonb not null default '{}';

-- Метки рассылок добавляются в scheduled_broadcasts
alter table scheduled_broadcasts add column if not exists label text not null default 'promo';
