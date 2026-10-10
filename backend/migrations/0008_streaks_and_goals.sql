-- Up Migration
-- Личная серия, заморозки и недельная цель.
--
-- Серия считается по «дням с уборкой»: любой закрытый пункт — своя задача,
-- задача челленджа, отметка привычки или задача семейного плана. Отдельной
-- таблицы под саму серию нет: она вычисляется из активности, а хранятся только
-- заморозки (которые «закрывают» пропущенный день) и цель на неделю.

CREATE TABLE IF NOT EXISTS user_streak_state (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  freezes_available INT NOT NULL DEFAULT 2,
  freezes_refilled_on DATE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Какие дни закрыты заморозкой: нужно, чтобы серия считалась одинаково
CREATE TABLE IF NOT EXISTS streak_freezes (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  covered_on DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, covered_on)
);

CREATE TABLE IF NOT EXISTS user_goals (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_days INT NOT NULL DEFAULT 5,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Кто именно закрыл задачу. Нужно дважды: для личной серии (в семейном плане
-- задачи общие) и для статистики «кто что делает» в доме.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_by INT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_completed_by ON tasks(completed_by);

-- Down Migration
DROP INDEX IF EXISTS idx_tasks_completed_by;
ALTER TABLE tasks DROP COLUMN IF EXISTS completed_by;
DROP TABLE IF EXISTS user_goals;
DROP TABLE IF EXISTS streak_freezes;
DROP TABLE IF EXISTS user_streak_state;
