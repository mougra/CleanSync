-- Up Migration
-- Завершение сезонного челленджа теперь означает «пройден»: статус completed
-- плюс отдельная отметка времени completed_at.
--
-- Почему это понадобилось. Раньше `POST /api/challenges/active/finish` писал
-- status = 'finished', а выборка «активного» челленджа искала status = 'active'.
-- Домену не хватало одного состояния: «пользователь закрыл челлендж текущего
-- сезона и до следующего сезона на главной его быть не должно». Отличить
-- «брошенный» от «пройденного до конца» по finished_at было нельзя, а главное —
-- приложение не могло понять, что сезонный челлендж уже закрыт, и предлагало
-- его заново.
--
-- Соглашение по значениям status в user_challenges (CHECK не ставим: колонка
-- свободная VARCHAR, исторические данные важнее формальности):
--   'active'    — пользователь начал, отметки открыты (создаётся автоматически
--                 при первой отметке задачи, отдельной кнопки «начать» нет);
--   'completed' — челлендж закрыт пользователем, на главной не показывается до
--                 следующего сезона, история отметок сохраняется.
-- Значение 'finished' остаётся только у старых записей, которые эта миграция
-- переводит в 'completed'.

ALTER TABLE user_challenges
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Переводим уже завершённые челленджи в новое состояние. finished_at был
-- проставлен в момент завершения, поэтому он и становится completed_at:
-- историю не теряем, а повторный запуск миграции ничего не меняет.
UPDATE user_challenges
   SET status = 'completed',
       completed_at = COALESCE(completed_at, finished_at, CURRENT_TIMESTAMP)
 WHERE status = 'finished';

-- Выборка челленджа текущего сезона и «мои челленджи» идут по паре
-- (user_id, status): индекс делает это дешёвым на растущей истории.
CREATE INDEX IF NOT EXISTS idx_user_challenges_user_status
  ON user_challenges(user_id, status);

-- Down Migration
-- Обратный перевод: 'completed' снова становится 'finished'. Разделить записи,
-- которые были 'finished' до миграции, а которые стали 'completed' в приложении,
-- уже нельзя — поэтому откат переводит все завершённые в старое значение.
-- finished_at сохраняется, так что данные не теряются.
UPDATE user_challenges
   SET status = 'finished',
       finished_at = COALESCE(finished_at, completed_at)
 WHERE status = 'completed';

DROP INDEX IF EXISTS idx_user_challenges_user_status;

ALTER TABLE user_challenges DROP COLUMN IF EXISTS completed_at;
