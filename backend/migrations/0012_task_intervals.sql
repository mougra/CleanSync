-- Up Migration
-- Периодичность «раз в N дней/недель/месяцев» и пометка источника задачи.
--
-- Макет «Добавление Задачи через кнопку» (docs/design/mockups/Добавление Задачи
-- через кнопку.jpg) задаёт частоту парой: сегменты «Один раз | Месяц | Неделя |
-- День» и счётчик «− N +». Раньше в tasks был только frequency, а интервал
-- подразумевался единичным, поэтому «раз в 3 месяца» выразить было нечем.
--
-- Значения frequency не меняются (once / daily / weekly / monthly): их читает
-- выборка «Сегодня» (backend/routes/tasks.ts). Для интервала больше единицы
-- опорой цикла служит due_date — дата первой постановки задачи.
--
-- source помечает, откуда задача взялась: 'home_profile_defaults' — собрана по
-- анкете «Настройка по дому». По этой пометке повторная сборка набора «Мои
-- задачи» не трогает задачи, которые пользователь уже изменил руками.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS interval_count INT NOT NULL DEFAULT 1;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source VARCHAR(50);

-- Ноль или отрицательный интервал означал бы «раз в 0 дней»: такой задачи
-- не должно быть ни в одном расписании.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_interval_count_positive'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_interval_count_positive CHECK (interval_count >= 1);
  END IF;
END $$;

-- Выборка «Сегодня» фильтрует задачи по частоте и интервалу
CREATE INDEX IF NOT EXISTS idx_tasks_frequency_interval ON tasks(frequency, interval_count);

-- Down Migration
DROP INDEX IF EXISTS idx_tasks_frequency_interval;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_interval_count_positive;
ALTER TABLE tasks DROP COLUMN IF EXISTS source;
ALTER TABLE tasks DROP COLUMN IF EXISTS interval_count;
