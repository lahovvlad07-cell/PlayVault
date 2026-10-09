-- Патч 4: доп. данные аккаунта (Uplay и др.). Выполни один раз в Supabase, SQL Editor.
alter table accounts
  add column if not exists extra_service text,       -- 'uplay' или null
  add column if not exists extra_login_enc text,     -- зашифровано, как login_enc
  add column if not exists extra_pass_enc  text;     -- зашифровано
