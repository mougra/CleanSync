-- Up Migration
-- Режим отпуска: человек уехал, уборкой не занимается, и серия за это время не рвётся.
--
-- Зачем отдельная таблица, а не флаг у пользователя. Нужны **дни** отпуска, а не
-- только «включено/выключено»: серия вычисляется из активности по дням
-- (services/streak.ts), и чтобы пропуск не разорвал её, надо знать, какие именно
-- дни были отпуском. Периоды хранятся и после окончания — по ним видно историю.
--
-- Открытый период — это `ended_on IS NULL`. Частичный уникальный индекс не даёт
-- завести два открытых отпуска одному человеку: повторное нажатие «включить» не
-- создаёт вторую строку, и это гарантирует база, а не код.
CREATE TABLE IF NOT EXISTS vacation_periods (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_on DATE NOT NULL,
  ended_on DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vacation_periods_user_id ON vacation_periods(user_id);

-- Один открытый отпуск на человека
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vacation_periods_open
  ON vacation_periods(user_id)
  WHERE ended_on IS NULL;

-- Down Migration
DROP INDEX IF EXISTS uniq_vacation_periods_open;
DROP INDEX IF EXISTS idx_vacation_periods_user_id;
DROP TABLE IF EXISTS vacation_periods;
