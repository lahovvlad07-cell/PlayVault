-- ══════════════════════════════════════════════
-- Pack 5: Horizon Collection
-- Выполнить в Supabase SQL Editor
-- Безопасно: можно запускать повторно
-- ══════════════════════════════════════════════

-- 1. Создать запись пака (если не существует)
INSERT INTO packs (id, name, sub, price, color, slots, stock, active)
VALUES (
  5,
  'Horizon Collection',
  'От BeamNG до GTA — симуляторы, выживание и открытый мир',
  79,
  '#1a6b3a',
  5,
  5,
  false  -- ← поменяй на true когда будешь готов активировать
)
ON CONFLICT (id) DO NOTHING;

-- 2. Очистить старые игры (для безопасного перезапуска)
DELETE FROM pack_games WHERE pack_id = 5;

-- 3. Добавить игры
INSERT INTO pack_games (pack_id, game, appid) VALUES
  (5, 'BeamNG.drive',                    284160),
  (5, 'Call of Duty',                    2),
  (5, 'Construction Simulator',          1273400),
  (5, 'GTA IV: The Complete Edition',    12210),
  (5, 'Graveyard Keeper',                599140),
  (5, 'Hello Neighbor',                  521890),
  (5, 'Resident Evil Village Gold Edition', 1196590),
  (5, 'SimRail - The Railway Simulator', 1422130),
  (5, 'Soccer Manager 2027',             0),      -- ⚠️ уточни AppID (см. ниже)
  (5, 'Sons of the Forest',              1326470),
  (5, 'Supermarket Together',            2689520),
  (5, 'The Long Drive',                  1017180),
  (5, 'The Sims 4',                      1222690);

-- ══════════════════════════════════════════════
-- ⚠️ Soccer Manager 2027 — AppID не найден автоматически.
-- Найди его на Steam: https://store.steampowered.com/search/?term=Soccer+Manager+2027
-- И обнови вручную:
--   UPDATE pack_games SET appid = XXXXX WHERE pack_id = 5 AND game = 'Soccer Manager 2027';
-- ══════════════════════════════════════════════
