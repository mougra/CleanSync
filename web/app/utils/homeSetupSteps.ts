import type { HomeProfile } from '~/types/homeProfile';

/**
 * Поля анкеты о доме: без служебных отметок вроде `completedAt`/`updatedAt`.
 * Совпадают с ключами, которые мастер отправляет в `PUT /api/home-profile`.
 */
export type HomeSetupField = keyof Omit<HomeProfile, 'completedAt' | 'updatedAt'>;

/**
 * Соответствие «шаг мастера „Настройка по дому“ → поля анкеты».
 *
 * Единственное место, где описан порядок шагов: мастер по нему сохраняет ответы,
 * а карточка-приглашение и строка настроек считают по нему прогресс «N из 11».
 * Держать это правило в разметке мастера нельзя — счётчик в карточке разошёлся
 * бы с ним при первой же правке шагов.
 *
 * Обратите внимание: шаг 6 — единственный с тремя полями (три вопроса «да/нет»),
 * поэтому шагов одиннадцать, а полей тринадцать.
 *
 * Вопрос «какая часть уборки даётся труднее всего» (`hardestZone`) из анкеты
 * убран: заказчик заметил, что он всё равно тянул план к кухне. Поле в ответе
 * API осталось (его пишет и читает сервер), но мастер его больше не спрашивает
 * и ни на что оно не влияет.
 */
export const HOME_SETUP_STEP_FIELDS: ReadonlyArray<readonly HomeSetupField[]> = [
  ['housingType'],
  ['rooms'],
  ['composition'],
  ['pets'],
  ['outdoor'],
  ['hasKidsRoom', 'hasGarage', 'worksFromHome'],
  ['drying'],
  ['cleaningLevel'],
  ['dailyMinutes'],
  ['cleaningStyle'],
  ['cleaningDays'],
];

/** Сколько всего шагов в мастере — знаменатель «N из 11». */
export const HOME_SETUP_STEP_COUNT = HOME_SETUP_STEP_FIELDS.length;

/**
 * Сколько шагов мастер уже прошёл.
 *
 * Шаг считается пройденным, когда человек ответил **хотя бы на одно** его поле:
 * «Пропустить» на шаге с тремя вопросами сохраняет только отвеченные, и это всё
 * равно пройденный шаг. Имена берутся из `answeredFields` — сервер копит их при
 * каждом `PUT`, поэтому пропущенный шаг в счёт не попадает, даже если в профиле
 * для него лежит значение по умолчанию.
 */
export const countAnsweredSteps = (answeredFields: readonly string[]): number => {
  const answered = new Set(answeredFields);

  return HOME_SETUP_STEP_FIELDS.filter((fields) => fields.some((field) => answered.has(field))).length;
};
