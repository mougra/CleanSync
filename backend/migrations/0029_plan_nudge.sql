-- Up Migration
-- Дневное напоминание о плане (19:00 по часовому поясу человека).
--
-- Отметка об отправке отдельная от `digest_last_sent_at`: недельный дайджест и
-- дневной пинг живут в разных часах одного дня, и одна колонка на двоих
-- заставляла бы их вытеснять друг друга.
--
-- `digest_enabled` (миграция 0027) остаётся общим переключателем: и дайджест, и
-- пинг — это одна мысль «вспомни про план», и держать два переключателя в
-- настройках было бы лишним.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS nudge_last_sent_at timestamptz;

-- Down Migration
ALTER TABLE users DROP COLUMN IF EXISTS nudge_last_sent_at;
