-- Патч 3: настоящие промокоды, запросы игр, тикеты поддержки и статистика. Выполни один раз в Supabase, SQL Editor
-- (после schema_patch2.sql).
alter table users  add column if not exists last_seen timestamptz;
alter table orders add column if not exists promo     text;
alter table orders add column if not exists promo_pct int not null default 0;

create table if not exists promo_codes (
  code        text primary key,
  kind        text not null check (kind in ('disc', 'bal')),   -- disc: скидка на покупку, bal: пополнение баланса
  value       int  not null check (value > 0),                 -- процент скидки или сумма в рублях
  max_uses    int  not null default 0,                         -- 0 = без лимита
  used        int  not null default 0,
  expires_at  timestamptz,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create table if not exists promo_uses (
  code       text   not null references promo_codes(code) on delete cascade,
  user_id    bigint not null references users(id),
  created_at timestamptz not null default now(),
  primary key (code, user_id)
);

create table if not exists wants (
  id         serial primary key,
  user_id    bigint references users(id),
  game       text not null,
  gkey       text not null,
  src        text not null default 'search',
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, gkey)
);
create table if not exists want_done (gkey text primary key, created_at timestamptz not null default now());

create table if not exists tickets (
  id           serial primary key,
  user_id      bigint not null references users(id),
  subject      text not null,
  status       text not null default 'open' check (status in ('open', 'closed')),
  unread_user  boolean not null default false,
  unread_admin boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create table if not exists ticket_messages (
  id         serial primary key,
  ticket_id  int not null references tickets(id) on delete cascade,
  from_admin boolean not null default false,
  author_id  bigint,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists tickets_user on tickets(user_id);
create index if not exists ticket_messages_ticket on ticket_messages(ticket_id);
create index if not exists orders_created on orders(created_at);
create index if not exists users_created on users(created_at);

-- Закрываем таблицы от публичного API Supabase: доступ только через наш сервер
do $$ declare t text; begin
  for t in select unnest(array['promo_codes','promo_uses','wants','want_done','tickets','ticket_messages']) loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
