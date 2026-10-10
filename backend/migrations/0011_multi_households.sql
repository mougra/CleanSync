-- Up Migration
-- Несколько домов у одного пользователя.
--
-- Раньше действовал уникальный индекс uniq_household_member(user_id): человек
-- мог состоять ровно в одном доме. Макет «Дома и участники» добавляет кнопку
-- «Добавить ещё один дом», поэтому ограничение снимаем. Роли остаются в
-- пределах дома: владелец одного дома может быть участником другого, и все
-- проверки прав должны идти по паре (household_id, user_id), а не по одному
-- user_id.

DROP INDEX IF EXISTS uniq_household_member;

-- Выборка домов пользователя и проверка членства идут по user_id
CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);

-- Down Migration
-- Откат возможен только на данных с одним домом на пользователя: если у кого-то
-- домов несколько, уникальный индекс не создастся и миграция упадёт — это лучше,
-- чем молча потерять членство.
DROP INDEX IF EXISTS idx_household_members_user;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_household_member ON household_members(user_id);
