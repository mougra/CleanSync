-- Up Migration
-- Английский контент в базе: переводы справочников и язык пользователя.
--
-- Зачем отдельные таблицы, а не колонки `title_en`. Справочников семь
-- (челленджи, их дни и задачи, достижения, привычки, шаблоны расписаний и их
-- задачи), языков со временем станет больше двух, а русские колонки остаются
-- языком по умолчанию и работают запасным вариантом при чтении:
-- `COALESCE(tr.title, base.title)`. Колонки `*_en` умножили бы число колонок на
-- число языков и не дали бы фолбэка: непереведённая строка показывалась бы
-- пустой вместо русской.
--
-- Почему переводов нет у пользовательских данных. Названия своих задач,
-- привычек, домов и зон человек написал сам — их не переводят, они и так
-- на его языке. Русские названия в этих таблицах остаются как есть, а таблицы
-- переводов касаются только контента, который приходит из сидов.
--
-- Язык пользователя (`users.locale`) нужен там, где интерфейса рядом нет:
-- письма, push-напоминания и генерация плана по дому. Часовой пояс — чтобы
-- «напоминание в 9:00» и дайджест считались по времени человека, а не сервера.
--
-- Значения `locale` проверяет код (zod в маршрутах), а не CHECK: добавить
-- третий язык тогда можно одной миграцией данных, без правки ограничения.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locale VARCHAR(5),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

COMMENT ON COLUMN users.locale IS 'Язык интерфейса и писем: ru | en. NULL = язык по умолчанию (ru)';
COMMENT ON COLUMN users.timezone IS 'Часовой пояс IANA, например Europe/Moscow. NULL = часовой пояс сервера';

-- Челленджи: название и описание карточки.
CREATE TABLE IF NOT EXISTS challenge_translations (
  challenge_id INT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  locale VARCHAR(5) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  PRIMARY KEY (challenge_id, locale)
);

-- Дни челленджа: заголовок дня и подзаголовок.
CREATE TABLE IF NOT EXISTS challenge_day_translations (
  challenge_day_id INT NOT NULL REFERENCES challenge_days(id) ON DELETE CASCADE,
  locale VARCHAR(5) NOT NULL,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255),
  PRIMARY KEY (challenge_day_id, locale)
);

-- Задачи челленджа: название, подсказка и зона.
CREATE TABLE IF NOT EXISTS challenge_task_translations (
  challenge_task_id INT NOT NULL REFERENCES challenge_tasks(id) ON DELETE CASCADE,
  locale VARCHAR(5) NOT NULL,
  title VARCHAR(255) NOT NULL,
  hint VARCHAR(255),
  room VARCHAR(100),
  PRIMARY KEY (challenge_task_id, locale)
);

-- Достижения: название и описание в списке и в тосте о получении.
CREATE TABLE IF NOT EXISTS achievement_translations (
  achievement_id INT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  locale VARCHAR(5) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  PRIMARY KEY (achievement_id, locale)
);

-- Шаблоны привычек из каталога.
CREATE TABLE IF NOT EXISTS habit_template_translations (
  habit_template_id INT NOT NULL REFERENCES habit_templates(id) ON DELETE CASCADE,
  locale VARCHAR(5) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  zone VARCHAR(120),
  PRIMARY KEY (habit_template_id, locale)
);

-- Шаблоны расписаний (сезонные челленджи и готовые чек-листы по комнатам).
CREATE TABLE IF NOT EXISTS schedule_translations (
  schedule_id INT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  locale VARCHAR(5) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  PRIMARY KEY (schedule_id, locale)
);

-- Пункты шаблонных расписаний. Переводы нужны только шаблонам: у задач
-- пользователя `schedule_id` указывает на его собственное расписание, и текст
-- там написан человеком.
CREATE TABLE IF NOT EXISTS task_translations (
  task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  locale VARCHAR(5) NOT NULL,
  title VARCHAR(255) NOT NULL,
  room VARCHAR(255),
  PRIMARY KEY (task_id, locale)
);

-- Down Migration
DROP TABLE IF EXISTS task_translations;
DROP TABLE IF EXISTS schedule_translations;
DROP TABLE IF EXISTS habit_template_translations;
DROP TABLE IF EXISTS achievement_translations;
DROP TABLE IF EXISTS challenge_task_translations;
DROP TABLE IF EXISTS challenge_day_translations;
DROP TABLE IF EXISTS challenge_translations;

ALTER TABLE users
  DROP COLUMN IF EXISTS timezone,
  DROP COLUMN IF EXISTS locale;
