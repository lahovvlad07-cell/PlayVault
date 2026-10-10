-- Патч 8: добавляем pack_id для промокодов типа "pack" (скидка на конкретный набор)
-- Выполни в Supabase SQL Editor
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS pack_id int references packs(id) on delete set null;
