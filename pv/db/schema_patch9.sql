-- ============================================================
-- Патч 9: отзывы
-- Выполни один раз: Supabase → SQL Editor → вставить → Run
-- ============================================================

create table if not exists reviews (
  id          serial primary key,
  user_id     bigint not null references users(id),
  username    text,
  pack_id     int    not null references packs(id),
  pack_name   text   not null,
  stars       int    not null check (stars between 1 and 5),
  text        text   not null check (char_length(text) between 3 and 500),
  created_at  timestamptz not null default now(),
  unique (user_id, pack_id)
);

create index if not exists reviews_pack on reviews(pack_id);
create index if not exists reviews_user on reviews(user_id);

alter table reviews enable row level security;
