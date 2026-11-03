-- Up Migration
-- Таймер уборки: сессии фактического времени.
--
-- Зачем своя таблица, а не поле у задачи. «Сделано» и «сколько заняло» — разные
-- факты: у задачи бывает несколько заходов, а уборка бывает и без задачи вовсе.
-- Поэтому запись живёт отдельно и лишь ссылается на задачу, если та известна;
-- название и зону сохраняем снимком на момент старта, чтобы переименование или
-- удаление задачи не меняло статистику за прошлые дни.
--
-- Время считается как `(ended_at − started_at) − paused_seconds`, поэтому пауза
-- не накручивает минуты. Активная сессия у человека одна — это гарантирует
-- частичный уникальный индекс (завершённых может быть сколько угодно).
CREATE TABLE IF NOT EXISTS focus_sessions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INT REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT,
  room TEXT,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_resumed_at timestamptz NOT NULL DEFAULT now(),
  paused_seconds INT NOT NULL DEFAULT 0 CHECK (paused_seconds >= 0),
  ended_at timestamptz,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'finished'))
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_started
  ON focus_sessions(user_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_focus_session_active
  ON focus_sessions(user_id)
  WHERE status <> 'finished';

-- Down Migration
DROP INDEX IF EXISTS uniq_focus_session_active;
DROP INDEX IF EXISTS idx_focus_sessions_user_started;
DROP TABLE IF EXISTS focus_sessions;
