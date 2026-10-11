-- Up Migration
-- Уникальность позиции задачи внутри дня челленджа.
--
-- Зачем. Сид челленджей (`backend/seed-challenges.ts`) обновляет наполнение
-- на месте по ключу (challenge_day_id, position). Обновлять, а не пересоздавать,
-- обязательно: `user_task_progress.challenge_task_id` ссылается на задачу, и
-- удаление строк стёрло бы уже отмеченный прогресс пользователей. Для
-- `INSERT ... ON CONFLICT (challenge_day_id, position) DO UPDATE` нужен
-- уникальный индекс, а в схеме 0002 его не было — была обычная связь «задача
-- принадлежит дню».
--
-- Дубликаты позиций (если они где-то есть) сначала удаляются: иначе уникальный
-- индекс не создастся. Оставляем задачу с наименьшим id — она старше и на неё
-- с большей вероятностью ссылается прогресс; остальные удаляются каскадом
-- вместе со своими отметками. Прогресс по оставленной задаче не затрагивается.

DELETE FROM challenge_tasks t
 USING challenge_tasks keep
 WHERE t.challenge_day_id = keep.challenge_day_id
   AND t.position = keep.position
   AND t.id > keep.id;

-- Дни челленджа: уникальность (challenge_id, day_number) уже объявлена
-- UNIQUE-ограничением в 0002, но ON CONFLICT DO UPDATE требует именно
-- уникальный индекс — создаём его с тем же именем, каким его назвал Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS challenge_days_challenge_id_day_number_key
  ON challenge_days(challenge_id, day_number);

CREATE UNIQUE INDEX IF NOT EXISTS challenge_tasks_day_position_key
  ON challenge_tasks(challenge_day_id, position);

-- Down Migration
DROP INDEX IF EXISTS challenge_tasks_day_position_key;
DROP INDEX IF EXISTS challenge_days_challenge_id_day_number_key;
