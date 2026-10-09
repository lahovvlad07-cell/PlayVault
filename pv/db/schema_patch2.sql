-- Патч 2: настоящий баланс, рефералы, рассылка. Выполни один раз в Supabase, SQL Editor.
alter table users  add column if not exists first_name   text;
alter table users  add column if not exists balance      int     not null default 0 check (balance >= 0);
alter table users  add column if not exists referred_by  bigint  references users(id);
alter table users  add column if not exists ref_rewarded boolean not null default false;
alter table users  add column if not exists blocked      boolean not null default false;
alter table orders add column if not exists method       text    not null default 'stars';
create index if not exists users_referred_by on users(referred_by);

