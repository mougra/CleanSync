-- Up Migration
-- Недельное письмо «план на неделю».
--
-- `digest_enabled` — согласие на письмо. По умолчанию TRUE: это сервисное
-- сообщение о собственном плане человека, а не реклама, и в каждом письме есть
-- ссылка отписки в один клик. Если письмо станет маркетинговым (рассылка,
-- партнёрские предложения), согласие придётся собирать отдельно — 152-ФЗ
-- требует явного согласия на рекламу, и тогда DEFAULT меняется на FALSE.
--
-- `digest_last_sent_at` — когда письмо ушло. Нужен, чтобы один человек не получил
-- два письма за неделю: планировщик проверяет условие «прошло больше шести дней»
-- и берёт только тех, у кого сейчас воскресенье 18:00 в его часовом поясе.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS digest_last_sent_at timestamptz;

-- Down Migration
ALTER TABLE users
  DROP COLUMN IF EXISTS digest_enabled,
  DROP COLUMN IF EXISTS digest_last_sent_at;
