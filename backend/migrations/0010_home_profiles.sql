-- Up Migration
-- Анкета «Настройка по дому»: ответы пользователя о своём доме и ритме уборки.
--
-- Это конфигурация для генератора плана (backend/services/homePlan.ts), а не
-- сам план: сгенерированное расписание живёт в обычных schedules/tasks с
-- заголовком «План по дому». Профиль у пользователя один, поэтому user_id —
-- первичный ключ. Значения колонок совпадают с вариантами шагов макета
-- (docs/design/mockups/настройка по дому*.jpg); DEFAULT-ы описывают самый
-- типичный дом, чтобы план можно было собрать, даже если шаг пропустили.
--
-- Дни недели (cleaning_days) хранятся числами 0-6, где 0 — воскресенье:
-- ровно так же, как tasks.day_of_week и `GET /api/tasks/today` (getUTCDay).

CREATE TABLE IF NOT EXISTS home_profiles (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- 1. Тип жилья
  housing_type VARCHAR(20) NOT NULL DEFAULT 'apartment',
  -- 2. Примерно сколько комнат
  rooms VARCHAR(10) NOT NULL DEFAULT '3-4',
  -- 3. С кем живёте
  composition VARCHAR(20) NOT NULL DEFAULT 'alone',
  -- 4. Питомцы (мультивыбор; ['none'] — «нет питомцев»)
  pets TEXT[] NOT NULL DEFAULT '{}',
  -- 5. Балкон/терраса/двор
  outdoor VARCHAR(20) NOT NULL DEFAULT 'none',
  -- 6. Три подвопроса да/нет
  has_kids_room BOOLEAN NOT NULL DEFAULT FALSE,
  has_garage BOOLEAN NOT NULL DEFAULT FALSE,
  works_from_home BOOLEAN NOT NULL DEFAULT FALSE,
  -- 7. Как сушите вещи
  drying VARCHAR(20) NOT NULL DEFAULT 'air',
  -- 8. Уровень уборки
  cleaning_level VARCHAR(20) NOT NULL DEFAULT 'normal',
  -- 9. Сколько времени в день
  daily_minutes VARCHAR(20) NOT NULL DEFAULT '30to60',
  -- 10. Как любите убираться
  cleaning_style VARCHAR(20) NOT NULL DEFAULT 'varies',
  -- 11. Дни недели (0 — воскресенье, 6 — суббота)
  cleaning_days INT[] NOT NULL DEFAULT '{0,3,6}',
  -- 12. Что труднее всего
  hardest_zone VARCHAR(20) NOT NULL DEFAULT 'nothing',

  -- Проставляется, когда анкета пройдена: по нему интерфейс понимает,
  -- что мастер можно не показывать заново.
  completed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Down Migration
DROP TABLE IF EXISTS home_profiles;
