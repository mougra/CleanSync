-- Up Migration
-- Согласие на обработку персональных данных: фиксируем факт и время.
-- По 152-ФЗ оператор должен подтвердить, что согласие получено, а не просто
-- показать галочку в интерфейсе.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;

-- Down Migration
ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_at;
