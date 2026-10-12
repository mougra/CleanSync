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
 * а карточка-приглашение и строка настроек считают по нему прогресс «N из 10».
 * Держать это правило в разметке мастера нельзя — счётчик в карточке разошёлся
 * бы с ним при первой же правке шагов.
 *
 * Обратите внимание: шаг 6 — единственный с двумя полями (два вопроса «да/нет»),
 * поэтому шагов десять, а полей двенадцать.
 *
 * Два вопроса из анкеты убраны осознанно:
 *  - «какая часть уборки даётся труднее всего» (`hardestZone`) — он всё равно тянул
 *    план к кухне;
 *  - «есть ли гараж» (`hasGarage`) — заказчик попросил не спрашивать про гараж и не
 *    ставить задачи на гараж вовсе. Поле в ответе API осталось (сервер его читает),
 *    но мастер его больше не спрашивает, поэтому гаражных дел в наборе не будет.
 */
export const HOME_SETUP_STEP_FIELDS: ReadonlyArray<readonly HomeSetupField[]> = [
  ['housingType'],
  ['rooms'],
  ['composition'],
  ['pets'],
  ['outdoor'],
  ['hasKidsRoom', 'worksFromHome'],
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
