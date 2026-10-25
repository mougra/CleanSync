import type { HomeProfile } from '~/types/homeProfile';

/**
 * Поля анкеты о доме: без служебных отметок вроде `completedAt`/`updatedAt`.
 * Совпадают с ключами, которые мастер отправляет в `PUT /api/home-profile`.
 */
export type HomeSetupField = keyof Omit<HomeProfile, 'completedAt' | 'updatedAt'>;

/**
 * Соответствие «шаг мастера „Настройка по дому“ → поля анкеты».
 *
 * Единственное место, где описан порядок шагов: мастер по нему копирует ответы,
 * а карточка-приглашение и строка настроек считают по нему прогресс «N из 7».
 * Держать это правило в разметке мастера нельзя — счётчик в карточке разошёлся
 * бы с ним при первой же правке шагов.
 *
 * Шаг «помещения» — единственный с тремя полями: детская и гараж это два
 * `boolean`, а балкон и двор — значение `outdoor`. На экране это один
 * мультивыбор, поэтому шагов семь, а полей девять.
 *
 * Какие вопросы убраны и почему:
 *  - «какая часть уборки даётся труднее всего» (`hardestZone`) — он всё равно
 *    тянул план к кухне;
 *  - «есть ли гараж» (`hasGarage`) спрашивать отдельно перестали: теперь он
 *    часть шага «помещения»;
 *  - **«чем сушите бельё»** (`drying`), **«работаете из дома»** (`worksFromHome`)
 *    и **«какой у вас ритм»** (`cleaningStyle`) — заказчик попросил убрать:
 *    ответы почти не меняли набор, а шагов было три;
 *  - **«в какие дни убираетесь»** (`cleaningDays`) — тоже убрано: дела ставятся
 *    на каждый день (backend/services/homePlan.ts, `withDefaultAnswers`).
 *
 * Поля в ответе API остались: сервер их по-прежнему читает и подставляет
 * значения по умолчанию. Мастер их просто не спрашивает.
 */
export const HOME_SETUP_STEP_FIELDS: ReadonlyArray<readonly HomeSetupField[]> = [
  ['housingType'],
  ['rooms'],
  ['composition'],
  ['pets'],
  ['hasKidsRoom', 'outdoor', 'hasGarage'],
  ['cleaningLevel'],
  ['dailyMinutes'],
];

/** Сколько всего шагов в мастере — знаменатель «N из 7». */
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
