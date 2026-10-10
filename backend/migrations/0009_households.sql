-- Up Migration
-- Семейный режим: дом, участники и общий план.
--
-- Дом — одна сущность на пользователя (у человека один дом в сервисе, так
-- интерфейс и права остаются понятными). Общий план — это расписания с
-- заполненным household_id: у них нет владельца-пользователя, доступ идёт
-- по членству в доме. Личные списки (user_id) работают как раньше.

CREATE TABLE IF NOT EXISTS households (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code VARCHAR(16) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id INT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (household_id, user_id)
);

-- Один дом на пользователя: упрощает и права, и интерфейс
CREATE UNIQUE INDEX IF NOT EXISTS uniq_household_member ON household_members(user_id);

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS household_id INT REFERENCES households(id) ON DELETE CASCADE;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS assignee_id INT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_household ON schedules(household_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);

-- Down Migration
DROP INDEX IF EXISTS idx_tasks_assignee;
DROP INDEX IF EXISTS idx_schedules_household;
ALTER TABLE tasks DROP COLUMN IF EXISTS assignee_id;
ALTER TABLE schedules DROP COLUMN IF EXISTS household_id;
DROP INDEX IF EXISTS uniq_household_member;
DROP TABLE IF EXISTS household_members;
DROP TABLE IF EXISTS households;
