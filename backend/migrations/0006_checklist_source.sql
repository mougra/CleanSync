-- Up Migration
-- Чек-листы: связь пользовательского списка с публичным шаблоном.
-- Нужна, чтобы понимать «этот чек-лист уже добавлен» и показывать прогресс
-- по шаблону, из которого список скопирован.

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS source_template_id INT REFERENCES schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_source_template ON schedules(source_template_id);

-- Один и тот же шаблон можно взять себе только один раз.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_template_copy
  ON schedules(user_id, source_template_id)
  WHERE source_template_id IS NOT NULL;

-- Down Migration
DROP INDEX IF EXISTS uniq_user_template_copy;
DROP INDEX IF EXISTS idx_schedules_source_template;
ALTER TABLE schedules DROP COLUMN IF EXISTS source_template_id;
