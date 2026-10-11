-- ══════════════════════════════════════════════
-- Набор 6: Action Collection — один скрипт, вставь в Supabase → SQL Editor и нажми Run.
-- Безопасно запускать повторно: цена/название/описание уже созданного набора не перезаписываются,
-- игры не дублируются. Игры, которые уже есть в других наборах, сюда не включены.
-- Набор включён (active = true), но пока нет аккаунта, в магазине он покажется без свободных мест.
-- Аккаунт (логин/пароль шифруются ключом приложения, поэтому SQL его добавить не может):
--   в админке PlayVault, либо: node --env-file=.env.local scripts/add-account.js 6 <логин> <пароль> 5
-- ══════════════════════════════════════════════
INSERT INTO packs (id, name, sub, price, disc, cover_appid, cover_game, active)
VALUES (6, 'Action Collection', 'Wolfenstein, Sniper Elite, Resident Evil, Halo — шутеры и экшен для одиночной игры', 59, 0, 612880, 'Wolfenstein II: The New Colossus', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pack_games (pack_id, game, appid) VALUES
  (6, 'Wolfenstein II: The New Colossus',       612880),
  (6, 'Wolfenstein: The New Order',             201810),
  (6, 'Wolfenstein: The Old Blood',             350080),
  (6, 'Wolfenstein: Youngblood',                1056960),
  (6, 'Return to Castle Wolfenstein',           9010),
  (6, 'Sniper Elite',                           3700),
  (6, 'Sniper Elite 3',                         238090),
  (6, 'Sniper Ghost Warrior 2',                 34870),
  (6, 'Resident Evil',                          304240),
  (6, 'Resident Evil 6',                        221040),
  (6, 'Mortal Kombat 1',                        1971870),
  (6, 'Halo: The Master Chief Collection',      976730),
  (6, 'Hellblade: Senua''s Sacrifice',          414340),
  (6, 'Shenmue III',                            878670),
  (6, 'SPRAWL',                                 1549690),
  (6, 'Garten of Banban',                       2232840),
  (6, 'Grapples Galore',                        2239140)
ON CONFLICT DO NOTHING;
