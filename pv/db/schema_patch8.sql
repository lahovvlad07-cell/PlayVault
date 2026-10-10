-- ============================================================
-- Патч 8: синхронизация наборов из index.html → база данных
-- + новый набор "Ultimate Collection" (id=6)
-- Выполни один раз в Supabase → SQL Editor
-- ============================================================

-- ── 1. Деактивируем Far Cry Collection (id=1, требует Uplay) ──
UPDATE packs SET active = false WHERE id = 1;
DELETE FROM pack_games WHERE pack_id = 1;

-- ── 2. Prime Collection (id=2) ──
INSERT INTO packs (id, name, sub, price, disc, active)
VALUES (2, 'Prime Collection', 'Проверенные хиты — от инди до AAA', 79, 0, true)
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name, sub = excluded.sub,
  price = excluded.price, disc = excluded.disc, active = excluded.active;

DELETE FROM pack_games WHERE pack_id = 2;
INSERT INTO pack_games (pack_id, game, appid) VALUES
  (2, 'Atomic Heart', 668580),
  (2, 'Car Mechanic Simulator 2018', 645630),
  (2, 'Cuphead', 268910),
  (2, 'DARK SOULS II', 236430),
  (2, 'Devil May Cry 5', 601150),
  (2, 'Graveyard Keeper', 599140),
  (2, 'House Flipper', 738370),
  (2, 'Resident Evil 4', 2050650),
  (2, 'Sid Meier''s Civilization VI', 289070),
  (2, 'Subnautica', 264710),
  (2, 'Subnautica: Below Zero', 848450),
  (2, 'Totally Accurate Battle Simulator', 508440),
  (2, 'Warhammer 40,000: Gladius - Relics of War', 489630);

-- ── 3. Vault Collection (id=3) ──
INSERT INTO packs (id, name, sub, price, disc, active)
VALUES (3, 'Vault Collection', 'Огромная библиотека: от инди до AAA — всё в одном', 99, 0, true)
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name, sub = excluded.sub,
  price = excluded.price, disc = excluded.disc, active = excluded.active;

DELETE FROM pack_games WHERE pack_id = 3;
INSERT INTO pack_games (pack_id, game, appid) VALUES
  (3, 'Alan Wake', 108710),
  (3, 'Batman: Arkham Knight', 208650),
  (3, 'BeamNG.drive', 284160),
  (3, 'Besiege', 346010),
  (3, 'Borderlands 2', 49520),
  (3, 'Buckshot Roulette', 2835570),
  (3, 'Content Warning', 2881650),
  (3, 'Counter-Strike: Source', 240),
  (3, 'Deponia', 214340),
  (3, 'Detroit: Become Human', 1222140),
  (3, 'Don''t Starve', 219740),
  (3, 'Dying Light', 239140),
  (3, 'Dying Light 2: Reloaded Edition', 534380),
  (3, 'Euro Truck Simulator 2', 227300),
  (3, 'Fallout: New Vegas PCR', 22380),
  (3, 'Frostpunk', 323190),
  (3, 'Garry''s Mod', 4000),
  (3, 'Geometry Dash', 322170),
  (3, 'Golf With Your Friends', 431240),
  (3, 'Green Hell', 815370),
  (3, 'Grounded', 962130),
  (3, 'Half-Life', 70),
  (3, 'Half-Life 2', 220),
  (3, 'Heavy Rain', 960910),
  (3, 'Hello Neighbor', 521890),
  (3, 'Hitman: Absolution', 203140),
  (3, 'Hitman: Blood Money', 6860),
  (3, 'HITMAN World of Assassination', 1659040),
  (3, 'Hollow Knight', 367520),
  (3, 'Hotline Miami', 219150),
  (3, 'Hotline Miami 2: Wrong Number', 274170),
  (3, 'Human Fall Flat', 477160),
  (3, 'Hunting Simulator 2', 1135910),
  (3, 'Icarus', 1149460),
  (3, 'Inscryption', 1092790),
  (3, 'Left 4 Dead', 500),
  (3, 'Left 4 Dead 2', 550),
  (3, 'LEGO Batman 2: DC Super Heroes', 214570),
  (3, 'LEGO Batman 3: Beyond Gotham', 296050),
  (3, 'LEGO Batman: The Videogame', 21000),
  (3, 'LEGO Jurassic World', 352400),
  (3, 'LEGO Звёздные Войны: Скайуокер. Сага', 920210),
  (3, 'Lethal Company', 1966720),
  (3, 'Life is Strange 2', 532210),
  (3, 'LIMBO', 48000),
  (3, 'Little Nightmares', 424840),
  (3, 'Little Nightmares Enhanced Edition', 424840),
  (3, 'Machinarium', 40700),
  (3, 'Medieval Dynasty', 1129580),
  (3, 'Metro 2033 Redux', 286690),
  (3, 'Metro Exodus', 412020),
  (3, 'Metro: Last Light Complete Edition', 287390),
  (3, 'Moonlighter', 606150),
  (3, 'No, I''m not a Human', 3180070),
  (3, 'Outlast', 238320),
  (3, 'Outlast 2', 414700),
  (3, 'PAYDAY 2', 218620),
  (3, 'PEAK', 3527290),
  (3, 'Phasmophobia', 739630),
  (3, 'Plague Inc: Evolved', 246620),
  (3, 'Plants vs. Zombies: Game of the Year', 3590),
  (3, 'Portal', 400),
  (3, 'Portal 2', 620),
  (3, 'POSTAL 2', 223470),
  (3, 'Project Zomboid', 108600),
  (3, 'Psychonauts', 3830),
  (3, 'R.E.P.O.', 3241660),
  (3, 'RoboCop: Rogue City', 1681430),
  (3, 'Schedule I', 3164500),
  (3, 'Scrap Mechanic', 387990),
  (3, 'Shadow of the Tomb Raider', 750920),
  (3, 'Sid Meier''s Civilization V', 8930),
  (3, 'Sid Meier''s Civilization VI', 289070),
  (3, 'SOMA', 282140),
  (3, 'Stardew Valley', 413150),
  (3, 'SteamWorld Dig', 252410),
  (3, 'Super Meat Boy', 40800),
  (3, 'Supermarket Simulator', 2670630),
  (3, 'Teardown', 1167630),
  (3, 'Terraria', 105600),
  (3, 'The Binding of Isaac: Rebirth', 250900),
  (3, 'The Escapists 2', 641990),
  (3, 'The Forest', 242760),
  (3, 'The Life and Suffering of Sir Brante', 1135910),
  (3, 'The Long Dark', 305620),
  (3, 'The Long Drive', 1017180),
  (3, 'The Outlast Trials', 1304930),
  (3, 'theHunter: Call of the Wild', 518790),
  (3, 'Thief Simulator', 704850),
  (3, 'Tomb Raider', 203160),
  (3, 'Travellers Rest', 1139980),
  (3, 'Undertale', 391540),
  (3, 'Valheim', 892970),
  (3, 'Ведьмак 3: Дикая Охота — Обновлённое издание', 292030),
  (3, 'Warhammer 40,000: Gladius - Relics of War', 489630),
  (3, 'Warhammer: Vermintide 2', 552500),
  (3, 'World War Z', 699130),
  (3, 'Хогвартс. Наследие', 990080),
  (3, 'Zombie Army 4: Dead War', 694280);

-- ── 4. Legends Collection (id=4) ──
INSERT INTO packs (id, name, sub, price, disc, cover_appid, cover_game, active)
VALUES (4, 'Legends Collection', 'Хиты на все вкусы: выживание, экшен, стратегии и классика', 89, 0, 394360, 'Hearts of Iron IV', true)
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name, sub = excluded.sub,
  price = excluded.price, disc = excluded.disc,
  cover_appid = excluded.cover_appid, cover_game = excluded.cover_game, active = excluded.active;

DELETE FROM pack_games WHERE pack_id = 4;
INSERT INTO pack_games (pack_id, game, appid) VALUES
  (4, 'Among Us', 945360),
  (4, 'Batman: Arkham Asylum GOTY', 35140),
  (4, 'Batman: Arkham City GOTY', 45510),
  (4, 'Batman: Arkham Knight', 208650),
  (4, 'Batman: The Telltale Series', 278340),
  (4, 'Bendy and the Dark Revival', 1431850),
  (4, 'Buckshot Roulette', 2835570),
  (4, 'Bully: Scholarship Edition', 12200),
  (4, 'Car Mechanic Simulator 2018', 645630),
  (4, 'Dead by Daylight', 381210),
  (4, 'Don''t Starve Together', 322330),
  (4, 'Esports Manager 2026', 2749950),
  (4, 'Football Manager 2020', 1100600),
  (4, 'Football Manager 2021', 1263850),
  (4, 'Football Manager 2022', 1569040),
  (4, 'Football Manager 2023', 1904540),
  (4, 'Garry''s Mod', 4000),
  (4, 'Geometry Dash', 322170),
  (4, 'Ghostwire: Tokyo', 1475810),
  (4, 'Green Hell', 815370),
  (4, 'Hearts of Iron IV', 394360),
  (4, 'HITMAN World of Assassination', 1659040),
  (4, 'Hotline Miami', 219150),
  (4, 'Left 4 Dead', 500),
  (4, 'Left 4 Dead 2', 550),
  (4, 'Life is Strange 2', 532210),
  (4, 'LIMBO', 48000),
  (4, 'Metro 2033 Redux', 286690),
  (4, 'Metro: Last Light Complete Edition', 287390),
  (4, 'Mortal Kombat X', 307780),
  (4, 'PAYDAY 2', 218620),
  (4, 'PC Building Simulator', 621060),
  (4, 'People Playground', 1118200),
  (4, 'Plague Inc: Evolved', 246620),
  (4, 'Planet Zoo', 703080),
  (4, 'Portal', 400),
  (4, 'Portal 2', 620),
  (4, 'POSTAL 2', 223470),
  (4, 'Schedule I', 3164500),
  (4, 'Sid Meier''s Civilization VI', 289070),
  (4, 'Slime Rancher', 433340),
  (4, 'Sniper Elite 4', 312670),
  (4, 'Sonic Mania', 584400),
  (4, 'Terraria', 105600),
  (4, 'The Binding of Isaac: Rebirth', 250900),
  (4, 'The Forest', 242760),
  (4, 'theHunter: Call of the Wild', 518790),
  (4, 'Ultimate Zombie Defense', 1035510),
  (4, 'Ведьмак 3: Дикая Охота — Обновлённое издание', 292030),
  (4, 'Warhammer 40,000: Gladius - Relics of War', 489630),
  (4, 'Who''s Your Daddy?!', 318010),
  (4, 'Wreckfest', 228380);

-- ── 5. Horizon Collection (id=5) ──
INSERT INTO packs (id, name, sub, price, disc, cover_appid, cover_game, active)
VALUES (5, 'Horizon Collection', 'От BeamNG до GTA — симуляторы, выживание и открытый мир', 79, 0, 284160, 'BeamNG.drive', true)
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name, sub = excluded.sub,
  price = excluded.price, disc = excluded.disc,
  cover_appid = excluded.cover_appid, cover_game = excluded.cover_game, active = excluded.active;

DELETE FROM pack_games WHERE pack_id = 5;
INSERT INTO pack_games (pack_id, game, appid) VALUES
  (5, 'BeamNG.drive', 284160),
  (5, 'Call of Duty', 2),
  (5, 'Construction Simulator', 1273400),
  (5, 'GTA IV: The Complete Edition', 12210),
  (5, 'Graveyard Keeper', 599140),
  (5, 'Hello Neighbor', 521890),
  (5, 'Resident Evil Village Gold Edition', 1196590),
  (5, 'SimRail - The Railway Simulator', 1422130),
  (5, 'Sons of the Forest', 1326470),
  (5, 'Supermarket Together', 2689520),
  (5, 'The Long Drive', 1017180),
  (5, 'The Sims 4', 1222690);

-- ── 6. Ultimate Collection (id=6) — НОВЫЙ набор ──
INSERT INTO packs (id, name, sub, price, disc, cover_appid, cover_game, active)
VALUES (6, 'Ultimate Collection', '35+ игр: хорроры, экшен, стратегии, инди — всё лучшее', 99, 0, 292030, 'Ведьмак 3: Дикая Охота — Обновлённое издание', true)
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name, sub = excluded.sub,
  price = excluded.price, disc = excluded.disc,
  cover_appid = excluded.cover_appid, cover_game = excluded.cover_game, active = excluded.active;

DELETE FROM pack_games WHERE pack_id = 6;
INSERT INTO pack_games (pack_id, game, appid) VALUES
  (6, '911 Operator', 503560),
  (6, 'Batman: The Enemy Within - The Telltale Series', 675260),
  (6, 'Batman: The Telltale Series', 278340),
  (6, 'BeamNG.drive', 284160),
  (6, 'Beholder', 475550),
  (6, 'Beyond: Two Souls', 960990),
  (6, 'Buckshot Roulette', 2835570),
  (6, 'Call of Duty', 2),
  (6, 'Car Mechanic Simulator 2018', 645630),
  (6, 'CloverPit', 3314790),
  (6, 'Detroit: Become Human', 1222140),
  (6, 'DOOM', 379720),
  (6, 'Goose Goose Duck', 1568590),
  (6, 'Heavy Rain', 960910),
  (6, 'Hollow Knight', 367520),
  (6, 'Hotline Miami 2: Wrong Number', 274170),
  (6, 'Injustice 2', 627270),
  (6, 'Little Nightmares', 424840),
  (6, 'Little Nightmares Enhanced Edition', 424840),
  (6, 'Little Nightmares II', 860510),
  (6, 'Mafia II: Definitive Edition', 1030830),
  (6, 'Metro 2033 Redux', 286690),
  (6, 'Metro: Last Light Redux', 287390),
  (6, 'Mortal Kombat 11', 976310),
  (6, 'Overcooked! 2', 728880),
  (6, 'PEAK', 3527290),
  (6, 'People Playground', 1118200),
  (6, 'Plants vs. Zombies: Game of the Year', 3590),
  (6, 'Rayman Origins', 207490),
  (6, 'Resident Evil 2', 883710),
  (6, 'Resident Evil 3', 952060),
  (6, 'RESIDENT EVIL RESISTANCE', 952070),
  (6, 'Scrap Mechanic', 387990),
  (6, 'Sifu', 2138710),
  (6, 'Slime Rancher', 433340),
  (6, 'Stick Fight: The Game', 674940),
  (6, 'Terraria', 105600),
  (6, 'The Walking Dead', 207610),
  (6, 'The Walking Dead: Season Two', 261030),
  (6, 'The Walking Dead: The Final Season', 866800),
  (6, 'Ведьмак 3: Дикая Охота — Обновлённое издание', 292030);

