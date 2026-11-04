-- Up Migration
-- Время напоминания о плане.
--
-- Раньше дневной пинг уходил строго в 19:00 по местному времени: час был
-- зашит в планировщик, и выбрать удобное время человек не мог. Теперь время
-- живёт в профиле, а планировщик сверяется с ним.
--
-- TIME, а не TEXT: значение приходит из <input type="time">, но хранится как
-- время, и `to_char(..., 'HH24:MI')` отдаёт его обратно в том же виде.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_time TIME NOT NULL DEFAULT '19:00';

-- Down Migration
ALTER TABLE users DROP COLUMN IF EXISTS notification_time;
