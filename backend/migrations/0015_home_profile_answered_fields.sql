-- Up Migration
-- Отметки о том, какие поля анкеты «Настройка по дому» человек заполнил явно.
--
-- Зачем. В 0010 все колонки ответов объявлены `NOT NULL DEFAULT`, поэтому
-- `GET /api/home-profile` отдаёт профиль уже с подставленными значениями по
-- умолчанию: отличить «человек выбрал» от «шаг пропустили» по ним невозможно,
-- и прогресс «N из 12» в интерфейсе было не на чем построить.
--
-- answered_fields хранит имена полей в camelCase — ровно так, как они приходят
-- в теле `PUT /api/home-profile` и как их отдаёт `GET`. Правило «шаг мастера →
-- поля» живёт на клиенте (`web/app/utils/homeSetupSteps.ts`), поэтому сервер
-- остаётся хранилищем фактов и ничего не знает про нумерацию шагов.
--
-- Список только растёт: повторный проход анкеты не должен терять ранее
-- отвеченные шаги. Порядок элементов — алфавитный, его задаёт SQL при
-- объединении (`array_agg(DISTINCT … ORDER BY …)` в routes/homeProfile.ts):
-- ответ API предсказуем, а проверки не зависят от порядка отправки полей.

ALTER TABLE home_profiles
  ADD COLUMN IF NOT EXISTS answered_fields TEXT[] NOT NULL DEFAULT '{}';

-- Пройденная анкета по определению требует ответа на все поля: `isComplete()`
-- в routes/homeProfile.ts ставит completed_at только когда заполнены все
-- четырнадцать. Такие строки появились до этой миграции, и без backfill у них
-- список остался бы пустым — то есть «пройдено 0 из 12» у готового профиля.
UPDATE home_profiles
   SET answered_fields = ARRAY[
     'housingType', 'rooms', 'composition', 'pets', 'outdoor',
     'hasKidsRoom', 'hasGarage', 'worksFromHome', 'drying', 'cleaningLevel',
     'dailyMinutes', 'cleaningStyle', 'cleaningDays', 'hardestZone'
   ]
 WHERE completed_at IS NOT NULL
   AND answered_fields = '{}';

-- Down Migration
-- Колонка не влияет ни на план, ни на «Мои задачи»: это только информация о
-- прогрессе, поэтому откат — просто удаление колонки.
ALTER TABLE home_profiles DROP COLUMN IF EXISTS answered_fields;
