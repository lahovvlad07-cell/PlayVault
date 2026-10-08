
-- Патч схемы (выполни если уже запускал schema.sql)
alter table packs add column if not exists cover_appid int;
alter table packs add column if not exists cover_game text;
alter table packs add column if not exists show_games jsonb;

create table if not exists topups (id serial primary key, user_id bigint references users(id), rub int not null, stars int not null, status text not null default 'pending', tg_charge_id text unique, created_at timestamptz default now());
create index if not exists topups_user on topups(user_id);
