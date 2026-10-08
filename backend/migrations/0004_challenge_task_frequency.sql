-- Up Migration
-- Частота повторения задачи внутри челленджа:
-- once | daily | every2days | weekly. Показывается меткой в строке задачи
-- и объясняет, почему одно и то же действие встречается в разные дни.

ALTER TABLE challenge_tasks
  ADD COLUMN IF NOT EXISTS frequency VARCHAR(20) NOT NULL DEFAULT 'once';

-- Down Migration
ALTER TABLE challenge_tasks DROP COLUMN IF EXISTS frequency;
