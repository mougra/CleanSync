-- Up Migration
-- Web Push: подписки браузеров на уведомления и отметка о последнем напоминании.
-- Один пользователь может подписаться с нескольких устройств, поэтому endpoint
-- уникален, а не user_id.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_success_at TIMESTAMP,
  last_error_at TIMESTAMP,
  failed_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- Чтобы одно и то же напоминание не уходило дважды в день.
ALTER TABLE user_habits
  ADD COLUMN IF NOT EXISTS last_reminded_on DATE;

-- Down Migration
ALTER TABLE user_habits DROP COLUMN IF EXISTS last_reminded_on;
DROP TABLE IF EXISTS push_subscriptions;
