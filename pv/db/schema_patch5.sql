-- Патч 5: авторассылка (запланированные посты). Выполни один раз в Supabase, SQL Editor.

create table if not exists scheduled_broadcasts (
  id           serial primary key,
  text         text    not null,
  photo        text,                          -- URL фото или null
  button       boolean not null default true, -- показывать кнопку «Открыть магазин»

  -- Режим расписания: 'fixed' (фиксированное время) | 'random' (случайный интервал)
  mode         text    not null default 'fixed' check (mode in ('fixed', 'random')),

  -- Для mode='fixed': cron-подобное время и интервал повтора
  interval_h   int     not null default 24 check (interval_h >= 1),  -- повторять каждые N часов
  send_at_hour int     not null default 10 check (send_at_hour between 0 and 23), -- UTC час отправки (для fixed)
  send_at_min  int     not null default 0  check (send_at_min  between 0 and 59), -- UTC минуты

  -- Для mode='random': рандомный интервал между min_h и max_h часов
  min_h        int     not null default 24 check (min_h >= 1),
  max_h        int     not null default 48,

  -- Состояние
  active       boolean not null default true,
  next_send_at timestamptz,                   -- когда следующая отправка (вычисляется кроном)
  last_sent_at timestamptz,
  sent_count   int     not null default 0,

  -- Мета
  created_by   bigint,
  created_at   timestamptz not null default now()
);

-- RLS
alter table scheduled_broadcasts enable row level security;
