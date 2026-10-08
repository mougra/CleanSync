-- Up Migration
-- Домен челленджей: марафон по дням с задачами и прогрессом пользователя.
-- Существующие schedules/tasks остаются фичей «свои задачи» и не затрагиваются.

CREATE TABLE IF NOT EXISTS challenges (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_url TEXT,
  season VARCHAR(50),
  days_count INT NOT NULL DEFAULT 0,
  tasks_count INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS challenge_days (
  id SERIAL PRIMARY KEY,
  challenge_id INT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  day_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255),
  UNIQUE (challenge_id, day_number)
);

CREATE TABLE IF NOT EXISTS challenge_tasks (
  id SERIAL PRIMARY KEY,
  challenge_day_id INT NOT NULL REFERENCES challenge_days(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  title VARCHAR(255) NOT NULL,
  hint VARCHAR(255),
  room VARCHAR(100),
  estimated_minutes INT NOT NULL DEFAULT 10,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS user_challenges (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id INT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  current_day INT NOT NULL DEFAULT 1,
  UNIQUE (user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS user_task_progress (
  id SERIAL PRIMARY KEY,
  user_challenge_id INT NOT NULL REFERENCES user_challenges(id) ON DELETE CASCADE,
  challenge_task_id INT NOT NULL REFERENCES challenge_tasks(id) ON DELETE CASCADE,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  done_at TIMESTAMP,
  UNIQUE (user_challenge_id, challenge_task_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_days_challenge ON challenge_days(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_tasks_day ON challenge_tasks(challenge_day_id);
CREATE INDEX IF NOT EXISTS idx_user_challenges_user ON user_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_task_progress_uc ON user_task_progress(user_challenge_id);

-- Down Migration
DROP TABLE IF EXISTS user_task_progress;
DROP TABLE IF EXISTS user_challenges;
DROP TABLE IF EXISTS challenge_tasks;
DROP TABLE IF EXISTS challenge_days;
DROP TABLE IF EXISTS challenges;
