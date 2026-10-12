-- Up Migration
-- Журнал отметок по дням: результат дня вместо результата задачи.
--
-- Зачем. До этой миграции «сделано» было свойством самой задачи
-- (`tasks.is_completed`), а не дня. Человек отмечал две задачи из четырёх
-- сегодня, открывал в календаре завтрашний день — и видел те же две задачи
-- закрытыми: у повторяющегося дела (daily/weekly/monthly) один флаг на всю
-- жизнь, поэтому «результат» переезжал из дня в день. Заказчик описал это так:
-- «Закрытые сегодня задачи видны закрытыми и в другие дни».
--
-- Что здесь лежит. Одна строка — одна отметка: (task_id, completed_on). Ключ
-- пары делает отметку идемпотентной: отметить дело дважды в один день нельзя, и
-- PUT /api/tasks/:id обновляет уже существующую строку, а не плодит вторую.
--
-- Кто пишет:
--   * PUT /api/tasks/:id (routes/tasks.ts) — отметка ставится и снимается ровно
--     на сегодняшнюю дату в UTC: тем же днём, которым считает выборка «Сегодня»
--     (`tasksDueOn`). При снятии отметки строка сегодняшнего дня удаляется —
--     прежние дни не трогаются, у них свой результат.
--   * POST /api/tasks/restore — возвращённая закрытая задача получает отметку на
--     дату своей `completed_at`: без неё повторяющееся дело после «Вернуть»
--     выглядело бы незакрытым, хотя человек его закрывал.
--
-- Кто читает: GET /api/tasks/today и GET /api/tasks/calendar?from&to
-- (routes/tasks.ts, помощник tasksDueOn). Для повторяющихся дел (daily/weekly/
-- monthly) признак `is_completed` в этих ответах берётся только из отметки на
-- запрошенный день; для разовых (once/due_date) — из отметки на дату дела или из
-- прежнего флага `tasks.is_completed` (разовое дело, сделанное однажды, остаётся
-- сделанным).
--
-- Прежние колонки `tasks.is_completed`, `completed_at`, `completed_by` остаются
-- и продолжают обновляться вместе с отметкой. На них сейчас держатся чужая
-- логика, которую эта задача не переписывает: личная серия (services/streak.ts),
-- достижения (services/achievementManager.ts), статистика (routes/analytics.ts) и
-- семейный режим (routes/household.ts). Они по-прежнему видят только последнюю
-- отметку задачи, а не журнал; перевод их на `task_completions` — следующий шаг.
--
-- `completed_by` без внешнего ключа: как и у `tasks.completed_by`, это ссылка на
-- users, и ON DELETE SET NULL здесь не нужен — удаление пользователя не должно
-- оставлять «висящую» отметку без автора, но и мешать удалению не должно
-- (у tasks.completed_by ключ есть с миграции 0008; здесь он намеренно не
-- дублируется, чтобы каскад удаления пользователя не трогал историю задач дома).
CREATE TABLE IF NOT EXISTS task_completions (
  id SERIAL PRIMARY KEY,
  task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_on DATE NOT NULL,
  completed_by INT,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (task_id, completed_on)
);

-- Индекс по задаче. Уникальный ключ (task_id, completed_on) уже начинается с
-- task_id и годится для выборки «отметки одной задачи», но отдельный индекс
-- делает это явным и дешёвым для планировщика, а заодно ускоряет каскадное
-- удаление: Postgres не создаёт индекс под внешний ключ автоматически.
CREATE INDEX IF NOT EXISTS idx_task_completions_task_id
  ON task_completions(task_id);

-- Индекс по дате. Именно по нему идут обе выборки журнала:
--   * «за день» — `WHERE completed_on = $1` (отметки на запрошенный день);
--   * «за период» — `WHERE completed_on BETWEEN $1 AND $2` (срезы вида «сколько
--     закрыто за неделю»).
-- Без него календарь на 42 дня перечитывал бы таблицу целиком на каждый день.
CREATE INDEX IF NOT EXISTS idx_task_completions_completed_on
  ON task_completions(completed_on);

-- Бэкфилл. У каждой закрытой задачи (is_completed = true) появляется отметка на
-- дату её `completed_at` — день, в который человек её и закрыл. Если дата пуста
-- (бывает у старых строк), отметка ставится на сегодня: другая дата была бы
-- выдумкой. `completed_by` переносится из задачи, чтобы автор отметки не потерялся.
--
-- Повторный запуск миграции ничего не меняет: ON CONFLICT DO NOTHING по паре
-- (task_id, completed_on). `completed_at::date` — дата по часовому поясу сервера,
-- ровно как её хранит колонка TIMESTAMP; дальше отметки ставит уже API, и там
-- день считается в UTC (`tasksDueOn`).
INSERT INTO task_completions (task_id, completed_on, completed_by, completed_at)
SELECT t.id,
       COALESCE(t.completed_at::date, CURRENT_DATE),
       t.completed_by,
       COALESCE(t.completed_at, CURRENT_TIMESTAMP)
  FROM tasks t
 WHERE t.is_completed = TRUE
ON CONFLICT (task_id, completed_on) DO NOTHING;

-- Down Migration
-- Откат убирает журнал целиком: отметки — производная информация от задач, а
-- прежние колонки `tasks.is_completed`, `completed_at`, `completed_by` при
-- откате остаются нетронутыми, потому что миграция их не меняла. После отката
-- «Сегодня» и календарь снова считают результат по флагу задачи — то поведение,
-- от которого журнал и заводили.
DROP INDEX IF EXISTS idx_task_completions_completed_on;
DROP INDEX IF EXISTS idx_task_completions_task_id;
DROP TABLE IF EXISTS task_completions;
