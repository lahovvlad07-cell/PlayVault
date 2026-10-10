create table users (id bigint primary key, username text, created_at timestamptz default now());
create table packs (id int primary key, name text not null, sub text, price int not null, disc int not null default 0, active bool not null default true);
create table pack_games (pack_id int references packs(id) on delete cascade, game text not null, appid int, primary key (pack_id, game));
create table accounts (id serial primary key, pack_id int references packs(id), login_enc text not null, pass_enc text not null, max_slots int not null default 5, used int not null default 0);
create table orders (id serial primary key, user_id bigint references users(id), pack_id int references packs(id), account_id int references accounts(id),
  price_rub int not null, stars int not null, status text not null default 'pending', tg_charge_id text unique, created_at timestamptz default now());
create index on orders(user_id);
create table steam_prices (game text primary key, avg int not null, sale int, pct int not null default 0, updated_at timestamptz);
create table price_history (game text, day date, final_rub numeric, primary key (game, day));
create table settings (key text primary key, value text);
create table admins (user_id bigint primary key, role text not null check (role in ('owner','admin')), username text, added_by bigint, created_at timestamptz default now());
create unique index one_owner on admins ((role)) where role = 'owner';

-- Supabase отдаёт таблицы через публичный API. Включаем RLS без политик: доступ только через наш сервер.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
