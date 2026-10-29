import type { TaskCadence, TaskLevel } from './taskCatalog';

/**
 * Курируемые наборы задач: базовый и расширения по анкете.
 *
 * Почему отдельно от каталога (`services/taskCatalog.ts`). Каталог — библиотека
 * из трёхсот задач, из которой собираются страницы зон и SEO-контент. В план она
 * больше не идёт целиком: заказчик оставил курируемый список из 79 дел, который
 * видит даже гость, а остальное — библиотека для страниц.
 *
 * Три уровня:
 *  - `library` — `services/taskCatalog.ts`, источник страниц `/zones/:slug`;
 *  - `base` — 79 задач ниже, одинаковый набор для всех;
 *  - `extra` — 38 задач ниже, включаются ответами анкеты (животные, дети,
 *    балкон, двор, работа из дома).
 *
 * Правила наполнения (решения заказчика, 28 октября 2026):
 *  - частоты не удлиняются бюджетом: что стоит в строке, то и в расписании;
 *  - «раз в полтора месяца» — это 42 дня (`sixWeeks`), «раз в год» — 360;
 *  - средняя нагрузка базового набора 25–30 минут в день, потолок дня 40;
 *  - склеенные дела («подоконники», «двери», «зеркала») живут в зоне
 *    «По всему дому»;
 *  - расширения фильтруются **по конкретному животному**, а не общим тегом
 *    `pets`: иначе владелец кота получал ещё и аквариум.
 */

/** Одна задача набора: то, что генератор кладёт в расписание. */
export interface SetTask {
  task: string;
  room: string;
  minutes: number;
  level: TaskLevel;
  cadence: TaskCadence;
}

/**
 * Контекст, при котором задача-расширение попадает в набор.
 *
 * `pets_any` — общие дела про шерсть и переноску: подходят любому питомцу.
 * Остальные `pets_*` — конкретное животное из ответа анкеты.
 */
export type ExtraContext =
  | 'pets_any'
  | 'pets_cat'
  | 'pets_dog'
  | 'pets_fish'
  | 'pets_birds'
  | 'pets_rodents'
  | 'pets_reptiles'
  | 'kids'
  | 'balcony'
  | 'yard'
  | 'office';

export interface ExtraTask extends SetTask {
  contexts: readonly ExtraContext[];
}

/** Компактная строка базового набора: название, зона, минуты, уровень, частота. */
type BaseRow = readonly [string, string, number, TaskLevel, TaskCadence];

/** Компактная строка расширения: то же плюс контексты через запятую. */
type ExtraRow = readonly [string, string, number, TaskLevel, TaskCadence, string];

/**
 * Сколько дней длится один цикл каждой периодичности.
 *
 * Числа обязаны совпадать с `CADENCE_DAYS` генератора
 * (`services/defaultTasks.ts`): по ним считается и раскладка, и средняя
 * нагрузка. Разъедутся — «раз в год» снова станет полугодом.
 */
export const CADENCE_PERIOD_DAYS: Record<TaskCadence, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  threeWeeks: 21,
  sixWeeks: 42,
  monthly: 30,
  twoMonths: 60,
  quarterly: 90,
  fourMonths: 120,
  semiannual: 180,
  yearly: 360,
  twoYears: 720,
  threeYears: 1080,
  fourYears: 1440,
  fiveYears: 1800,
};

/**
 * Базовый набор — 79 задач, одинаковая для всех.
 *
 * Порядок строк: сначала частое, потом редкое; внутри группы — как в каталоге,
 * поскольку генератор разбирает строки сверху вниз и это же приоритет раскладки.
 */
const BASE_ROWS: readonly BaseRow[] = [
  // ── Раз в неделю ────────────────────────────────────────────────────────
  ['Протереть рабочие поверхности на кухне и убрать с них лишнее', 'Кухня', 12, 'normal', 'weekly'],
  ['Загрузить бельё в стиральную машину и запустить стирку', 'Ванная', 10, 'light', 'weekly'],
  ['Сменить постельное бельё', 'Спальня', 10, 'light', 'weekly'],
  ['Полить и опрыскать растения', 'По всему дому', 5, 'light', 'weekly'],
  ['Вымыть или пропылесосить полы во всей квартире', 'По всему дому', 20, 'normal', 'weekly'],

  // ── Раз в 2 недели ──────────────────────────────────────────────────────
  ['Протереть фартук и стену за плитой', 'Кухня', 12, 'light', 'biweekly'],
  ['Проверить сроки в холодильнике и выбросить просрочку', 'Кухня', 12, 'light', 'biweekly'],
  ['Почистить унитаз и раковину', 'Ванная', 12, 'normal', 'biweekly'],
  ['Вымыть ванну', 'Ванная', 12, 'normal', 'biweekly'],
  ['Заменить полотенца на свежие', 'Ванная', 5, 'light', 'biweekly'],
  ['Вымыть плиту и снять нагар с решёток', 'Кухня', 18, 'normal', 'biweekly'],
  ['Собрать вещи по комнатам и разложить по местам', 'По всему дому', 15, 'light', 'biweekly'],
  ['Ополоснуть раковину и смеситель на кухне', 'Кухня', 3, 'light', 'biweekly'],

  // ── Раз в 3 недели ──────────────────────────────────────────────────────
  ['Вымыть стаканчики и мыльницы', 'Ванная', 10, 'light', 'threeWeeks'],
  ['Протереть монитор и экраны', 'Кабинет', 8, 'light', 'threeWeeks'],
  ['Протереть подоконники', 'По всему дому', 15, 'light', 'threeWeeks'],
  ['Разобрать одну полку в шкафу', 'По всему дому', 20, 'normal', 'threeWeeks'],

  // ── Раз в месяц ─────────────────────────────────────────────────────────
  ['Пропылесосить диван и диванные подушки', 'Гостиная', 12, 'normal', 'monthly'],
  ['Убрать лишнее с горизонтальных поверхностей', 'По всему дому', 15, 'light', 'monthly'],
  ['Постирать коврик у ванны', 'Ванная', 10, 'normal', 'monthly'],
  ['Протереть входную дверь, ручки и выключатели', 'Прихожая', 15, 'light', 'monthly'],
  ['Протереть пыль на полках и рамках', 'По всему дому', 15, 'light', 'monthly'],
  ['Протереть зеркала', 'По всему дому', 12, 'light', 'monthly'],
  ['Протереть микроволновку внутри и снаружи', 'Кухня', 12, 'light', 'monthly'],
  ['Помыть мусорное ведро', 'Кухня', 12, 'normal', 'monthly'],
  ['Разобрать шкаф с посудой и убрать лишнее', 'Кухня', 20, 'normal', 'monthly'],

  // ── Раз в полтора месяца (42 дня) ───────────────────────────────────────
  ['Отмыть чайник и кофемашину от налёта', 'Кухня', 15, 'normal', 'sixWeeks'],
  ['Разобрать почту и выбросить рекламу', 'Прихожая', 5, 'light', 'sixWeeks'],
  ['Убрать пыль за техникой и под ней', 'Кабинет', 12, 'light', 'sixWeeks'],
  ['Помыть холодильник внутри', 'Кухня', 18, 'normal', 'sixWeeks'],

  // ── Раз в 2 месяца ──────────────────────────────────────────────────────
  ['Протереть клавиатуру и мышь', 'Кабинет', 8, 'light', 'twoMonths'],
  ['Протереть пульты', 'Гостиная', 5, 'light', 'twoMonths'],
  ['Протереть плинтусы', 'По всему дому', 15, 'light', 'twoMonths'],

  // ── Раз в 3 месяца ──────────────────────────────────────────────────────
  ['Прочистить вытяжку', 'Кухня', 18, 'normal', 'quarterly'],
  ['Протереть радиаторы', 'По всему дому', 15, 'light', 'quarterly'],
  ['Удалить налёт с душевой лейки', 'Ванная', 15, 'normal', 'quarterly'],
  ['Протереть кафель в душевой', 'Ванная', 15, 'normal', 'quarterly'],
  ['Отмыть смеситель от налёта', 'Ванная', 12, 'light', 'quarterly'],
  ['Убрать за мебелью и вдоль стен', 'По всему дому', 20, 'deep', 'quarterly'],
  ['Протереть технику: роутер, колонки, принтер', 'Кабинет', 12, 'light', 'quarterly'],
  ['Протереть светильники и люстры', 'По всему дому', 18, 'normal', 'quarterly'],
  ['Почистить духовку', 'Кухня', 20, 'normal', 'quarterly'],
  ['Вымыть стиральную машину: лоток, фильтр, манжету', 'Ванная', 18, 'normal', 'quarterly'],
  ['Разобрать тумбочку и выбросить лишнее', 'Спальня', 12, 'light', 'quarterly'],
  ['Постирать одеяло или покрывало', 'Спальня', 20, 'normal', 'quarterly'],
  ['Протереть двери шкафа снаружи', 'Спальня', 10, 'light', 'quarterly'],

  // ── Раз в 4 месяца ──────────────────────────────────────────────────────
  ['Разобрать ящик стола', 'Кабинет', 15, 'normal', 'fourMonths'],
  ['Пропылесосить матрасы во всех спальнях', 'Спальня', 20, 'normal', 'fourMonths'],
  ['Разобрать шкаф с одеждой и убрать несезонное', 'Спальня', 20, 'deep', 'fourMonths'],
  ['Почистить мягкую мебель', 'Гостиная', 20, 'deep', 'fourMonths'],

  // ── Раз в полгода ───────────────────────────────────────────────────────
  ['Разложить провода и закрепить их стяжками', 'Кабинет', 12, 'light', 'semiannual'],
  ['Разобрать вещи и выбросить ненужное', 'По всему дому', 20, 'normal', 'semiannual'],
  ['Разложить обувь по парам', 'Прихожая', 5, 'light', 'semiannual'],
  ['Протереть полку для обуви внутри', 'Прихожая', 10, 'light', 'semiannual'],
  ['Помыть окна изнутри и снаружи', 'По всему дому', 20, 'deep', 'semiannual'],
  ['Постирать занавеску для ванной', 'Ванная', 12, 'normal', 'semiannual'],
  ['Заменить зубные щётки и мочалку', 'Ванная', 5, 'light', 'semiannual'],
  ['Убрать 10 вещей из шкафа на отдачу', 'Спальня', 18, 'normal', 'semiannual'],
  ['Постирать мягкие игрушки', 'Детская', 20, 'normal', 'semiannual'],
  ['Помыть цветочные горшки и поддоны', 'Балкон', 15, 'light', 'semiannual'],
  ['Постирать шторы в комнатах', 'По всему дому', 15, 'normal', 'yearly'],
  ['Протереть фильтры кондиционера', 'По всему дому', 18, 'normal', 'semiannual'],
  ['Промыть слив и сифон на кухне', 'Кухня', 18, 'normal', 'semiannual'],
  ['Заменить фильтр для воды', 'Кухня', 5, 'light', 'semiannual'],
  ['Помыть пространство под ванной', 'Ванная', 20, 'deep', 'semiannual'],
  ['Почистить швы плитки в ванной', 'Ванная', 20, 'deep', 'semiannual'],
  ['Почистить обувную полку', 'Прихожая', 12, 'normal', 'semiannual'],
  ['Разобрать аптечку и убрать просроченные лекарства', 'Ванная', 15, 'light', 'semiannual'],
  ['Постирать подушки', 'Спальня', 18, 'normal', 'semiannual'],
  ['Проверить и подписать коробки с хранением', 'Балкон', 15, 'normal', 'semiannual'],
  ['Протереть стены и откосы от пыли', 'По всему дому', 18, 'normal', 'semiannual'],

  // ── Раз в год (360 дней) ────────────────────────────────────────────────
  ['Смазать петли и фурнитуру', 'По всему дому', 15, 'light', 'yearly'],
  ['Проверить дымовые датчики', 'По всему дому', 10, 'light', 'yearly'],
  ['Разобрать кладовку и антресоли', 'По всему дому', 20, 'deep', 'yearly'],
  ['Разобрать и вымыть все шкафы на кухне', 'Кухня', 20, 'deep', 'yearly'],
  ['Проверить герметик и затирку, обновить при необходимости', 'Ванная', 20, 'deep', 'yearly'],
  ['Перебрать содержимое шкафа и убрать лишнее', 'Спальня', 20, 'deep', 'yearly'],
  ['Разобрать лоток с документами', 'Кабинет', 20, 'normal', 'yearly'],
  ['Выбросить старые зарядки и кабели', 'Кабинет', 12, 'light', 'yearly'],
];

/**
 * Расширения — 38 задач, которые добавляются ответами анкеты.
 *
 * Частоты длиннее каталожных: это дополнение к базе, а не второй ежедневный
 * список. Питомцы разведены по животным — владелец кота не получает аквариум.
 */
const EXTRA_ROWS: readonly ExtraRow[] = [
  // ── Кошки ───────────────────────────────────────────────────────────────
  ['Вымыть лоток и заменить наполнитель', 'Ванная', 10, 'light', 'weekly', 'pets_cat'],
  ['Вымыть миски и фонтанчик для воды', 'Кухня', 10, 'light', 'weekly', 'pets_cat,pets_dog'],
  ['Собрать шерсть с дивана липким роликом', 'Гостиная', 10, 'light', 'biweekly', 'pets_cat,pets_dog'],
  ['Пропылесосить шерсть с мебели', 'Гостиная', 15, 'normal', 'biweekly', 'pets_cat,pets_dog'],

  // ── Собаки ──────────────────────────────────────────────────────────────
  ['Вычесать питомца и убрать шерсть', 'Гостиная', 12, 'light', 'weekly', 'pets_dog,pets_cat'],
  ['Помыть лапы после прогулки', 'Прихожая', 8, 'light', 'weekly', 'pets_dog'],

  // ── Рыбки ───────────────────────────────────────────────────────────────
  ['Почистить аквариум и заменить воду', 'Гостиная', 20, 'normal', 'biweekly', 'pets_fish'],
  ['Почистить фильтр аквариума', 'Гостиная', 18, 'normal', 'monthly', 'pets_fish'],

  // ── Птицы, грызуны, рептилии ────────────────────────────────────────────
  ['Почистить клетку птицы и поддон', 'Гостиная', 18, 'normal', 'weekly', 'pets_birds'],
  ['Почистить клетку грызуна', 'Гостиная', 20, 'normal', 'weekly', 'pets_rodents'],
  ['Почистить террариум', 'Гостиная', 20, 'normal', 'monthly', 'pets_reptiles'],

  // ── Питомцы, общее ──────────────────────────────────────────────────────
  ['Пропылесосить шерсть с ковра', 'По всему дому', 15, 'normal', 'biweekly', 'pets_any'],
  ['Помыть лежанку питомца', 'Гостиная', 18, 'normal', 'monthly', 'pets_any'],
  ['Постирать чехлы и пледы, на которых спит питомец', 'Гостиная', 20, 'normal', 'quarterly', 'pets_any'],
  ['Помыть переноску питомца', 'Прихожая', 18, 'normal', 'semiannual', 'pets_any'],

  // ── Детская ─────────────────────────────────────────────────────────────
  ['Протереть стол и стулья в детской', 'Детская', 12, 'light', 'weekly', 'kids'],
  ['Расставить книжки на полке', 'Детская', 10, 'light', 'weekly', 'kids'],
  ['Пропылесосить коврик в детской', 'Детская', 15, 'light', 'biweekly', 'kids'],
  ['Протереть игрушки влажной тряпкой', 'Детская', 18, 'normal', 'biweekly', 'kids'],
  ['Разобрать ящик с мелкими игрушками и выбросить сломанные', 'Детская', 18, 'normal', 'quarterly', 'kids'],
  ['Отобрать игрушки и одежду, из которых выросли', 'Детская', 20, 'normal', 'semiannual', 'kids'],

  // ── Балкон ──────────────────────────────────────────────────────────────
  ['Подмести пол на балконе', 'Балкон', 10, 'light', 'weekly', 'balcony'],
  ['Протереть перила на балконе', 'Балкон', 10, 'light', 'biweekly', 'balcony'],
  ['Вымыть пол на балконе', 'Балкон', 15, 'normal', 'monthly', 'balcony'],
  ['Протереть рамы на балконе', 'Балкон', 18, 'normal', 'quarterly', 'balcony'],
  ['Помыть остекление балкона изнутри', 'Балкон', 20, 'normal', 'quarterly', 'balcony'],
  ['Помыть остекление балкона снаружи', 'Балкон', 20, 'deep', 'semiannual', 'balcony'],

  // ── Двор и сад ──────────────────────────────────────────────────────────
  ['Подмести дорожку и крыльцо', 'Двор', 15, 'light', 'weekly', 'yard'],
  ['Проверить и убрать мусор во дворе', 'Двор', 12, 'light', 'weekly', 'yard'],
  ['Полить клумбы и грядки', 'Двор', 15, 'light', 'weekly', 'yard'],
  ['Прополоть клумбы и убрать сорняки', 'Двор', 20, 'normal', 'biweekly', 'yard'],
  ['Протереть садовую мебель', 'Двор', 15, 'light', 'monthly', 'yard'],
  ['Подмести и помыть беседку или террасу', 'Двор', 20, 'normal', 'monthly', 'yard'],
  ['Подстричь кусты и убрать обрезки', 'Двор', 20, 'normal', 'quarterly', 'yard'],
  ['Почистить водосточный жёлоб', 'Двор', 20, 'deep', 'semiannual', 'yard'],
  ['Проверить забор и калитку, подкрасить при необходимости', 'Двор', 20, 'deep', 'yearly', 'yard'],

  // ── Работа из дома ──────────────────────────────────────────────────────
  ['Постирать чехол кресла', 'Кабинет', 20, 'normal', 'semiannual', 'office'],
  ['Разобрать полку с книгами и документами', 'Кабинет', 20, 'normal', 'semiannual', 'office'],
];

/** Разбирает контексты из строки «через запятую» и проверяет их на известность. */
const KNOWN_CONTEXTS: ReadonlySet<string> = new Set<ExtraContext>([
  'pets_any',
  'pets_cat',
  'pets_dog',
  'pets_fish',
  'pets_birds',
  'pets_rodents',
  'pets_reptiles',
  'kids',
  'balcony',
  'yard',
  'office',
]);

const parseContexts = (value: string): ExtraContext[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is ExtraContext => KNOWN_CONTEXTS.has(item));

let baseCache: readonly SetTask[] | null = null;
let extraCache: readonly ExtraTask[] | null = null;

/** Базовый набор в объёме, который нужен генератору. */
export const getBaseTasks = (): readonly SetTask[] => {
  baseCache ??= BASE_ROWS.map(([task, room, minutes, level, cadence]) => ({
    task,
    room,
    minutes,
    level,
    cadence,
  }));

  return baseCache;
};

/** Расширения набора вместе с контекстами включения. */
export const getExtraTasks = (): readonly ExtraTask[] => {
  extraCache ??= EXTRA_ROWS.map(([task, room, minutes, level, cadence, contexts]) => ({
    task,
    room,
    minutes,
    level,
    cadence,
    contexts: parseContexts(contexts),
  }));

  return extraCache;
};

/** Что нужно знать о доме, чтобы включить расширения. */
export interface ExtraContextAnswers {
  pets: readonly string[];
  outdoor: string;
  hasKidsRoom: boolean;
  worksFromHome: boolean;
}

/** Ответы питомцев, которые считаются «есть питомец». */
const PET_VALUES: ReadonlySet<string> = new Set(['cats', 'dogs', 'fish', 'birds', 'reptiles', 'rodents']);

/**
 * Активные контексты по ответам анкеты.
 *
 * `pets_any` включается любым животным: шерсть и переноска есть у всех, кроме
 * рыбок и рептилий, но отдельная задача «переноска» рыбкам не вредит — она
 * появляется только вместе с остальными делами про питомца.
 */
export const activeExtraContexts = (answers: ExtraContextAnswers): ReadonlySet<ExtraContext> => {
  const active = new Set<ExtraContext>();
  const pets = new Set(answers.pets.filter((pet) => PET_VALUES.has(pet)));

  if (pets.size > 0) active.add('pets_any');
  if (pets.has('cats')) active.add('pets_cat');
  if (pets.has('dogs')) active.add('pets_dog');
  if (pets.has('fish')) active.add('pets_fish');
  if (pets.has('birds')) active.add('pets_birds');
  if (pets.has('rodents')) active.add('pets_rodents');
  if (pets.has('reptiles')) active.add('pets_reptiles');

  if (answers.hasKidsRoom) active.add('kids');
  if (answers.outdoor === 'balcony') active.add('balcony');
  if (answers.outdoor === 'yard') active.add('yard');
  if (answers.worksFromHome) active.add('office');

  return active;
};

/** Расширения, подходящие ответам: задача берётся, если активен любой её контекст. */
export const extrasFor = (answers: ExtraContextAnswers): readonly ExtraTask[] => {
  const active = activeExtraContexts(answers);

  return getExtraTasks().filter((task) => task.contexts.some((context) => active.has(context)));
};

/** Итоги набора: сколько задач, сколько минут и сколько это в среднем в день. */
export interface SetStats {
  totalTasks: number;
  totalMinutes: number;
  /** Средняя нагрузка в минутах в день: сумма минут, делить на цикл каждой задачи. */
  averagePerDay: number;
  byCadence: Record<TaskCadence, number>;
}

export const setStats = (tasks: readonly SetTask[]): SetStats => {
  const byCadence = Object.fromEntries(
    Object.keys(CADENCE_PERIOD_DAYS).map((cadence) => [cadence, 0]),
  ) as Record<TaskCadence, number>;

  let totalMinutes = 0;
  let perDay = 0;

  for (const task of tasks) {
    totalMinutes += task.minutes;
    perDay += task.minutes / CADENCE_PERIOD_DAYS[task.cadence];
    byCadence[task.cadence] += 1;
  }

  return {
    totalTasks: tasks.length,
    totalMinutes,
    averagePerDay: Math.round(perDay * 100) / 100,
    byCadence,
  };
};

/**
 * Проверка целостности наборов: сид и тесты падают здесь, а не на живом плане.
 *
 * Проверяем то, что ломает генератор незаметно: пустые поля, дубли названий
 * (ключ идемпотентности — название), минуты больше потолка каталога, неизвестную
 * частоту и контекст без оригинала.
 */
export const validateTaskSets = (): string[] => {
  const problems: string[] = [];
  const seen = new Set<string>();
  const knownCadences = new Set(Object.keys(CADENCE_PERIOD_DAYS));

  const check = (task: SetTask, contexts?: readonly string[]): void => {
    if (!task.task.trim()) problems.push('Пустое название задачи');
    if (!task.room.trim()) problems.push(`Без зоны: ${task.task}`);
    if (!Number.isFinite(task.minutes) || task.minutes <= 0) {
      problems.push(`Некорректное время: ${task.task}`);
    }
    if (task.minutes > 30) problems.push(`Задача длиннее 30 минут (${task.minutes}): ${task.task}`);
    if (!['light', 'normal', 'deep'].includes(task.level)) {
      problems.push(`Неизвестный уровень у задачи: ${task.task}`);
    }
    if (!knownCadences.has(task.cadence)) {
      problems.push(`Неизвестная периодичность «${task.cadence}»: ${task.task}`);
    }
    if (contexts && contexts.length === 0) {
      problems.push(`У расширения нет контекста: ${task.task}`);
    }
    if (seen.has(task.task)) problems.push(`Дубль названия между наборами: ${task.task}`);
    seen.add(task.task);
  };

  for (const task of getBaseTasks()) check(task);
  for (const task of getExtraTasks()) check(task, task.contexts);

  return problems;
};
