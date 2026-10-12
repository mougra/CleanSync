import {
  getTaskCatalog,
  type CatalogTask,
  type TaskCadence,
  type TaskLevel,
  type TaskTag,
} from './taskCatalog';
import { dayBudget, MAX_DAILY_MINUTES } from './dailyBudget';
import {
  activeHomeTags,
  allowedLevels,
  CONTEXT_TAGS,
  orderWeekDays,
  WEEK_DAYS,
  withDefaultAnswers,
  type DailyMinutesOption,
  type HomeAnswers,
  type PartialHomeAnswers,
  type RoomsOption,
} from './homePlan';

/**
 * Постоянный набор повторяющихся задач «Мои задачи».
 *
 * Отличие от недельного плана (services/homePlan.ts): план отвечает на вопрос
 * «что делать на этой неделе» и заменяется при каждой пересборке, а этот модуль
 * собирает постоянный список дел с периодичностью — он живёт в расписании
 * «Мои задачи» и дальше меняется пользователем вручную.
 *
 * Правила набора:
 *  1. Контекст — жёсткий фильтр. Нет питомцев — в наборе нет ни одной задачи с
 *     тегом pets; нет детской, балкона, двора, гаража или работы из дома — нет и
 *     их задач. Стирка фильтруется по способу сушки (`drying`): при сушильной
 *     машине не предлагаем развешивание на воздухе и наоборот.
 *  2. Число комнат масштабирует объём: теги `floors` и `dust` ограничены
 *     квотами (1-2 комнаты — 2 задачи про полы, 8+ — до 5), поэтому в маленькой
 *     квартире нет полов «лишних» зон.
 *  3. Дневной бюджет берётся из ответа анкеты (services/dailyBudget.ts: under30
 *     → 25, 30to60 → 40, 1to2h → 40, depends → 30, сверху жёсткий потолок
 *     MAX_DAILY_MINUTES = 40) и применяется к **сумме** всех сгенерированных
 *     дел дня — этот набор делит его с недельным планом (services/homePlan.ts).
 *     Ежедневный блок занимает 12-18 минут, недельные дела ложатся на выбранные
 *     дни (cleaningDays), а месячные и более редкие — на остальные числа месяца.
 *     Больше MAX_WEEKLY_DAYS дней в неделю недельные дела не занимают: иначе в
 *     остатке дня не было бы места делам «раз в месяц» и реже.
 *  3a. Ежедневный блок — не «одни и те же дела каждый день», а ротация.
 *     Раньше генератор набирал ежедневными делами 12-18 минут и повторял их
 *     изо дня в день: понедельник, среда и суббота отличались только недельными
 *     делами, а кухня давала 3 задачи из 4. Поэтому теперь:
 *       * в каждом дне остаются 1-2 по-настоящему ежедневных дела (не больше
 *         EVERY_DAY_TASK_LIMIT и не больше EVERY_DAY_MINUTES_CAP минут) — те,
 *         что и правда делаются каждый день: посуда, обеденный стол, раковина;
 *       * остальные дела ежедневного блока (проветривание, плита, прихожая,
 *         подушки) получают периодичность «раз в неделю» и раскладываются по
 *         дням уборки по кругу — свои минуты они сохраняют, но повторяются не
 *         каждый день, а в свой день;
 *       * в одном дне не больше MAX_ZONE_TASKS_PER_DAY задач одной зоны (с учётом
 *         ежедневных): «день кухни» из четырёх кухонных дел больше не собирается.
 *  4. Нагрузка месячных дел считается по числам месяца и «классам месяцев»
 *     (0-11): задача с интервалом N и опорой в месяце offset занимает только
 *     сравнимые с ним месяцы. Поэтому «раз в 3 месяца» не сталкивается с другой
 *     квартальной задачей на том же числе, а опорные даты циклов разводятся по
 *     месяцам. Дела, которым не хватило места в лимите, в набор не попадают —
 *     в сводке видно, сколько их.
 *  5. Периодичность выражается парой (frequency, intervalCount): «раз в день»,
 *     «раз в неделю», «раз в 2 недели», «раз в месяц», «раз в 3 месяца»,
 *     «раз в полгода», «раз в год». Задачи с интервалом больше единицы
 *     получают dueDate — опорную дату, от которой считается цикл
 *     (см. выборку «Сегодня» в backend/routes/tasks.ts).
 *
 * Модуль чистый: он ничего не пишет в базу и не знает про Express. Записью
 * занимается маршрут (backend/routes/homeProfile.ts).
 */

/** Заголовок расписания, в котором живёт постоянный набор. */
export const DEFAULT_TASKS_SCHEDULE_TITLE = 'Мои задачи';

/** Пометка источника: по ней видно, что задача собрана по анкете, а не создана руками. */
export const DEFAULT_TASK_SOURCE = 'home_profile_defaults';

/**
 * Ключ задачи для сравнения названий: обрезанные пробелы и регистр.
 *
 * По нему работает вся идемпотентность набора: «уже есть в расписании»
 * (syncDefaultTasks), «эту задачу переносить не нужно» (mergePlanIntoTasks) и
 * «человек её удалил, возвращать не надо» (dismissed_default_tasks). Одно
 * правило на все три места — иначе «Мытьё пола» и «мытьё пола » разошлись бы, и
 * набор снова начал бы плодить дубли.
 */
export const normalizeTaskTitle = (title: string): string => title.trim().toLowerCase();

/**
 * Абсолютный потолок дневной нагрузки набора: больше 40 минут в день он не назначает.
 *
 * Сами числа бюджета живут в services/dailyBudget.ts — общий источник правды для
 * обоих генераторов. Здесь только совместимый реэкспорт: модуль исторически был
 * точкой входа для этого потолка (им пользуется scripts/check-default-tasks.ts).
 */
export { MAX_DAILY_MINUTES };

/**
 * Сколько минут ежедневного блока остаётся в **каждом** дне — по ответу анкеты.
 *
 * Раньше этим лимитом генератор набирал весь ежедневный блок, и одни и те же
 * 3-5 дел лежали в понедельнике, вторнике и субботе без единого отличия: отсюда
 * жалоба «на другие дни почти тот же список». Теперь лимит ограничивает только
 * те дела, которые и правда делаются каждый день (посуда, стол, раковина), —
 * остальные дела блока сохраняют свои минуты, но раскладываются по выбранным
 * дням уборки (`cleaningDays`) как недельные.
 */
const EVERY_DAY_MINUTES_CAP: Record<DailyMinutesOption, number> = {
  under30: 12,
  '30to60': 18,
  '1to2h': 18,
  depends: 15,
};

/**
 * Сколько дел каталога действительно делаются каждый день: не больше двух.
 *
 * Одно-два ежедневных дела — это ежедневный минимум, а не список дел на день:
 * всё, что делается реже, живёт в ротации по дням уборки.
 */
const EVERY_DAY_TASK_LIMIT = 2;

/**
 * Предел задач одной зоны в одном дне — вместе с ежедневными делами.
 *
 * Заказчик сформулировал так: «одна зона не должна доминировать». До правки в
 * ежедневном блоке было 3 кухонных дела из 4, и любой день выглядел «днём
 * кухни»; теперь планировщик не поставит в день третью задачу той же зоны, даже
 * если она очень короткая.
 *
 * Экспортируется: тем же числом проверяется готовый набор
 * (scripts/check-default-tasks.ts) и тесты — предел должен быть один на весь
 * проект, иначе генератор и проверка разъедутся.
 */
export const MAX_ZONE_TASKS_PER_DAY = 2;

/**
 * Дела каталога, которые и правда делаются каждый день, в порядке приоритета.
 *
 * Порядок — от заказчика: посуда, стол, раковина. Список не обязательство, а
 * подсказка: если названия в каталоге изменятся, ежедневный блок доберётся
 * остальными делами с периодичностью `daily` (см. сборку `everyDayOrder`), а
 * пустого дня в наборе всё равно не будет.
 */
const EVERY_DAY_TITLES: readonly string[] = [
  'Убрать посуду в сушилку и на места',
  'Протереть обеденный стол после еды',
  'Ополоснуть раковину и смеситель на кухне',
  'Протереть рабочие поверхности на кухне',
  'Вечерний проход по ванной: раковина, зеркало, полотенца',
  'Заправить кровать',
];

/** Предел минут на одно число месяца для месячных и более редких дел. */
const MONTHLY_DAY_CAP = 25;

/**
 * Сколько дней в неделю могут занимать недельные дела.
 *
 * Остальные дни остаются под месячные и более редкие: у задачи на 15-20 минут
 * в сорока минутах дня есть место только там, где нет недельной уборки.
 */
const MAX_WEEKLY_DAYS = 5;

/** Сколько недельных задач про полы и пыль брать — по числу комнат. */
const FLOOR_QUOTA: Record<RoomsOption, number> = { '1-2': 2, '3-4': 3, '5-7': 4, '8+': 5 };
const DUST_QUOTA: Record<RoomsOption, number> = { '1-2': 1, '3-4': 2, '5-7': 2, '8+': 3 };

/** Частота, которую понимает таблица tasks и выборка «Сегодня». */
export type DefaultTaskFrequency = 'daily' | 'weekly' | 'monthly';

/** Периодичность каталога → пара (frequency, interval_count). */
const CADENCE_RULES: Record<
  TaskCadence,
  { frequency: DefaultTaskFrequency; intervalCount: number }
> = {
  daily: { frequency: 'daily', intervalCount: 1 },
  weekly: { frequency: 'weekly', intervalCount: 1 },
  biweekly: { frequency: 'weekly', intervalCount: 2 },
  monthly: { frequency: 'monthly', intervalCount: 1 },
  quarterly: { frequency: 'monthly', intervalCount: 3 },
  semiannual: { frequency: 'monthly', intervalCount: 6 },
  yearly: { frequency: 'monthly', intervalCount: 12 },
};

const WEEKLY_CADENCES: readonly TaskCadence[] = ['weekly', 'biweekly'];
const MONTHLY_CADENCES: readonly TaskCadence[] = ['monthly', 'quarterly', 'semiannual', 'yearly'];

/**
 * Лестница циклов для дел, которым не хватило места в неделе: от месяца к году.
 * Порядок обхода вращается (см. `demotedOffset`), поэтому остаток распределяется
 * по всему году, а не сбивается в один месяц.
 */
const DEMOTION_LADDER: readonly TaskCadence[] = ['monthly', 'quarterly', 'semiannual', 'yearly'];

/**
 * Периодичность каталога в виде пары, которую понимает таблица tasks.
 *
 * Экспортируется: перенос задач недельного плана в набор «Мои задачи»
 * (services/mergePlanIntoTasks.ts) обязан брать частоту из того же правила, а не
 * заводить вторую таблицу соответствий.
 */
export const cadenceRule = (
  cadence: TaskCadence
): { frequency: DefaultTaskFrequency; intervalCount: number } => CADENCE_RULES[cadence];

/**
 * Порядок разбора месячного круга: сначала самые редкие дела.
 *
 * Числа месяца ограничены бюджетом дня, поэтому в набор попадает лишь часть
 * каталога. Если разбирать по частоте (месячные первыми), весь лимит съедают
 * дела «раз в месяц», и «раз в 3 месяца», «раз в полгода» и «раз в год» в наборе
 * не остаётся вовсе — на живом пользователе так и было (0 редких дел). Редкие
 * дела идут первыми, а месячные добирают оставшиеся числа: так в наборе всегда
 * есть все циклы, ради которых каталог и разделён по периодичности.
 */
const CADENCE_RANK: Record<TaskCadence, number> = {
  daily: 0,
  weekly: 1,
  biweekly: 1,
  monthly: 5,
  quarterly: 4,
  semiannual: 3,
  yearly: 2,
};

/** Одна задача постоянного набора: готовая строка для INSERT в tasks. */
export interface DefaultTask {
  title: string;
  room: string;
  minutes: number;
  level: TaskLevel;
  tags: TaskTag[];
  /**
   * Периодичность, с которой дело попадает в расписание, — её видят подписи в
   * интерфейсе. У большинства задач совпадает с каталогом; у дел ежедневного
   * блока, разложенных по дням уборки, здесь `weekly`: каждый день они больше не
   * повторяются, а стоят в своём дне недели (см. правило 3a в шапке модуля).
   */
  cadence: TaskCadence;
  frequency: DefaultTaskFrequency;
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  /** Опора цикла для «раз в N ...»: ISO-дата первой постановки. */
  dueDate: string | null;
  source: string;
}

export interface DefaultTaskDay {
  dayOfWeek: number;
  label: string;
  selected: boolean;
  /** Ежедневные дела плюс недельные дела этого дня (в том числе ротация). */
  tasks: DefaultTask[];
  minutes: number;
}

export interface DefaultTaskSet {
  scheduleTitle: string;
  tasks: DefaultTask[];
  summary: {
    totalTasks: number;
    totalMinutes: number;
    /** По-настоящему ежедневные дела: они лежат в каждом дне. */
    dailyTasks: number;
    dailyMinutes: number;
    /** Дела ежедневного блока, разложенные по дням уборки (в базе — недельные). */
    rotatedTasks: number;
    rotatedMinutes: number;
    weeklyTasks: number;
    weeklyMinutes: number;
    monthlyTasks: number;
    monthlyMinutes: number;
    /** Сколько дел каталога не поместилось в дневной лимит и не попало в набор. */
    droppedTasks: number;
    /** Худший день недели: ежедневные дела плюс недельные дела этого дня. */
    maxDailyMinutes: number;
    dailyLimit: number;
    rooms: string[];
    tags: TaskTag[];
    days: DefaultTaskDay[];
    notes: string[];
  };
}

// ── Даты ───────────────────────────────────────────────────────────────────

/**
 * Описание расписания «Мои задачи» при создании.
 *
 * Одно и то же в двух местах: маршрут анкеты (syncDefaultTasks в
 * routes/homeProfile.ts) и перенос задач из «Плана по дому»
 * (services/mergePlanIntoTasks.ts). Расписание, созданное переносом, не должно
 * отличаться от созданного анкетой — иначе описание пришлось бы держать в голове.
 */
export const myTasksScheduleDescription = (set: DefaultTaskSet): string =>
  `Постоянные дела по настройкам дома: ${set.summary.totalTasks} задач, до ${set.summary.maxDailyMinutes} минут в день`;

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const utcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** Ближайший день недели на сегодня или позже: опора цикла «раз в N недель». */
export const nextWeekdayDate = (today: Date, dayOfWeek: number): string => {
  const base = utcDay(today);
  base.setUTCDate(base.getUTCDate() + ((dayOfWeek - base.getUTCDay() + 7) % 7));

  return isoDate(base);
};

/** Ближайшее число месяца на сегодня или позже: опора цикла «раз в N месяцев». */
export const nextMonthDayDate = (today: Date, dayOfMonth: number): string => {
  const base = utcDay(today);

  if (dayOfMonth >= base.getUTCDate()) {
    return isoDate(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), dayOfMonth)));
  }

  return isoDate(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, dayOfMonth)));
};

/** Какой день недели у числа месяца в текущем месяце (0 — воскресенье). */
const weekdayOfMonthDay = (today: Date, dayOfMonth: number): number =>
  new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), dayOfMonth)).getUTCDay();

/** Сдвигает ISO-дату на месяцы вперёд: разводит опорные даты циклов. */
const shiftMonths = (date: string, months: number): string => {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCMonth(base.getUTCMonth() + months);

  return isoDate(base);
};

/**
 * Свободные минуты каждого числа месяца (1-28).
 *
 * Число считается свободным настолько, насколько в этот календарный день
 * остаётся места после ежедневного минимума и недельных дел попадающего на него
 * дня недели; больше MONTHLY_DAY_CAP минут одному числу всё равно не нужно.
 * Экспортируется: этим же расчётом пользуется перенос задач из «Плана по дому»
 * (services/mergePlanIntoTasks.ts), чтобы не заводить вторую таблицу чисел.
 */
export const freeMinutesByMonthDay = (options: {
  answers: HomeAnswers;
  /** Минуты ежедневного минимума, уже занятые в каждом дне. */
  dailyMinutes: number;
  /** Минуты недельных дел по дням недели (0 — воскресенье). */
  weeklyByWeekday: ReadonlyMap<number, number>;
  today: Date;
}): Map<number, number> => {
  const budget = dayBudget(options.answers);
  const free = new Map<number, number>();

  for (let day = 1; day <= 28; day += 1) {
    const weekly = options.weeklyByWeekday.get(weekdayOfMonthDay(options.today, day)) ?? 0;

    free.set(day, Math.max(0, Math.min(MONTHLY_DAY_CAP, budget - options.dailyMinutes - weekly)));
  }

  return free;
};

/**
 * Число месяца для одного дела «раз в месяц» и реже.
 *
 * Правило отбора то же, что и в раскладке месячного круга внутри
 * `buildDefaultTasks`: сначала числа, свободные от выбранных дней уборки, затем —
 * с наибольшим запасом минут, при равенстве — меньшее число. Разница только в
 * том, что раскладка идёт пачкой и учитывает классы месяцев, а перенос ставит по
 * одной задаче, поэтому запас пересчитывает вызывающий, вычитая уже занятое.
 */
export const pickMonthlyDay = (
  free: ReadonlyMap<number, number>,
  cleaningDays: readonly number[],
  today: Date
): number => {
  const busy = new Set(cleaningDays);
  const candidates = [...free.keys()].sort((left, right) => {
    const byBusy =
      (busy.has(weekdayOfMonthDay(today, left)) ? 1 : 0) -
      (busy.has(weekdayOfMonthDay(today, right)) ? 1 : 0);

    if (byBusy !== 0) return byBusy;

    const byFree = (free.get(right) ?? 0) - (free.get(left) ?? 0);

    if (byFree !== 0) return byFree;

    return left - right;
  });

  return candidates[0] ?? 1;
};

/**
 * Периодичность одной задачи по её `cadence` из каталога — готовая строка для
 * tasks (frequency + interval_count + день/число + опора цикла).
 *
 * Экспортируется: перенос задач из «Плана по дому» (services/mergePlanIntoTasks.ts)
 * обязан проставлять периодичность ровно по этим правилам, а не по своим:
 *  - ежедневные дела не привязаны ни к чему;
 *  - недельные и «раз в 2 недели» встают на первый выбранный день уборки;
 *  - месячные и реже получают самое свободное число месяца (pickMonthlyDay), а
 *    при интервале больше единицы — опорную дату, от которой считается цикл.
 */
export const cadenceSchedule = (options: {
  cadence: TaskCadence;
  answers: HomeAnswers;
  today: Date;
  /** Свободные минуты по числам месяца: нужны только для месячных и реже. */
  freeByDate: ReadonlyMap<number, number>;
  /** Порядковый номер дела этого каденса: разводит опорные даты циклов. */
  monthOffset?: number;
}): {
  frequency: DefaultTaskFrequency;
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  dueDate: string | null;
} => {
  const rule = CADENCE_RULES[options.cadence];

  if (options.cadence === 'daily') {
    return { ...rule, dayOfWeek: null, dayOfMonth: null, dueDate: null };
  }

  if (WEEKLY_CADENCES.includes(options.cadence)) {
    const dayOfWeek = orderWeekDays(options.answers.cleaningDays)[0];

    return {
      ...rule,
      dayOfWeek,
      dayOfMonth: null,
      dueDate: rule.intervalCount > 1 ? nextWeekdayDate(options.today, dayOfWeek) : null,
    };
  }

  const dayOfMonth = pickMonthlyDay(
    options.freeByDate,
    options.answers.cleaningDays,
    options.today
  );

  return {
    ...rule,
    dayOfWeek: null,
    dayOfMonth,
    dueDate:
      rule.intervalCount > 1
        ? shiftMonths(nextMonthDayDate(options.today, dayOfMonth), options.monthOffset ?? 0)
        : null,
  };
};

// ── Отбор кандидатов ───────────────────────────────────────────────────────

/**
 * Стирка под способ сушки. Общие задачи про стирку (без пометки) подходят всем,
 * а «развесить на воздухе» при сушильной машине не предлагаем.
 */
const matchesDrying = (task: CatalogTask, answers: HomeAnswers): boolean => {
  if (!task.tags.includes('laundry')) return true;

  const wantsAir = task.tags.includes('dry_air');
  const wantsMachine = task.tags.includes('dry_machine');

  if (!wantsAir && !wantsMachine) return true;

  return answers.drying === 'air' ? wantsAir : wantsMachine;
};

/** Подходит ли задача ответам анкеты: уровень уборки, контекст и способ сушки. */
const isRelevant = (task: CatalogTask, answers: HomeAnswers, declared: TaskTag[]): boolean => {
  if (!allowedLevels(answers.cleaningLevel).includes(task.level)) return false;

  const needs = task.tags.filter((tag) => CONTEXT_TAGS.includes(tag));

  if (needs.length > 0 && !needs.some((tag) => declared.includes(tag))) return false;

  return matchesDrying(task, answers);
};

// ── Сборка набора ──────────────────────────────────────────────────────────

interface DaySlot {
  dayOfWeek: number;
  label: string;
  selected: boolean;
  tasks: CatalogTask[];
  /** Минуты дня: ежедневный минимум уже заложен в каждом дне. */
  minutes: number;
}

/**
 * Собирает постоянный набор задач по ответам анкеты.
 *
 * `today` передаётся параметром (а не берётся из Date.now внутри): от него
 * зависят опорные даты циклов, и в проверках нужен предсказуемый результат.
 */
export const buildDefaultTasks = (
  input: PartialHomeAnswers,
  today: Date = new Date()
): DefaultTaskSet => {
  const answers = withDefaultAnswers(input);
  const declared = activeHomeTags(answers);
  const catalog = getTaskCatalog();
  const catalogOrder = new Map(catalog.map((task, index) => [task.task, index]));
  const pool = catalog.filter((task) => isRelevant(task, answers, declared));

  const notes: string[] = [];
  const tasks: DefaultTask[] = [];

  /**
   * Дневной бюджет **всех** сгенерированных дел дня по ответу анкеты.
   *
   * Это общий лимит с недельным планом (services/homePlan.ts): план при сборке
   * получает бюджет дня за вычетом того, что занял этот набор
   * (`occupiedMinutesByWeekday`). Числа берутся из services/dailyBudget.ts,
   * чтобы две таблицы снова не разъехались.
   */
  const budget = dayBudget(answers);

  // ── 1. Ежедневный блок: 1-2 дела в каждом дне, остальное — в ротацию ──────
  //
  // Раньше здесь набирался весь ежедневный блок (3-5 дел на 12-18 минут), и он
  // же повторялся в каждом дне недели — отсюда «на другие дни почти тот же
  // список». Теперь в каждом дне остаются только по-настоящему ежедневные дела,
  // а остальные уходят в ротацию по дням уборки (см. шаг 1a).
  const dailyLimit = EVERY_DAY_MINUTES_CAP[answers.dailyMinutes];
  const everyDayPool = pool.filter((item) => item.cadence === 'daily');

  /**
   * Порядок выбора ежедневных дел: сначала те, что заказчик назвал ежедневными
   * (посуда, стол, раковина — список EVERY_DAY_TITLES), затем остальные дела
   * ежедневного блока каталога. Благодаря добору набор не останется без
   * ежедневных дел, даже если названия в каталоге когда-нибудь изменятся.
   */
  const everyDayOrder: CatalogTask[] = [
    ...EVERY_DAY_TITLES.map((title) => everyDayPool.find((task) => task.task === title)).filter(
      (task): task is CatalogTask => task !== undefined
    ),
    ...everyDayPool.filter((task) => !EVERY_DAY_TITLES.includes(task.task)),
  ];

  const dailyTasks: CatalogTask[] = [];
  let dailyMinutes = 0;
  const dailyZones = new Set<string>();

  for (const task of everyDayOrder) {
    if (dailyTasks.length >= EVERY_DAY_TASK_LIMIT) break;
    if (dailyMinutes + task.minutes > dailyLimit) continue;
    // Второе ежедневное дело берём из другой зоны: если оба дела кухонные, то
    // вместе с пределом зоны (MAX_ZONE_TASKS_PER_DAY) кухня займёт день целиком
    // и ни одно кухонное дело ротации в него уже не поместится.
    if (dailyZones.has(task.room)) continue;

    dailyTasks.push(task);
    dailyMinutes += task.minutes;
    dailyZones.add(task.room);
  }

  // ── 1a. Остальные дела ежедневного блока — в ротацию по дням уборки ───────
  //
  // Это и есть «каждый день — свой список»: посуда и вечерний проход по ванной
  // остаются в каждом дне, а проветривание, плита, прихожая и подушки получают
  // периодичность «раз в неделю» и встают в разные дни уборки. Минуты дел при
  // этом не теряются — они просто перестают повторяться изо дня в день.
  const rotatedPlaced = new Set<CatalogTask>();
  const rotationPool = everyDayPool.filter((task) => !dailyTasks.includes(task));

  /**
   * Признак «это дело ежедневного блока, и оно ушло в ротацию».
   *
   * Именно по нему решается, что задача становится недельной. Признак ставится
   * сразу на весь `rotationPool`, а не только на удачно разложенные дела:
   * переполнившееся дело уходит в месячный круг, и без этого оно осталось бы с
   * кадансом `daily` — то есть снова появлялось бы в каждом дне. Проверка
   * scripts/check-default-tasks.ts ловит это переполнением дневного бюджета.
   */
  const rotationSet = new Set<CatalogTask>(rotationPool);

  // ── 2. Недельные дела по дням недели ──────────────────────────────────────
  const selectedDays = orderWeekDays(answers.cleaningDays);
  const cleaningDays = new Set(selectedDays);
  const slots: DaySlot[] = WEEK_DAYS.map(({ dayOfWeek, label }) => ({
    dayOfWeek,
    label,
    selected: cleaningDays.has(dayOfWeek),
    tasks: [],
    minutes: dailyMinutes,
  }));

  const weeklyPool = pool.filter((task) => WEEKLY_CADENCES.includes(task.cadence));
  const placed = new Set<CatalogTask>();
  const overflow: CatalogTask[] = [];

  // Недельные дела занимают не больше MAX_WEEKLY_DAYS дней: оставшиеся дни
  // недели остаются под месячные дела, которым нужно 15-20 минут подряд.
  const weeklyDays = new Set(selectedDays.slice(0, MAX_WEEKLY_DAYS));

  /**
   * Сколько минут дня остаётся неприкосновенным для дел «раз в месяц» и реже.
   *
   * Недельные дела жадные: без этого запаса они заполняют день ровно до бюджета,
   * и месячному кругу не остаётся ни минуты — «раз в 3 месяца» и «раз в год»
   * просто исчезли бы из набора. Запас не больше самого короткого дела каталога
   * (3 минуты), поэтому бюджет дня он не пробивает.
   */
  const RARE_CYCLE_RESERVE = 3;

  const fits = (slot: DaySlot, task: CatalogTask): boolean =>
    slot.minutes + task.minutes + RARE_CYCLE_RESERVE <= budget;

  /**
   * Сколько задач этой зоны уже стоит в дне — вместе с ежедневными делами.
   *
   * Ежедневные дела лежат не в `slot.tasks`, а отдельно, но в дне они есть,
   * поэтому предел зоны обязан их учитывать: иначе к двум кухонным ежедневным
   * делам добавилось бы третье кухонное из недельных, и снова получился бы
   * «день кухни», на который жаловался заказчик.
   */
  const zoneLoad = (slot: DaySlot, room: string): number =>
    slot.tasks.filter((task) => task.room === room).length +
    dailyTasks.filter((task) => task.room === room).length;

  const zoneFits = (slot: DaySlot, task: CatalogTask): boolean =>
    zoneLoad(slot, task.room) < MAX_ZONE_TASKS_PER_DAY;

  /**
   * Ставит задачу в самый свободный из выбранных дней недели.
   *
   * Возвращает false, если неделя заполнена — тогда дело уходит в месячный круг.
   */
  const place = (task: CatalogTask): boolean => {
    const candidates = slots.filter(
      (slot) =>
        slot.selected && weeklyDays.has(slot.dayOfWeek) && fits(slot, task) && zoneFits(slot, task)
    );

    if (candidates.length === 0) return false;

    const target = candidates.reduce((best, slot) => (slot.minutes < best.minutes ? slot : best));

    target.tasks.push(task);
    target.minutes += task.minutes;
    placed.add(task);

    return true;
  };

  /**
   * Ставит дело ежедневного блока в день уборки — по кругу, а не в самый
   * свободный день.
   *
   * Круг важнее «свободного дня»: он и делает понедельник, среду и субботу
   * разными (каждое дело уходит в свой следующий день), тогда как жадный выбор
   * сваливал бы короткие ежедневные дела в один день, а остальные оставлял с
   * одним минимумом. Если выбранный день не подходит по бюджету или по пределу
   * зоны, дело пробует следующий день круга — и только потом уходит в месячный
   * круг вместе с прочей переполнившейся неделей.
   */
  let rotationCursor = 0;
  const placeRotated = (task: CatalogTask): boolean => {
    for (let step = 0; step < selectedDays.length; step += 1) {
      const dayOfWeek = selectedDays[(rotationCursor + step) % selectedDays.length];
      const slot = slots.find((item) => item.dayOfWeek === dayOfWeek);

      if (!slot || !weeklyDays.has(dayOfWeek) || !fits(slot, task) || !zoneFits(slot, task)) {
        continue;
      }

      slot.tasks.push(task);
      slot.minutes += task.minutes;
      placed.add(task);
      rotatedPlaced.add(task);
      rotationCursor = (rotationCursor + step + 1) % selectedDays.length;

      return true;
    }

    return false;
  };

  /**
   * Представители заявленных тем: по одному делу на каждый контекст анкеты.
   * Без них про кота, гараж или офис в наборе можно не увидеть ни слова —
   * жадный отбор всегда предпочтёт кухню и ванную.
   */
  const representatives = new Set<CatalogTask>();

  /**
   * Представитель способа сушки: у пользователя должна быть хоть одна задача
   * ровно под его ответ (`drying`), а не только общие дела про стирку.
   *
   * Без этого недельные дела в 10-15 минут проигрывают коротким «протереть
   * полотенца» и не попадают в набор: бюджет дня ограничен, и способ сушки из
   * анкеты в делах не отражался вовсе.
   */
  const dryingTag: TaskTag = answers.drying === 'air' ? 'dry_air' : 'dry_machine';
  const dryingRepresentative =
    weeklyPool.find((task) => task.tags.includes(dryingTag)) ??
    pool.find((task) => task.cadence === 'daily' && task.tags.includes(dryingTag));

  if (dryingRepresentative) representatives.add(dryingRepresentative);

  for (const tag of CONTEXT_TAGS) {
    if (!declared.includes(tag)) continue;

    const candidate =
      weeklyPool.find((task) => task.tags.includes(tag)) ??
      pool.find((task) => task.tags.includes(tag));

    if (candidate) representatives.add(candidate);
  }

  for (const task of representatives) {
    if (task.cadence === 'weekly' || task.cadence === 'biweekly') place(task);
  }

  /**
   * Ротация ежедневного блока — сразу после представителей заявленных тем и
   * до доборной уборки: это «минимум» ухода за домом, и он должен попасть в
   * набор раньше, чем задачи, которые можно отложить. Представители тем идут
   * первыми не случайно: они представляют ответы анкеты (питомцы, гараж, офис),
   * и без приоритета жадный отбор не оставил бы им места.
   *
   * Что не поместилось в дни уборки, уходит в общий `overflow` — дальше он
   * разбирается месячным кругом, как и переполнившиеся недельные дела.
   */
  for (const task of rotationPool) {
    if (!placeRotated(task)) overflow.push(task);
  }

  // Полы и пыль масштабируются по числу комнат: в маленькой квартире нет
  // смысла в задачах «вымыть пол» для пяти разных зон.
  const quotas: Array<{ tag: TaskTag; limit: number; skipped: number }> = [
    { tag: 'floors', limit: FLOOR_QUOTA[answers.rooms], skipped: 0 },
    { tag: 'dust', limit: DUST_QUOTA[answers.rooms], skipped: 0 },
  ];

  const countWith = (tag: TaskTag): number =>
    [...placed].filter((task) => task.tags.includes(tag)).length;

  for (const quota of quotas) {
    for (const task of weeklyPool) {
      if (countWith(quota.tag) >= quota.limit) break;
      if (placed.has(task) || !task.tags.includes(quota.tag)) continue;

      place(task);
    }
  }

  for (const task of weeklyPool) {
    if (placed.has(task)) continue;

    const quota = quotas.find((item) => task.tags.includes(item.tag));

    if (quota) {
      if (countWith(quota.tag) >= quota.limit) {
        quota.skipped += 1;
        continue;
      }
      place(task);
      continue;
    }

    if (!place(task)) overflow.push(task);
  }

  /**
   * Периодичность, с которой дело уходит в расписание.
   *
   * У дел ежедневного блока, разложенных по дням уборки, это `weekly`: каждый
   * день они больше не повторяются. Правило одно на все три места, где каданс
   * нужен: вставка в `tasks`, порядок разбора месячного круга и решение о том,
   * что переполнившееся недельное дело становится месячным.
   */
  const scheduledCadence = (task: CatalogTask): TaskCadence =>
    rotationSet.has(task) ? 'weekly' : task.cadence;

  for (const slot of slots) {
    for (const task of slot.tasks) {
      const cadence = scheduledCadence(task);
      const rule = CADENCE_RULES[cadence];

      tasks.push({
        title: task.task,
        room: task.room,
        minutes: task.minutes,
        level: task.level,
        tags: task.tags,
        cadence,
        frequency: rule.frequency,
        intervalCount: rule.intervalCount,
        dayOfWeek: slot.dayOfWeek,
        dayOfMonth: null,
        dueDate: rule.intervalCount > 1 ? nextWeekdayDate(today, slot.dayOfWeek) : null,
        source: DEFAULT_TASK_SOURCE,
      });
    }
  }

  // ── 3. Месячные, квартальные, полугодовые и годовые дела ──────────────────
  const skippedByQuota = quotas.reduce((sum, quota) => sum + quota.skipped, 0);

  // Недельные дела, которым не хватило места ни в один день, не теряются:
  // они переезжают в месячный круг — лимит недели остаётся неприкосновенным.
  const monthlyPool = [
    ...pool.filter((task) => MONTHLY_CADENCES.includes(task.cadence)),
    ...overflow,
  ].sort((left, right) => {
    // Сначала представители заявленных тем: контекст анкеты важнее каданса.
    const byRepresentative =
      (representatives.has(left) ? 0 : 1) - (representatives.has(right) ? 0 : 1);

    if (byRepresentative !== 0) return byRepresentative;

    const byCadence = CADENCE_RANK[scheduledCadence(left)] - CADENCE_RANK[scheduledCadence(right)];

    if (byCadence !== 0) return byCadence;

    return (catalogOrder.get(left.task) ?? 0) - (catalogOrder.get(right.task) ?? 0);
  });

  /**
   * Свободное время каждого числа месяца: лимит дня минус ежедневный минимум и
   * недельные дела этого дня недели. Считается общим помощником — им же
   * пользуется перенос задач из «Плана по дому» (services/mergePlanIntoTasks.ts).
   */
  const weeklyLoad = new Map<number, number>();

  for (const slot of slots) {
    weeklyLoad.set(slot.dayOfWeek, slot.minutes - dailyMinutes);
  }

  const freeByDate = freeMinutesByMonthDay({
    answers,
    dailyMinutes,
    weeklyByWeekday: weeklyLoad,
    today,
  });
  /**
   * Нагрузка числа по «классам месяцев» (0-11): задача с интервалом N и опорой
   * в месяце offset занимает классы месяцев, сравнимые с offset по модулю N.
   * Так видно, что «раз в 3 месяца» не сталкивается с другой квартальной
   * задачей на том же числе, а месячные и годовые не наезжают друг на друга.
   */
  const monthSlots = new Map<number, number[]>();

  for (let day = 1; day <= 28; day += 1) {
    monthSlots.set(day, new Array<number>(12).fill(0));
  }

  const monthBudget = [...freeByDate.values()].reduce((sum, value) => sum + value, 0);
  const cycleOffset = new Map<TaskCadence, number>();
  const monthTasks: DefaultTask[] = [];
  const dropped: CatalogTask[] = [];
  let spent = 0;

  /** Куда войти в лестницу циклов для следующего переполнения недели. */
  let demotedOffset = 0;

  /** Месяцы цикла, в которые задача занимает своё число. */
  const activeMonths = (interval: number, offset: number): number[] => {
    const months: number[] = [];

    for (let month = 0; month < 12; month += 1) {
      if ((((month - offset) % interval) + interval) % interval === 0) months.push(month);
    }

    return months;
  };

  for (const task of monthlyPool) {
    const origin = scheduledCadence(task);
    const demoted = WEEKLY_CADENCES.includes(origin);

    /**
     * Переполнение недели не обязано становиться месячным.
     *
     * Раньше дело, которому не хватило места в днях уборки, жёстко получало
     * «раз в месяц» — и в жёстких профилях («минимум» и три дня) выходило
     * «ополоснуть раковину раз в месяц», хотя дело частое. Теперь у такого дела
     * есть лестница циклов, и точка входа в неё вращается: первое переполнение
     * идёт в месяц, второе в квартал, третье в полгода, четвёртое в год, пятое
     * снова в месяц. Так остаток распределяется по всему году, а не сбивается в
     * один месяц; если выпавший цикл не помещается, пробуются остальные.
     *
     * Дела с собственной периодичностью идут ровно своим циклом, как и раньше:
     * лестница из одного шага ничего не меняет.
     */
    const rotatedLadder = [...DEMOTION_LADDER.slice(demotedOffset), ...DEMOTION_LADDER.slice(0, demotedOffset)];
    const ladder: TaskCadence[] = demoted ? rotatedLadder : [origin];

    let placed = false;

    for (const cadence of ladder) {
      const rule = CADENCE_RULES[cadence];

      /**
       * Амортизированная нагрузка: сколько минут числа занимает дело в пересчёте
       * на месяц. «Раз в 3 месяца» по 15 минут — это 5 минут в месяц, поэтому
       * редкие дела не съедают день целиком.
       */
      const weight = task.minutes / rule.intervalCount;

      if (spent + weight > monthBudget) {
        continue;
      }

      const offset = (cycleOffset.get(cadence) ?? 0) % rule.intervalCount;
      const months = activeMonths(rule.intervalCount, offset);

      /**
       * Сколько минут ещё влезает на это число в худшем из его месяцев.
       *
       * Свободное время числа считается от бюджета по ответу за вычетом
       * ежедневного минимума и недельных дел этого дня недели (freeByDate выше),
       * поэтому месячное дело не пробивает дневной лимит ни на одном конкретном
       * числе. Раньше здесь был жёсткий лимит 40 минут — из-за него дни
       * «под завязку» складывались с недельным планом и выходили за бюджет.
       */
      const slack = (day: number): number => {
        const loads = monthSlots.get(day) ?? [];
        const limit = freeByDate.get(day) ?? 0;

        return months.reduce(
          (worst, month) => Math.min(worst, limit - (loads[month] ?? 0) - task.minutes),
          Number.POSITIVE_INFINITY
        );
      };

      const candidates = [...freeByDate.keys()].filter((day) => slack(day) >= 0);

      if (candidates.length === 0) {
        continue;
      }

      const target = candidates.sort((left, right) => {
        const bySlack = slack(right) - slack(left);

        if (Math.abs(bySlack) > 0.001) return bySlack;

        // При равном запасе — сначала числа, свободные от недельной уборки.
        const leftBusy = cleaningDays.has(weekdayOfMonthDay(today, left)) ? 1 : 0;
        const rightBusy = cleaningDays.has(weekdayOfMonthDay(today, right)) ? 1 : 0;

        if (leftBusy !== rightBusy) return leftBusy - rightBusy;

        return left - right;
      })[0];

      const loads = monthSlots.get(target) ?? [];

      for (const month of months) {
        loads[month] = (loads[month] ?? 0) + task.minutes;
      }

      monthSlots.set(target, loads);
      cycleOffset.set(cadence, (cycleOffset.get(cadence) ?? 0) + 1);
      spent += weight;

      if (demoted) {
        demotedOffset = (demotedOffset + 1) % DEMOTION_LADDER.length;
      }

      monthTasks.push({
        title: task.task,
        room: task.room,
        minutes: task.minutes,
        level: task.level,
        tags: task.tags,
        cadence,
        frequency: rule.frequency,
        intervalCount: rule.intervalCount,
        dayOfWeek: null,
        dayOfMonth: target,
        // Опорные даты циклов разводятся по месяцам: иначе все квартальные дела
        // выпадали бы на один и тот же месяц и устраивали там «генеральную».
        dueDate: rule.intervalCount > 1 ? shiftMonths(nextMonthDayDate(today, target), offset) : null,
        source: DEFAULT_TASK_SOURCE,
      });

      placed = true;
      break;
    }

    // Ни один цикл не поместился: дело уходит в отчёт, а не в перегруз дня.
    if (!placed) {
      dropped.push(task);
    }
  }

  // ── 4. Ежедневные и итоги ─────────────────────────────────────────────────
  const dailyResult: DefaultTask[] = dailyTasks.map((task) => {
    const rule = CADENCE_RULES.daily;

    return {
      title: task.task,
      room: task.room,
      minutes: task.minutes,
      level: task.level,
      tags: task.tags,
      cadence: task.cadence,
      frequency: rule.frequency,
      intervalCount: rule.intervalCount,
      dayOfWeek: null,
      dayOfMonth: null,
      dueDate: null,
      source: DEFAULT_TASK_SOURCE,
    };
  });

  const allTasks = [...dailyResult, ...tasks, ...monthTasks];

  const weeklyTasks = tasks.filter((task) => task.frequency === 'weekly');
  const weeklyMinutes = weeklyTasks.reduce((sum, task) => sum + task.minutes, 0);
  const monthlyMinutes = monthTasks.reduce((sum, task) => sum + task.minutes, 0);
  const maxDailyMinutes = slots.reduce((max, slot) => Math.max(max, slot.minutes), 0);

  /**
   * Ротация ежедневного блока в том виде, в каком она попала в набор.
   *
   * В `rotatedPlaced` попадают только удачные раскладки: дело, которому не
   * хватило места в днях уборки, ушло в месячный круг и в ежедневном блоке его
   * больше нет — считать его ротацией было бы неправдой. Поэтому счёт берётся
   * отсюда, а не из `rotationPool` (там и переполнившиеся дела).
   */
  const rotatedMinutes = [...rotatedPlaced].reduce((sum, task) => sum + task.minutes, 0);

  const days: DefaultTaskDay[] = slots.map((slot) => ({
    dayOfWeek: slot.dayOfWeek,
    label: slot.label,
    selected: slot.selected,
    tasks: [
      ...dailyResult,
      ...tasks.filter((task) => task.dayOfWeek === slot.dayOfWeek),
    ],
    minutes: slot.minutes,
  }));

  notes.push(
    `Каждый день: ${dailyResult.length} ежедневных дел (${dailyMinutes} мин). По дням уборки разложено ещё ${rotatedPlaced.size} дел ежедневного блока — дни отличаются друг от друга`
  );

  if (overflow.length > 0) {
    notes.push(
      `Недельных дел больше, чем помещается в лимит: ${overflow.length} переведены в месячные`
    );
  }

  if (dropped.length > 0) {
    notes.push(
      `В набор вошли ${allTasks.length} дел — столько помещается в бюджет ${budget} минут в день (ответ «${answers.dailyMinutes}»)`
    );
  }

  if (skippedByQuota > 0) {
    notes.push(
      `Полы и пыль масштабированы по числу комнат (${answers.rooms}): ${skippedByQuota} задач других зон не добавлены`
    );
  }

  return {
    scheduleTitle: DEFAULT_TASKS_SCHEDULE_TITLE,
    tasks: allTasks,
    summary: {
      totalTasks: allTasks.length,
      totalMinutes: allTasks.reduce((sum, task) => sum + task.minutes, 0),
      dailyTasks: dailyResult.length,
      dailyMinutes,
      rotatedTasks: rotatedPlaced.size,
      rotatedMinutes,
      weeklyTasks: weeklyTasks.length,
      weeklyMinutes,
      monthlyTasks: monthTasks.length,
      monthlyMinutes,
      droppedTasks: dropped.length,
      maxDailyMinutes,
      dailyLimit: budget,
      rooms: [...new Set(allTasks.map((task) => task.room))],
      tags: [...new Set(allTasks.flatMap((task) => task.tags))],
      days,
      notes,
    },
  };
};

/** Сколько задач каталога подходит под ответы — для диагностики пустого набора. */
export const defaultTaskCandidateCount = (input: PartialHomeAnswers): number => {
  const answers = withDefaultAnswers(input);
  const declared = activeHomeTags(answers);

  return getTaskCatalog().filter((task) => isRelevant(task, answers, declared)).length;
};
