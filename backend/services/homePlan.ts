import {
  getTaskCatalog,
  MAX_CATALOG_TASK_MINUTES,
  TASK_TAG_LABELS,
  type CatalogTask,
  type TaskLevel,
  type TaskTag,
} from './taskCatalog';
import { DAY_BUDGET_MINUTES, dayBudget, MAX_DAILY_MINUTES } from './dailyBudget';

/**
 * Генератор недельного плана уборки по анкете «Настройка по дому».
 *
 * ВАЖНО, СОСТОЯНИЕ НА СЕГОДНЯ. Недельный план больше не создаётся: заказчик
 * оставил один источник задач — постоянный набор «Мои задачи»
 * (services/defaultTasks.ts). Маршрут завершения анкеты (routes/homeProfile.ts)
 * не вызывает `buildHomePlan` и не пишет расписание «План по дому»; уже
 * существующие планы переносятся в «Мои задачи» (services/mergePlanIntoTasks.ts).
 *
 * Модуль сохранён целиком и может вернуться как необязательная функция
 * («собрать план на неделю» по кнопке): генератор чистый, в базу не пишет, а
 * инвариант дневного бюджета для него продолжает проверяться
 * (scripts/check-default-tasks.ts, tests/dailyBudget.spec.ts). Удалять его не
 * нужно — вернуть кнопку дешевле, чем писать раскладку заново.
 *
 * Вход — ответы пользователя (та же форма, что в таблице home_profiles), выход —
 * расписание по дням недели с задачами и итогами. Функция чистая: она ничего не
 * пишет в базу, записью занимается маршрут (backend/routes/homeProfile.ts).
 *
 * Правила раскладки:
 *  1. Уровень уборки задаёт потолок нагрузки: light — только лёгкие задачи,
 *     normal — лёгкие и обычные, deep — весь каталог.
 *  2. Теги ответов включают тематические задачи: питомцы → pets, балкон →
 *     balcony, двор → yard, гараж → garage, детская → kids, работа из дома →
 *     office. Задачи с тегами, которых у пользователя нет, в план не попадают.
 *  3. Число комнат и состав семьи двигают объём: 1-2 комнаты и «только я» —
 *     меньше задач, 8+ и семья с детьми — больше и мельче.
 *  4. Стиль задаёт форму недели: often_small — 2-3 короткие задачи каждый
 *     выбранный день, all_at_once — 1-2 «блока» с большим набором, остальные
 *     дни легче, when_energy/varies — середина.
 *  5. Зона, которая даётся труднее всего, идёт в начало недели и получает
 *     больше задач — это «логичный принцип»: тяжёлое делается, пока есть силы,
 *     а не откладывается на конец недели.
 *  6. Способ сушки меняет формулировки про стирку: при сушке на воздухе это
 *     развешивание и съём белья с сушилки, при машине — фильтр и загрузка.
 *  7. Сумма минут дня не превышает дневной бюджет и никогда не больше 40 минут
 *     (under30 → 25, 30to60 → 40, 1to2h → 40, depends → 30). Числа бюджета
 *     берутся из общего модуля services/dailyBudget.ts — второй копии таблицы
 *     быть не должно. Бюджет плана — это бюджет **всех** сгенерированных дел
 *     дня: из него вычитается занятость набора «Мои задачи»
 *     (services/defaultTasks.ts), поэтому два генератора не складываются поверх
 *     общего лимита.
 *  8. Одна и та же задача не ставится два дня подряд: неделя остаётся
 *     разнообразной, а не превращается в «помыть пол» каждый день.
 */

// ── Типы ответов анкеты ────────────────────────────────────────────────────

export const HOUSING_TYPES = ['apartment', 'house', 'townhouse', 'studio', 'other'] as const;
export const ROOM_OPTIONS = ['1-2', '3-4', '5-7', '8+'] as const;
export const COMPOSITIONS = ['alone', 'partner', 'family_kids', 'roommates'] as const;
export const PET_OPTIONS = ['cats', 'dogs', 'fish', 'birds', 'reptiles', 'rodents', 'none'] as const;
export const OUTDOOR_OPTIONS = ['none', 'balcony', 'yard'] as const;
export const DRYING_OPTIONS = ['dryer', 'air', 'washer_dryer'] as const;
export const CLEANING_LEVELS = ['light', 'normal', 'deep'] as const;
export const DAILY_MINUTES_OPTIONS = ['under30', '30to60', '1to2h', 'depends'] as const;
export const CLEANING_STYLES = ['often_small', 'all_at_once', 'when_energy', 'varies'] as const;
export const HARDEST_ZONES = ['kitchen', 'bathroom', 'floors', 'tidiness', 'nothing'] as const;

export type HousingType = (typeof HOUSING_TYPES)[number];
export type RoomsOption = (typeof ROOM_OPTIONS)[number];
export type Composition = (typeof COMPOSITIONS)[number];
export type PetOption = (typeof PET_OPTIONS)[number];
export type OutdoorOption = (typeof OUTDOOR_OPTIONS)[number];
export type DryingOption = (typeof DRYING_OPTIONS)[number];
export type CleaningLevel = (typeof CLEANING_LEVELS)[number];
export type DailyMinutesOption = (typeof DAILY_MINUTES_OPTIONS)[number];
export type CleaningStyle = (typeof CLEANING_STYLES)[number];
export type HardestZone = (typeof HARDEST_ZONES)[number];

/** Ответы анкеты в форме, которой пользуется генератор. */
export interface HomeAnswers {
  housingType: HousingType;
  rooms: RoomsOption;
  composition: Composition;
  pets: PetOption[];
  outdoor: OutdoorOption;
  hasKidsRoom: boolean;
  hasGarage: boolean;
  worksFromHome: boolean;
  drying: DryingOption;
  cleaningLevel: CleaningLevel;
  dailyMinutes: DailyMinutesOption;
  cleaningStyle: CleaningStyle;
  /** Дни недели числами 0-6, где 0 — воскресенье. */
  cleaningDays: number[];
  hardestZone: HardestZone;
}

/** Ответы, которых может не быть: незаполненные шаги берут значения по умолчанию. */
export type PartialHomeAnswers = Partial<HomeAnswers>;

/** Значения по умолчанию: самый обычный дом, чтобы план собрался на любом шаге. */
export const DEFAULT_HOME_ANSWERS: HomeAnswers = {
  housingType: 'apartment',
  rooms: '3-4',
  composition: 'alone',
  pets: [],
  outdoor: 'none',
  hasKidsRoom: false,
  hasGarage: false,
  worksFromHome: false,
  drying: 'air',
  cleaningLevel: 'normal',
  dailyMinutes: '30to60',
  cleaningStyle: 'varies',
  cleaningDays: [1, 3, 6],
  hardestZone: 'nothing',
};

/**
 * Дополняет частичные ответы значениями по умолчанию.
 *
 * Явные `undefined` в объекте пропускаются: «поля нет» и «поле равно undefined»
 * означают одно и то же — шаг мастера не заполнен, — а спред такого значения
 * затёр бы умолчание пустотой (это ломало бы чтение строки home_profiles, где
 * колонки могут прийти NULL).
 */
export const withDefaultAnswers = (input: PartialHomeAnswers): HomeAnswers => {
  const provided = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as PartialHomeAnswers;

  return {
    ...DEFAULT_HOME_ANSWERS,
    ...provided,
    pets: input.pets && input.pets.length > 0 ? input.pets : DEFAULT_HOME_ANSWERS.pets,
    cleaningDays:
      input.cleaningDays && input.cleaningDays.length > 0
        ? input.cleaningDays
        : DEFAULT_HOME_ANSWERS.cleaningDays,
  };
};

/**
 * Строка `home_profiles` в форме ответов анкеты (колонки snake_case).
 *
 * Недостающие и незаполненные ответы добираются значениями по умолчанию — ровно
 * так же, как их трактует генератор. Помощник нужен, чтобы чтение анкеты было
 * одним и тем же в маршруте (routes/homeProfile.ts) и в переносе задач
 * (services/mergePlanIntoTasks.ts): второй копии этого сопоставления быть не
 * должно, иначе набор и перенос разойдутся по ответам.
 */
export interface StoredHomeAnswers {
  housing_type: string | null;
  rooms: string | null;
  composition: string | null;
  pets: string[] | null;
  outdoor: string | null;
  has_kids_room: boolean | null;
  has_garage: boolean | null;
  works_from_home: boolean | null;
  drying: string | null;
  cleaning_level: string | null;
  daily_minutes: string | null;
  cleaning_style: string | null;
  cleaning_days: number[] | null;
  hardest_zone: string | null;
}

export const answersFromStoredRow = (row: StoredHomeAnswers): HomeAnswers =>
  withDefaultAnswers({
    housingType: (row.housing_type ?? undefined) as PartialHomeAnswers['housingType'],
    rooms: (row.rooms ?? undefined) as PartialHomeAnswers['rooms'],
    composition: (row.composition ?? undefined) as PartialHomeAnswers['composition'],
    pets: (row.pets ?? []) as PartialHomeAnswers['pets'],
    outdoor: (row.outdoor ?? undefined) as PartialHomeAnswers['outdoor'],
    hasKidsRoom: row.has_kids_room ?? undefined,
    hasGarage: row.has_garage ?? undefined,
    worksFromHome: row.works_from_home ?? undefined,
    drying: (row.drying ?? undefined) as PartialHomeAnswers['drying'],
    cleaningLevel: (row.cleaning_level ?? undefined) as PartialHomeAnswers['cleaningLevel'],
    dailyMinutes: (row.daily_minutes ?? undefined) as PartialHomeAnswers['dailyMinutes'],
    cleaningStyle: (row.cleaning_style ?? undefined) as PartialHomeAnswers['cleaningStyle'],
    cleaningDays: row.cleaning_days ?? [],
    hardestZone: (row.hardest_zone ?? undefined) as PartialHomeAnswers['hardestZone'],
  });

// ── Типы результата ────────────────────────────────────────────────────────

export interface PlannedTask {
  /** Позиция задачи в рамках дня: по ней интерфейс строит нумерацию. */
  position: number;
  title: string;
  room: string;
  estimatedMinutes: number;
  level: TaskLevel;
  tags: TaskTag[];
}

export interface PlannedDay {
  /** День недели: 0 — воскресенье, 6 — суббота (как tasks.day_of_week). */
  dayOfWeek: number;
  label: string;
  selected: boolean;
  totalTasks: number;
  totalMinutes: number;
  tasks: PlannedTask[];
}

export interface HomePlan {
  title: string;
  level: CleaningLevel;
  /** Логичный принцип: с какой зоны начинается неделя. */
  focusZone: string | null;
  days: PlannedDay[];
  summary: {
    totalTasks: number;
    totalMinutes: number;
    activeDays: number;
    minutesPerDay: number;
    dailyBudget: number;
    rooms: string[];
    tags: TaskTag[];
    notes: string[];
  };
}

// ── Константы раскладки ────────────────────────────────────────────────────

/**
 * Дневной бюджет времени: сколько минут в день человек готов тратить.
 *
 * Сами числа живут в services/dailyBudget.ts — общий источник правды для обоих
 * генераторов (иначе таблицы снова разъедутся, а сумма дня выйдет за лимит).
 * Здесь только совместимый реэкспорт: модуль исторически был точкой входа для
 * этих чисел. Потолок — 40 минут: задачи раздроблены до 3-25 минут, и «убрать
 * всю квартиру за раз» больше не помещается в один день (правило раскладки 7).
 */
export { DAY_BUDGET_MINUTES as DAILY_BUDGET, MAX_DAILY_MINUTES };

/**
 * Пометка источника у задач недельного плана.
 *
 * План целиком генерируется сервером (schedule «План по дому»), поэтому все его
 * задачи помечаются `source = 'home_plan'` — иначе сгенерированное неотличимо от
 * созданного руками, и ни пересборку, ни статистику по источникам построить
 * нельзя. У постоянного набора «Мои задачи» пометка своя
 * (`home_profile_defaults`, services/defaultTasks.ts).
 */
export const HOME_PLAN_SOURCE = 'home_plan';

/**
 * Максимальная длительность одной задачи по уровню уборки.
 *
 * Ни одна задача каталога не длиннее MAX_CATALOG_TASK_MINUTES: длинные дела
 * раздроблены на шаги, поэтому и потолок уровня упирается в то же число.
 */
const MAX_TASK_MINUTES: Record<CleaningLevel, number> = {
  light: 15,
  normal: 20,
  deep: MAX_CATALOG_TASK_MINUTES,
};

/** Сколько задач стараемся поставить в день — от уровня уборки. */
const TASKS_PER_DAY: Record<CleaningLevel, [number, number]> = {
  light: [2, 4],
  normal: [3, 6],
  deep: [4, 7],
};

const TIER_SCORE: Record<TaskLevel, number> = { light: 0, normal: 1, deep: 2 };

export const WEEK_DAYS: ReadonlyArray<{ dayOfWeek: number; label: string }> = [
  { dayOfWeek: 1, label: 'Понедельник' },
  { dayOfWeek: 2, label: 'Вторник' },
  { dayOfWeek: 3, label: 'Среда' },
  { dayOfWeek: 4, label: 'Четверг' },
  { dayOfWeek: 5, label: 'Пятница' },
  { dayOfWeek: 6, label: 'Суббота' },
  { dayOfWeek: 0, label: 'Воскресенье' },
];

/** Темы «что труднее всего» и зона, которую они подсвечивают. */
const HARDEST_ZONE_LABELS: Record<HardestZone, string | null> = {
  kitchen: 'Кухня',
  bathroom: 'Ванная',
  floors: 'Полы',
  tidiness: 'Порядок',
  nothing: null,
};

/**
 * Подпись «трудной» зоны для ответа анкеты.
 *
 * Экспортируется: набор «Мои задачи» больше не строится вокруг фокусной зоны, но
 * финальный экран мастера показывает выбранную человеком зону (routes/homeProfile.ts),
 * поэтому подпись нужна и без недельного плана.
 */
export const focusZoneLabel = (hardestZone: HardestZone): string | null =>
  HARDEST_ZONE_LABELS[hardestZone];

/**
 * Задачи какого уровня допустимы при выбранном уровне уборки.
 *
 * Экспортируется: постоянный набор «Мои задачи» (services/defaultTasks.ts)
 * фильтрует каталог по тому же правилу, и второй копии быть не должно.
 */
export const allowedLevels = (level: CleaningLevel): TaskLevel[] => {
  if (level === 'light') return ['light'];
  if (level === 'normal') return ['light', 'normal'];
  return ['light', 'normal', 'deep'];
};

// ── Отбор кандидатов ───────────────────────────────────────────────────────

/** Тематические теги, которые включает анкета. */
export const CONTEXT_TAGS: readonly TaskTag[] = ['pets', 'balcony', 'yard', 'garage', 'kids', 'office'];

/**
 * Тематические теги, которые включает анкета.
 *
 * Экспортируется: и недельный план, и постоянный набор «Мои задачи»
 * (services/defaultTasks.ts) включают контекстные задачи по одному правилу.
 */
export const activeHomeTags = (answers: HomeAnswers): TaskTag[] => {
  const tags: TaskTag[] = [];

  if (answers.pets.some((pet) => pet !== 'none')) tags.push('pets');
  if (answers.outdoor === 'balcony') tags.push('balcony');
  if (answers.outdoor === 'yard') tags.push('yard');
  if (answers.hasGarage) tags.push('garage');
  if (answers.hasKidsRoom) tags.push('kids');
  if (answers.worksFromHome) tags.push('office');

  return tags;
};

/**
 * Попадает ли задача под «трудную» зону пользователя.
 * Такие задачи идут в начало недели, поэтому нужен точный признак.
 */
const isFocusTask = (task: CatalogTask, hardestZone: HardestZone): boolean => {
  if (hardestZone === 'kitchen') return task.room === 'Кухня';
  if (hardestZone === 'bathroom') return task.room === 'Ванная';
  if (hardestZone === 'floors') return task.room === 'По всему дому';
  if (hardestZone === 'tidiness') return task.tags.includes('declutter');
  return false;
};

/**
 * Сколько задач закладывать в день: комнаты и состав семьи двигают объём.
 *
 * 1-2 комнаты и «только я» — меньше дел; 8+ и семья с детьми — больше, причём
 * у семьи шаг мельче: задач много, но каждая короткая, иначе день не закрыть.
 */
const taskBudgetFor = (answers: HomeAnswers): { min: number; max: number } => {
  const [baseMin, baseMax] = TASKS_PER_DAY[answers.cleaningLevel];

  const roomScale: Record<RoomsOption, number> = { '1-2': -1, '3-4': 0, '5-7': 1, '8+': 2 };
  const compositionScale: Record<Composition, number> = {
    alone: -1,
    partner: 0,
    family_kids: 1,
    roommates: 1,
  };

  const scale = roomScale[answers.rooms] + compositionScale[answers.composition];

  return {
    min: Math.max(1, baseMin + Math.min(0, scale)),
    max: Math.max(2, baseMax + scale),
  };
};

/**
 * Подходит ли задача ответам анкеты.
 *
 * Тематические теги — жёсткий фильтр: лежанку кота не предлагаем тем, у кого
 * кота нет. Стирка фильтруется мягко, по способу сушки (см. preparePool).
 */
const isCandidate = (task: CatalogTask, answers: HomeAnswers, level: CleaningLevel): boolean => {
  if (!allowedLevels(level).includes(task.level)) return false;
  if (task.minutes > MAX_TASK_MINUTES[level]) return false;

  const needs = task.tags.filter((tag) => CONTEXT_TAGS.includes(tag));

  if (needs.length === 0) return true;

  const have = activeHomeTags(answers);

  // Достаточно одного совпавшего тега: задача про шерсть подходит и с кошкой,
  // и с собакой — конкретика в тексте, а не в теге.
  return needs.some((tag) => have.includes(tag));
};

/**
 * Пул кандидатов: только подходящие по ответам задачи, отсортированные так,
 * чтобы первыми в план попадали самые нужные.
 */
const preparePool = (answers: HomeAnswers): CatalogTask[] => {
  const level = answers.cleaningLevel;
  const suitable = getTaskCatalog().filter((task) => isCandidate(task, answers, level));

  const needsDryAir = answers.drying === 'air';
  const needsDryMachine = answers.drying === 'dryer' || answers.drying === 'washer_dryer';

  /**
   * Стирка под способ сушки. Общие задачи про стирку (без пометки) подходят
   * всем, а «развесить на воздухе» при сушильной машине не предлагаем.
   */
  const matchesDrying = (task: CatalogTask): boolean => {
    if (!task.tags.includes('laundry')) return true;
    if (task.tags.includes('dry_air') && !needsDryAir) return false;
    if (task.tags.includes('dry_machine') && !needsDryMachine) return false;
    return true;
  };

  const relevant = suitable.filter(matchesDrying);

  // Если под способ сушки не осталось ничего, лучше дать общую задачу про
  // стирку, чем оставить неделю совсем без неё.
  const preferred = relevant.length > 0 ? relevant : suitable;

  /** Питомцы: у пользователя может быть и кошка, и собака — точный тег важнее. */
  const petKinds = answers.pets.filter((pet) => pet !== 'none');
  const petWords: Partial<Record<PetOption, string>> = {
    cats: 'кот',
    dogs: 'собак',
    fish: 'аквариум',
    birds: 'птиц',
    rodents: 'грызун',
    reptiles: 'террариум',
  };

  const petRank = (task: CatalogTask): number => {
    if (!task.tags.includes('pets') || petKinds.length === 0) return 0;

    const lower = task.task.toLowerCase();
    const matched = petKinds.some((pet) => {
      const word = petWords[pet];
      return Boolean(word) && lower.includes(word as string);
    });

    return matched ? 0 : 0.5;
  };

  /** Насколько задача соответствует выбранному уровню уборки. */
  const difficulty = (task: CatalogTask): number => {
    if (level === 'normal') return task.level === 'normal' ? 0 : 0.5;
    if (level === 'deep') return 1 - TIER_SCORE[task.level] / 4;
    return 1;
  };

  /** Подсветка трудной зоны: такие задачи должны идти первыми. */
  const focusRank = (task: CatalogTask): number =>
    answers.hardestZone === 'nothing' ? 1 : isFocusTask(task, answers.hardestZone) ? 0 : 1;

  return preferred
    .map((task) => ({
      task,
      score: difficulty(task) + petRank(task) + focusRank(task),
    }))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      // Внутри равных по важности — короткие задачи вперёд: так проще собрать
      // «понемногу, но часто» и не раздувать день одной длинной задачей.
      if (left.task.minutes !== right.task.minutes) return left.task.minutes - right.task.minutes;
      // Дальше — по числу тегов: чем больше контекста, тем нужнее задача.
      return right.task.tags.length - left.task.tags.length;
    })
    .map((entry) => entry.task);
};

// ── Раскладка по дням ──────────────────────────────────────────────────────

/**
 * Порядок дней недели для раскладки: сначала понедельник, воскресенье в конце.
 *
 * Экспортируется: «Мои задачи» раскладывают недельные дела по тем же дням и в
 * том же порядке, что и недельный план.
 */
export const orderWeekDays = (days: number[]): number[] => {
  const unique = [...new Set(days)].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const ordered = WEEK_DAYS.map((item) => item.dayOfWeek).filter((day) => unique.includes(day));

  return ordered.length > 0 ? ordered : [...DEFAULT_HOME_ANSWERS.cleaningDays];
};

interface DayShape {
  day: number;
  /** Дневной лимит минут: не больше бюджета пользователя. */
  minutes: number;
  maxTaskMinutes: number;
  maxTasks: number;
}

/**
 * Форма недели: у каждого дня свой дневной лимит минут и предел на задачу.
 *
 * Дневной бюджет — обещание пользователю, поэтому сумма **всех** сгенерированных
 * дел дня никогда его не превышает. На вход приходит `leftover` — остаток
 * бюджета каждого выбранного дня после задач набора «Мои задачи»
 * (services/defaultTasks.ts): второй генератор не должен складывать свои минуты
 * поверх общего лимита. Стиль меняет не потолок, а распределение недели:
 *  - often_small — ровные дни по 2-3 коротких дела, без «блоков»;
 *  - all_at_once — человек убирается редко, но помногу: 1-2 дня забирают
 *    большую часть недельного времени, остальные получают минимум;
 *  - when_energy и varies — середина: первый день чуть тяжелее остальных.
 *
 * День, у которого не осталось свободного времени, попадает в раскладку с нулём:
 * план в него ничего не добавляет, и это нормальное состояние, а не ошибка
 * (бюджет ограничивает генерацию, а не доступные человеку дела).
 */
const shapeWeek = (
  answers: HomeAnswers,
  days: number[],
  leftover: ReadonlyMap<number, number>
): DayShape[] => {
  const budgetForTasks = taskBudgetFor(answers);
  const level = answers.cleaningLevel;
  const style = answers.cleaningStyle;
  /**
   * Остаток дня для плана: бюджет дня минус занятость набора «Мои задачи».
   *
   * Ноль остаётся нулём — план в этот день ничего не добавляет, и это нормально:
   * задачи на день у человека уже есть, а бюджет ограничивает генерацию, а не
   * доступные дела. Досыпать «хоть что-нибудь» сверх остатка нельзя: именно так
   * и получалось 53 минуты в день при ответе «до 30 минут».
   */
  const free = (day: number): number => Math.max(0, leftover.get(day) ?? 0);

  if (style === 'often_small') {
    return days.map((day) => ({
      day,
      minutes: free(day),
      maxTaskMinutes: MAX_TASK_MINUTES[level],
      maxTasks: Math.max(budgetForTasks.min, 3),
    }));
  }

  if (style === 'all_at_once') {
    const blockDays = Math.min(days.length >= 4 ? 2 : 1, days.length);
    // «Блок» получает больше времени за счёт остальных дней недели, но не сверх
    // бюджета: распределяем ровно то, что доступно в выбранные дни.
    const weekBudget = days.reduce((sum, day) => sum + free(day), 0);
    /**
     * Дни «блока» считаются только те, у которых остался хоть какой-то запас.
     *
     * Раньше бюджет блока делился на число первых дней недели, и день с нулевым
     * остатком всё равно получал свою долю — то есть план выходил за бюджет дня
     * (замер: 12 занято набором, 3 добавил план при бюджете 25 дали 28 минут).
     * Это ровно то, что инвариант дневного бюджета запрещает.
     */
    const blockWithRoom = days.slice(0, blockDays).filter((day) => free(day) > 0);
    const blockBudget = blockWithRoom.reduce((sum, day) => sum + free(day), 0);
    const perBlock = blockWithRoom.length > 0 ? Math.floor(blockBudget / blockWithRoom.length) : 0;
    // Остаток недели делим только между днями, у которых есть свободное время:
    // иначе полный день получил бы лимит впустую, а другому не хватило.
    const lightWithRoom = days.slice(blockDays).filter((day) => free(day) > 0);
    const perLight =
      lightWithRoom.length > 0
        ? Math.floor(
            Math.max(0, weekBudget - perBlock * blockWithRoom.length) / lightWithRoom.length
          )
        : 0;

    return days.map((day, index) => {
      const isBlock = index < blockDays && perBlock > 0 && free(day) > 0;

      return {
        day,
        // Доля блока тоже упирается в остаток **своего** дня: обещание бюджета
        // важнее того, чтобы блок был ровно таким, как задумано стилем.
        minutes: isBlock
          ? Math.min(perBlock, free(day))
          : free(day) > 0
            ? Math.min(free(day), perLight)
            : 0,
        maxTaskMinutes: isBlock ? MAX_TASK_MINUTES[level] : Math.min(20, MAX_TASK_MINUTES[level]),
        maxTasks: isBlock ? Math.max(budgetForTasks.max, 5) : Math.max(budgetForTasks.min - 1, 2),
      };
    });
  }

  return days.map((day, index) => ({
    day,
    // Первому дню недели — право на чуть больше дел, но не больше бюджета дня.
    minutes: free(day),
    maxTaskMinutes: level === 'light' ? 15 : MAX_TASK_MINUTES[level],
    maxTasks: budgetForTasks.max + (index === 0 ? 1 : 0),
  }));
};

interface DayPick {
  day: number;
  tasks: CatalogTask[];
  /** Кончились подходящие задачи, а не время: по этому признаку честно предупреждаем. */
  ranDry: boolean;
}

/**
 * Выбирает задачи на один день из уже упорядоченного списка кандидатов.
 *
 * Порядок кандидатов задаёт вызывающий: он же отвечает за то, чтобы задачи
 * «трудной» зоны шли в начало недели. Здесь только раскладка по бюджету.
 *
 * `shape.minutes` — это уже остаток бюджета дня после задач «Мои задачи»,
 * поэтому день никогда не выходит за общий дневной лимит.
 */
const selectTasks = (
  shape: DayShape,
  orderedCandidates: CatalogTask[],
  usedTitles: Set<string>,
  previousDayTitles: Set<string>
): DayPick => {
  // Лимит дня — это остаток общего бюджета: «блок» стиля «всё за один подход»
  // получает больше времени за счёт других дней недели, а не сверх бюджета.
  const target = shape.minutes;
  // Одна задача не должна съедать больше половины дня: иначе «план на день» —
  // это одно длинное дело и ничего больше.
  const singleTaskCap = Math.max(15, Math.round(target * 0.55));
  const picked: CatalogTask[] = [];
  const localZones = new Map<string, number>();

  const total = () => picked.reduce((sum, task) => sum + task.minutes, 0);

  const fits = (task: CatalogTask) => {
    if (picked.includes(task)) return false;
    if (task.minutes > singleTaskCap) return false;
    if (total() + task.minutes > target) return false;
    if (picked.length > 0 && task.minutes > shape.maxTaskMinutes) return false;
    return true;
  };

  const take = (task: CatalogTask) => {
    picked.push(task);
    usedTitles.add(task.task);
    localZones.set(task.room, (localZones.get(task.room) ?? 0) + 1);
  };

  /**
   * Приоритет кандидата. Важно, что «свежесть» задачи (её ещё не было на этой
   * неделе) всегда важнее разнообразия зон: иначе день жадного выбора целиком
   * уходит на «по одной задаче из каждой комнаты», а задач про питомцев или
   * офис — они сосредоточены в двух-трёх зонах — не остаётся вовсе.
   */
  const priority = (task: CatalogTask) => ({
    fresh: usedTitles.has(task.task) ? 1 : 0,
    zone: localZones.get(task.room) ?? 0,
  });

  const better = (candidate: CatalogTask, current: CatalogTask): boolean => {
    const left = priority(candidate);
    const right = priority(current);

    if (left.fresh !== right.fresh) return left.fresh < right.fresh;
    return left.zone < right.zone;
  };

  const bestCandidate = (candidates: CatalogTask[]): CatalogTask | null => {
    let best: CatalogTask | null = null;

    for (const task of candidates) {
      if (!best || better(task, best)) best = task;
    }

    return best;
  };

  const first = orderedCandidates.find(fits);
  if (first && target > 0) take(first);

  let ranDry = false;

  while (picked.length < shape.maxTasks) {
    if (target - total() <= 0) break;

    const candidates = orderedCandidates.filter(
      (task) => fits(task) && !previousDayTitles.has(task.task)
    );

    const next = bestCandidate(candidates);

    if (!next) {
      // Свободное время ещё есть, а подходящих задач больше нет — вот это и
      // есть настоящая нехватка каталога.
      ranDry = target - total() > 0;
      break;
    }

    take(next);
  }

  // День получился куцым — досыпаем задачами из пула. Их можно повторить с
  // другого дня недели, но не со вчерашнего: «два дня подряд» запрещено.
  if (total() < target * 0.85) {
    for (const task of orderedCandidates) {
      if (picked.length >= shape.maxTasks) break;
      if (picked.includes(task)) continue;
      if (previousDayTitles.has(task.task)) continue;
      if (!fits(task)) continue;

      take(task);
    }
  }

  return { day: shape.day, tasks: picked, ranDry };
};

/**
 * Задача про стирку под способ сушки: развешивание при сушке на воздухе,
 * фильтр и загрузка при сушильной машине.
 *
 * Возвращаем список, а не одну задачу: при маленьком дневном бюджете длинная
 * формулировка в день не влезет, и лучше взять следующую подходящую, чем
 * оставить неделю вовсе без стирки.
 */
const dryingCandidates = (answers: HomeAnswers, pool: CatalogTask[]): CatalogTask[] => {
  const wanted: TaskTag = answers.drying === 'air' ? 'dry_air' : 'dry_machine';
  const laundry = pool.filter((task) => task.tags.includes('laundry'));

  return [
    ...laundry.filter((task) => task.tags.includes(wanted)),
    ...laundry.filter((task) => !task.tags.includes(wanted)),
  ];
};

/**
 * Задачи-«представители» тем анкеты.
 *
 * Пул отсортирован по «трудной» зоне и уровню, поэтому задачи про питомцев,
 * гараж или офис легко проигрывают кухне и ванной и не попадают в план вовсе.
 * Обидно получить «настройку по дому», в которой про кота нет ни слова, поэтому
 * у каждой заявленной темы есть представитель. Он идёт первым кандидатом своего
 * дня: жадный отбор берёт его сразу, но бюджет дня при этом не пробивается —
 * длинную задачу отбор просто пропустит.
 */
const interestRepresentatives = (
  pool: CatalogTask[],
  answers: HomeAnswers,
  budget: number
): CatalogTask[] => {
  const declared = activeHomeTags(answers);
  const limit = Math.max(15, Math.round(budget / 3));
  const seen = new Set<string>();
  const representatives: CatalogTask[] = [];

  for (const tag of ['pets', 'kids', 'balcony', 'yard', 'garage', 'office'] as TaskTag[]) {
    if (!declared.includes(tag)) continue;

    const withTag = pool.filter((task) => task.tags.includes(tag) && !seen.has(task.task));
    // Сначала то, что заведомо влезает в день, иначе — самая короткая задача
    // темы: лучше короткая, чем ни одной.
    const candidate =
      withTag.find((task) => task.minutes <= limit) ??
      [...withTag].sort((left, right) => left.minutes - right.minutes)[0];

    if (!candidate || candidate.minutes > budget) continue;

    seen.add(candidate.task);
    representatives.push(candidate);
  }

  return representatives;
};

/**
 * Основная точка входа: собирает план по ответам анкеты.
 *
 * `occupied` — сколько минут сгенерированных задач уже занимает каждый день
 * недели (0 — воскресенье). Обычно это карта из `occupiedMinutesByWeekday` по
 * набору «Мои задачи» (services/defaultTasks.ts). Из бюджета дня вычитается
 * занятость, и в план уходит только остаток: два генератора больше не
 * складываются поверх общего дневного лимита. Если остатка нет, день получает
 * ноль — план в него ничего не добавляет, и это нормальное состояние
 * (обещание бюджета важнее «плотности» плана).
 *
 * Без аргумента поведение прежнее: весь бюджет дня отдан плану.
 */
export const buildHomePlan = (
  input: PartialHomeAnswers,
  occupied?: ReadonlyMap<number, number>
): HomePlan => {
  const answers = withDefaultAnswers(input);

  const budget = dayBudget(answers);
  const pool = preparePool(answers);
  const days = orderWeekDays(answers.cleaningDays);
  // Остаток бюджета своего дня для каждого выбранного дня недели.
  const leftover = new Map<number, number>(
    days.map((day) => [day, Math.max(0, budget - (occupied?.get(day) ?? 0))])
  );
  const shapes = shapeWeek(answers, days, leftover);
  const focusZone = HARDEST_ZONE_LABELS[answers.hardestZone];

  /**
   * Логичный принцип: то, что даётся труднее всего, делается в начале недели.
   * Поэтому первым дням отдаём задачи трудной зоны (они уже стоят в начале
   * пула), а остальным — остальное по порядку. Так «трудные» задачи не съезжают
   * на выходные, даже если дни недели выбраны вразнобой.
   */
  const focusTasks = pool.filter((task) => isFocusTask(task, answers.hardestZone));
  const otherTasks = pool.filter((task) => !isFocusTask(task, answers.hardestZone));

  // Первому дню достаётся самая большая порция «трудной» зоны, дальше — по
  // убыванию: неделя начинается с самого нелюбимого, а не заканчивается им.
  const focusChunks: CatalogTask[][] = [];
  let rest = [...focusTasks];

  for (let index = 0; index < days.length && rest.length > 0; index += 1) {
    const daysLeft = days.length - index;
    const takeNow = Math.max(1, Math.ceil(rest.length / daysLeft));

    focusChunks.push(rest.slice(0, takeNow));
    rest = rest.slice(takeNow);
  }

  // Задача про стирку под способ сушки и представители тем идут первыми
  // кандидатами недели: идём по дням по кругу, чтобы одному дню не досталось
  // сразу «бельё + кот + гараж».
  const seededByDay = new Map<number, CatalogTask[]>();
  const pushed = new Set<string>();
  const drying = dryingCandidates(answers, pool);
  const seeds = [...drying.slice(0, 2), ...interestRepresentatives(pool, answers, budget)];

  seeds.forEach((task, index) => {
    if (pushed.has(task.task)) return;

    pushed.add(task.task);
    const dayIndex = index % shapes.length;
    seededByDay.set(dayIndex, [...(seededByDay.get(dayIndex) ?? []), task]);
  });

  const usedTitles = new Set<string>();
  const picks: DayPick[] = [];
  let previousDayTitles = new Set<string>();

  for (let index = 0; index < shapes.length; index += 1) {
    const shape = shapes[index];

    // «Хвост» пула со сдвигом: каждый день начинает просмотр со своей части
    // списка, поэтому одни и те же дела не достаются только первому дню.
    const step = Math.ceil(otherTasks.length / shapes.length);
    const offset = otherTasks.length > 0 ? (index * step) % otherTasks.length : 0;
    const rotated = [...otherTasks.slice(offset), ...otherTasks.slice(0, offset)];

    const dayCandidates = [
      ...(seededByDay.get(index) ?? []),
      ...(focusChunks[index] ?? []),
      ...rotated,
    ];
    const pick = selectTasks(shape, dayCandidates, usedTitles, previousDayTitles);

    picks.push(pick);
    previousDayTitles = new Set(pick.tasks.map((task) => task.task));
  }

  // Темы из анкеты и стирка уже в первых кандидатах своих дней: отдельного
  // «добора» после отбора нет, поэтому бюджет дня остаётся неприкосновенным.

  const dayList: PlannedDay[] = WEEK_DAYS.map(({ dayOfWeek, label }) => {
    const pick = picks.find((item) => item.day === dayOfWeek);
    const tasks = (pick?.tasks ?? []).map((task, index) => ({
      position: index + 1,
      title: task.task,
      room: task.room,
      estimatedMinutes: task.minutes,
      level: task.level,
      tags: task.tags,
    }));

    return {
      dayOfWeek,
      label,
      selected: Boolean(pick),
      totalTasks: tasks.length,
      totalMinutes: tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
      tasks,
    };
  });

  const activeDays = dayList.filter((day) => day.selected);
  const totalMinutes = dayList.reduce((sum, day) => sum + day.totalMinutes, 0);
  const totalTasks = dayList.reduce((sum, day) => sum + day.totalTasks, 0);
  const rooms = [...new Set(dayList.flatMap((day) => day.tasks.map((task) => task.room)))];
  const usedTags = [...new Set(dayList.flatMap((day) => day.tasks.flatMap((task) => task.tags)))].filter(
    (tag) => tag !== 'dry_air' && tag !== 'dry_machine'
  );

  const notes: string[] = [];

  if (focusZone) {
    notes.push(`Зона «${focusZone}» поставлена в начало недели и получила больше задач`);
  }

  if (answers.cleaningStyle === 'all_at_once' && days.length > 1) {
    notes.push('Стиль «всё за один подход»: 1-2 дня с большим набором задач, остальные — короткие');
  }

  if (picks.some((pick) => pick.ranDry)) {
    notes.push('В каталоге не хватило подходящих задач под дневной бюджет — день получился короче');
  }

  return {
    title: 'План по дому',
    level: answers.cleaningLevel,
    focusZone,
    days: dayList,
    summary: {
      totalTasks,
      totalMinutes,
      activeDays: activeDays.length,
      minutesPerDay: activeDays.length > 0 ? Math.round(totalMinutes / activeDays.length) : 0,
      dailyBudget: budget,
      rooms,
      tags: usedTags as TaskTag[],
      notes,
    },
  };
};

/** Подписи тегов: интерфейсу нужны и теги, и их человеческие названия. */
export const taskTagLabels = (tags: TaskTag[]): string[] => tags.map((tag) => TASK_TAG_LABELS[tag] ?? tag);

/** Сколько задач в каталоге подходит под ответы — полезно для диагностики пустого плана. */
export const candidateCount = (input: PartialHomeAnswers): number =>
  preparePool(withDefaultAnswers(input)).length;
