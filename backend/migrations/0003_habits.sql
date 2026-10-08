-- Up Migration
-- Привычки: каталог готовых действий, личные привычки пользователя и отметки.
-- Категории держим строкой: их названия живут в i18n интерфейса.

CREATE TABLE IF NOT EXISTS habit_templates (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  icon VARCHAR(50),
  default_interval_count INT NOT NULL DEFAULT 1,
  default_interval_unit VARCHAR(20) NOT NULL DEFAULT 'day',
  zone VARCHAR(120),
  position INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_habits (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id INT REFERENCES habit_templates(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  zone VARCHAR(120),
  interval_count INT NOT NULL DEFAULT 1,
  interval_unit VARCHAR(20) NOT NULL DEFAULT 'day',
  due_date DATE,
  reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_time TIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS habit_completions (
  id SERIAL PRIMARY KEY,
  user_habit_id INT NOT NULL REFERENCES user_habits(id) ON DELETE CASCADE,
  completed_on DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_habit_id, completed_on)
);

CREATE INDEX IF NOT EXISTS idx_habit_templates_category ON habit_templates(category);
CREATE INDEX IF NOT EXISTS idx_user_habits_user ON user_habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habit_completions_habit ON habit_completions(user_habit_id);

-- Down Migration
DROP TABLE IF EXISTS habit_completions;
DROP TABLE IF EXISTS user_habits;
DROP TABLE IF EXISTS habit_templates;
