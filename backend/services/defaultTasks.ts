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
  type HomeAnswers,
  type PartialHomeAnswers,
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
 *  1. **Контекст — жёсткий фильтр.** Нет питомцев — в наборе нет ни одной задачи с
 *     тегом pets; нет детской, балкона, двора или работы из дома — нет и их задач.
 *     Стирка фильтруется по способу сушки (`drying`): при сушильной машине не
 *     предлагаем развешивание на воздухе и наоборот. Гараж исключён всегда.
 *  2. **Ни одна подходящая задача каталога не теряется без причины.** Раньше
 *     здесь стояли квоты («полов не больше трёх, пыли не больше двух»), и всё, что
 *     в квоту не влезло, уходило в `droppedTasks`: задача в каталоге есть, а
 *     человек её не видит никогда. Заказчик описал это как «странная квота: если
 *     выбираешь небольшое количество времени, многие задачи просто не увидим» — и
 *     был прав, поэтому **квоты убраны**. Теперь бюджет сначала удлиняет цикл: не
 *     помещается неделя — дело уходит на «раз в 2 / 3 / 6 недель», потом на
 *     месяцы, кварталы, полгода и год. Выбрасывается только то, чему не хватило
 *     места даже на самой редкой ступени (36 месяцев): при очень маленьком бюджете
 *     («минимум, 2 дня») часть обслуживания дома физически не помещается, и
 *     честнее сказать это числом в `summary.droppedTasks` и перечислить названия,
 *     чем растянуть дело до пяти лет. На проверенных профилях потерь нет у
 *     большинства: они есть у «минимум, 2 дня» и у семидневного профиля.
 *  3. **Частое — то, что заметно влияет на чистоту; редкое — обслуживание.**
 *     Полы, постельное, кухонные поверхности и санузел — недельные или раз в две
 *     недели. Пыль по зонам, подоконники, ручки, выключатели, мелкие протирания —
 *     раз в 2, 3 или 6 недель. Фильтры, накипь, окна и расхламление живут в
 *     месячной шкале и реже. Каталог задаёт **самый частый** цикл дела
 *     («не реже, чем раз в…»), генератор его только удлиняет под бюджет.
 *  4. **Дневной бюджет** берётся из ответа анкеты (services/dailyBudget.ts:
 *     under30 → 25, 30to60 → 55, depends → 35, сверху жёсткий потолок
 *     MAX_DAILY_MINUTES = 60) и применяется к **сумме** всех сгенерированных дел
 *     дня — этот набор делит его с недельным планом (services/homePlan.ts).
 *     Недельные дела встают в выбранные дни уборки (`cleaningDays`), редкие — на
 *     числа месяца, и каждая раскладка проверяется по фактической занятости дня.
 *  5. **Полы — одна задача на всю квартиру.** Отдельных «вымыть пол в комнате X»
 *     в каталоге больше нет: заказчик просил мыть и пылесосить полы разом, а по
 *     зонам оставить пыль, зеркала, подоконники и прочее. Дублей по названию в
 *     наборе быть не может: название — ключ расписания.
 *  6. **Периодичность** выражается парой (frequency, intervalCount): «раз в день»,
 *     «раз в неделю», «раз в 2 / 3 / 6 недель», «раз в месяц», «раз в 3 месяца»,
 *     «раз в полгода», «раз в год». Задачи с интервалом больше единицы получают
 *     dueDate — опорную дату, от которой считается цикл (см. выборку «Сегодня» в
 *     backend/routes/tasks.ts). Недельные интервалы считаются той же формулой
 *     `MOD(FLOOR((дата - due_date)/7), interval_count) = 0`, поэтому «раз в
 *     3 недели» и «раз в 6 недель» не требуют отдельного правила.
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
 * Абсолютный потолок дневной нагрузки набора.
 *
 * Сами числа бюджета живут в services/dailyBudget.ts — общий источник правды для
 * обоих генераторов. Здесь только совместимый реэкспорт: модуль исторически был
 * точкой входа для этого потолка (им пользуется scripts/check-default-tasks.ts).
 */
export { MAX_DAILY_MINUTES };

/**
 * Предел задач одной зоны в одном дне.
 *
 * Заказчик сформулировал так: «одна зона не должна доминировать». Предел
 * проверяется по готовому дню, поэтому он один на генератор и на проверку
 * (scripts/check-default-tasks.ts), иначе они разъедутся.
 */
export const MAX_ZONE_TASKS_PER_DAY = 2;

/**
 * Потолок цикла, до которого генератор удлиняет дело, чтобы оно не потерялось.
 *
 * Пять лет — это уже не уборка, а «когда-нибудь»: дальше удлинять бессмысленно.
 * Всё, что не помещается и сюда, честно попадает в `summary.droppedTasks` и
 * перечисляется в примечаниях — при очень маленьком бюджете («минимум, 2 дня»)
 * часть обслуживания дома физически не помещается, и обещать обратное нельзя.
 */
const MAX_CYCLE_MONTHS = 60;

/**
 * Интервал периодичности каталога в днях — единственный источник правды для
 * `interval_count` задач.
 *
 * Решение заказчика: периодичность выражается **днями**, а не неделями и месяцами.
 * Недельные ступени — 7/14/21/42, месячные — 30/60/90/120/180, а годовое дело
 * каталога становится «раз в 180 дней»: полгода — верхняя граница цикла
 * сгенерированной задачи. Раскладка при этом продолжает считать клетки «число
 * месяца + месяц года» в месяцах (это её рабочая величина), а в задачу уходит
 * день — см. `slotDayCount`.
 */
const CADENCE_DAYS: Record<TaskCadence, number> = {
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
  yearly: 180,
  twoYears: 720,
  threeYears: 1080,
  fourYears: 1440,
  fiveYears: 1800,
};

/**
 * Верхняя граница цикла сгенерированной задачи: полгода.
 *
 * Годовое дело каталога попадает сюда же (180 дней) — по решению заказчика
 * «полгода» и есть верхняя граница. Всё, чему не хватило места на этой ступени,
 * уходит в `summary.droppedTasks`, а не превращается в «раз в 3 года».
 */
export const MAX_GENERATED_INTERVAL_DAYS = 180;

/** Недель в месяце: по нему недельная шкала каталога переводится в месячную. */
const WEEKS_PER_MONTH = 4.33;

/**
 * Недельные ступени лестницы: ровно те, что названы в правке заказчика.
 *
 * Больше шести недель в недельной шкале не бывает: 8, 13, 17 и 26 недель — это
 * уже 2, 3, 4 и 6 месяцев. Подписывать их неделями значило бы выдавать один срок
 * за другой, да и читается «раз в 2 месяца» понятнее, чем «раз в 8 недель».
 */
const WEEKLY_RUNGS: readonly number[] = [1, 2, 3, 6];

/**
 * Месячные ступени лестницы — от месяца до пяти лет.
 *
 * Каждый шаг либо делит 12, либо кратен ему. Это не косметика: от шага зависит, в
 * какие месяцы года попадает дело. «Раз в 18 месяцев» не выражается целым числом
 * месяцев года (12 и 18 не согласованы), из-за чего проверка и выборка «Сегодня»
 * начинали расходиться, и дела копились в одном месяце (замер: 292 минуты на
 * 13-е число при бюджете 35).
 */
const MONTHLY_RUNGS: readonly number[] = [1, 2, 3, 4, 6, 12, 24, 36, 48, 60];

/**
 * Название месячной ступени: подпись обязана совпадать со сроком.
 *
 * Каталог знает только месяц, квартал, полгода и год, а генератору нужны ещё
 * промежуточные ступени (2 и 4 месяца) и длинные (2-5 лет): иначе дело, которому
 * не хватило бюджета, пришлось бы либо выбросить, либо назвать чужим сроком.
 */
const MONTHLY_CADENCE_NAMES: Record<number, TaskCadence> = {
  1: 'monthly',
  2: 'twoMonths',
  3: 'quarterly',
  4: 'fourMonths',
  6: 'semiannual',
  12: 'yearly',
  24: 'twoYears',
  36: 'threeYears',
  48: 'fourYears',
  60: 'fiveYears',
};

/** Частота, которую понимает таблица tasks и выборка «Сегодня». */
export type DefaultTaskFrequency = 'daily' | 'weekly' | 'monthly';

/** Периодичность каталога → пара (frequency, interval_count в днях). */
const CADENCE_RULES: Record<
  TaskCadence,
  { frequency: DefaultTaskFrequency; intervalCount: number }
> = {
  daily: { frequency: 'daily', intervalCount: CADENCE_DAYS.daily },
  weekly: { frequency: 'weekly', intervalCount: CADENCE_DAYS.weekly },
  biweekly: { frequency: 'weekly', intervalCount: CADENCE_DAYS.biweekly },
  // Новые недельные периодичности: та же частота 'weekly', другой интервал.
  // Выборка на день уже умеет интервалы (`MOD(FLOOR((дата - due_date)/7), N)`),
  // поэтому отдельного правила для «раз в 3 недели» нигде заводить не нужно.
  threeWeeks: { frequency: 'weekly', intervalCount: CADENCE_DAYS.threeWeeks },
  sixWeeks: { frequency: 'weekly', intervalCount: CADENCE_DAYS.sixWeeks },
  monthly: { frequency: 'monthly', intervalCount: CADENCE_DAYS.monthly },
  twoMonths: { frequency: 'monthly', intervalCount: CADENCE_DAYS.twoMonths },
  quarterly: { frequency: 'monthly', intervalCount: CADENCE_DAYS.quarterly },
  fourMonths: { frequency: 'monthly', intervalCount: CADENCE_DAYS.fourMonths },
  semiannual: { frequency: 'monthly', intervalCount: CADENCE_DAYS.semiannual },
  yearly: { frequency: 'monthly', intervalCount: CADENCE_DAYS.yearly },
  twoYears: { frequency: 'monthly', intervalCount: CADENCE_DAYS.twoYears },
  threeYears: { frequency: 'monthly', intervalCount: CADENCE_DAYS.threeYears },
  fourYears: { frequency: 'monthly', intervalCount: CADENCE_DAYS.fourYears },
  fiveYears: { frequency: 'monthly', intervalCount: CADENCE_DAYS.fiveYears },
};

/** Каденсы недельной шкалы: их цикл — недели, дни недели и `due_date`. */
const WEEKLY_CADENCES: readonly TaskCadence[] = [
  'weekly',
  'biweekly',
  'threeWeeks',
  'sixWeeks',
];

/**
 * Самый частый цикл дела в месяцах — то, что стоит в каталоге.
 *
 * Это «не реже, чем раз в…»: недельное дело — не реже раза в неделю, годовое — не
 * реже раза в год. Бюджет может только удлинить цикл, укоротить его нельзя: иначе
 * каталог переставал бы что-либо значить.
 */
const CADENCE_PREFERRED_MONTHS: Record<TaskCadence, number> = {
  daily: 0,
  weekly: 1 / WEEKS_PER_MONTH,
  biweekly: 2 / WEEKS_PER_MONTH,
  threeWeeks: 3 / WEEKS_PER_MONTH,
  sixWeeks: 6 / WEEKS_PER_MONTH,
  monthly: 1,
  twoMonths: 2,
  quarterly: 3,
  fourMonths: 4,
  semiannual: 6,
  yearly: 12,
  twoYears: 24,
  threeYears: 36,
  fourYears: 48,
  fiveYears: 60,
};

/**
 * Дела, частота которых задана заказчиком точно и бюджетом не обсуждается.
 *
 * «Сменить постельное бельё» — раз в неделю (пункты 1 и 4 правки), полы — тоже
 * раз в неделю: заказчик назвал их тем, что «не такое, как остальное», то есть
 * что нельзя уводить в редкие циклы. «Помыть зеркало в ванной без разводов» — раз
 * в месяц, «Протереть зеркало в прихожей» — раз в 3 недели (пункт 6).
 *
 * Такие дела разбираются **первыми** и начинают со своей ступени: иначе частые
 * дела каталога займут дни уборки, и названная частота уедет на пятилетний цикл.
 * Если места нет даже для них, дело всё равно не теряется — оно уходит на более
 * редкую ступень (см. правило 2 в шапке модуля).
 */
const PINNED_CADENCE: Record<string, TaskCadence> = {
  'Сменить постельное бельё': 'weekly',
  'Вымыть полы во всей квартире': 'weekly',
  'Пропылесосить полы во всей квартире': 'weekly',
  'Помыть зеркало в ванной без разводов': 'monthly',
  'Протереть зеркало в прихожей': 'threeWeeks',
};

/** Периодичность каталога в виде пары, которую понимает таблица tasks. */
export type DefaultTaskCadenceInfo = {
  frequency: DefaultTaskFrequency;
  intervalCount: number;
};

// ── Даты ───────────────────────────────────────────────────────────────────

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const utcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** Ближайший день недели на сегодня или позже: опора цикла «раз в N недель». */
export const nextWeekdayDate = (today: Date, dayOfWeek: number): string => {
  const base = utcDay(today);
  base.setUTCDate(base.getUTCDate() + ((dayOfWeek - base.getUTCDay() + 7) % 7));

  return isoDate(base);
};

/**
 * Ближайшая дата, у которой нужный день недели и которую цикл действительно
 * застаёт при интервале N недель.
 *
 * «Раз в 3 недели» в понедельник — это не любой понедельник, а каждый третий от
 * опоры: выборка считает `MOD(FLOOR((дата - due_date)/7), 3) = 0`. Если опорой
 * взять ближайший понедельник, цикл может ни разу не совпасть с выбранным днём
 * уборки, и человек задачи не увидит. Поэтому опора подбирается перебором.
 */
export const nextAlignedWeekdayDate = (today: Date, dayOfWeek: number, weeks: number): string => {
  const nearest = nextWeekdayDate(today, dayOfWeek);

  if (weeks <= 1) return nearest;

  const anchor = new Date(`${nearest}T00:00:00Z`).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let step = 0; step < weeks; step += 1) {
    const base = utcDay(today);
    base.setUTCDate(base.getUTCDate() + step);
    const candidate = nextWeekdayDate(base, dayOfWeek);
    const apart = Math.round((new Date(`${candidate}T00:00:00Z`).getTime() - anchor) / dayMs);

    if (apart % (weeks * 7) === 0) return candidate;
  }

  return nearest;
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
 * Свободные минуты каждого числа месяца (1-28) после ежедневного минимума.
 *
 * Экспортируется: этим же расчётом пользуется перенос задач из «Плана по дому»
 * (services/mergePlanIntoTasks.ts). В наборе ежедневных дел нет, поэтому
 * `dailyMinutes` там всегда ноль, но параметр оставлен — функция общая.
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

    free.set(day, Math.max(0, budget - options.dailyMinutes - weekly));
  }

  return free;
};

/**
 * Число месяца для одного дела «раз в месяц» и реже.
 *
 * Правило то же, что и в раскладке месячного круга внутри `buildDefaultTasks`:
 * сначала числа, свободные от выбранных дней уборки, затем — с наибольшим
 * запасом минут, при равенстве — меньшее число.
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
 * Периодичность каталога в виде пары, которую понимает таблица tasks.
 *
 * Экспортируется: перенос задач недельного плана в набор «Мои задачи»
 * (services/mergePlanIntoTasks.ts) обязан брать частоту из того же правила, а не
 * заводить вторую таблицу соответствий.
 */
export const cadenceRule = (cadence: TaskCadence): DefaultTaskCadenceInfo =>
  CADENCE_RULES[cadence];

/**
 * Периодичность одной задачи по её `cadence` из каталога — готовая строка для
 * tasks (frequency + interval_count + день/число + опора цикла).
 *
 * Экспортируется: перенос задач из «Плана по дому» (services/mergePlanIntoTasks.ts)
 * обязан проставлять периодичность ровно по этим правилам:
 *  - ежедневные дела не привязаны ни к чему;
 *  - недельные и «раз в 2/3/6 недель» встают на день недели, а при интервале
 *    больше единицы получают опору, выровненную по этому дню;
 *  - месячные и реже получают самое свободное число месяца (pickMonthlyDay).
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
      dueDate:
        rule.intervalCount > 1
          ? nextAlignedWeekdayDate(options.today, dayOfWeek, rule.intervalCount)
          : null,
    };
  }

  const dayOfMonth = pickMonthlyDay(options.freeByDate, options.answers.cleaningDays, options.today);

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

/**
 * Подходит ли задача ответам анкеты: уровень уборки, контекст и способ сушки.
 *
 * Гараж исключён жёстко, а не по ответу анкеты: заказчик попросил убрать вопрос
 * про гараж и не ставить задачи на гараж вовсе, а ответ у существующих профилей
 * уже сохранён. Каталог гаражные дела сохраняет (они пригодятся, если гараж
 * вернётся отдельной функцией), но в набор не попадают.
 */
const isRelevant = (task: CatalogTask, answers: HomeAnswers, declared: TaskTag[]): boolean => {
  if (task.room === 'Гараж' || task.tags.includes('garage')) return false;

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
  /** Минуты недельных дел этого дня. */
  minutes: number;
}

/**
 * Одна ступень цикла: как дело попадёт в расписание.
 *
 * `months` — рабочая величина раскладки: шаг цикла в месяцах (у недельного дела он
 * дробный: 3 недели — это 0.69 месяца), по ней считаются клетки «число месяца +
 * месяц года». `intervalCount` — то, что уходит в задачу: интервал **в днях**
 * (7/14/21/42 у недельных ступеней, 30/60/90/120/180 у месячных).
 */
interface CadenceSlot {
  cadence: TaskCadence;
  frequency: DefaultTaskFrequency;
  /** Интервал в днях: `interval_count` задачи (решение заказчика, миграция 0022). */
  intervalCount: number;
  /** Сколько раз в году дело повторяется на этой ступени. */
  timesPerYear: number;
  /** Шаг цикла в месяцах: по нему строится ряд более редких ступеней. */
  months: number;
}

/** Одна задача постоянного набора: готовая строка для INSERT в tasks. */
export interface DefaultTask {
  title: string;
  room: string;
  minutes: number;
  level: TaskLevel;
  tags: TaskTag[];
  /**
   * Периодичность, с которой дело попадает в расписание, — её видят подписи в
   * интерфейсе. Может быть **реже** каталога: бюджет удлиняет цикл, но не
   * выбрасывает дело (см. правило 2 в шапке модуля).
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
  /** Недельные дела этого дня. Ежедневных дел в каталоге нет — рутина убрана. */
  tasks: DefaultTask[];
  minutes: number;
}

export interface DefaultTaskSet {
  scheduleTitle: string;
  tasks: DefaultTask[];
  summary: {
    totalTasks: number;
    totalMinutes: number;
    /** По-настоящему ежедневные дела: каталог от бытовой рутины избавлен, их ноль. */
    dailyTasks: number;
    dailyMinutes: number;
    /** Дела ежедневного блока в ротации. Оставлено ради совместимости формы ответа. */
    rotatedTasks: number;
    rotatedMinutes: number;
    weeklyTasks: number;
    weeklyMinutes: number;
    monthlyTasks: number;
    monthlyMinutes: number;
    /**
     * Сколько подходящих дел каталога так и не попало в набор.
     *
     * Цель правки — ноль: дело должно уходить на более редкий цикл, а не
     * исчезать. Если число больше нуля, в `notes` написано, какие именно дела и
     * почему не влезли даже в самый длинный цикл.
     */
    droppedTasks: number;
    /** Названия потерянных дел: без них «0 против 3» в отчёте ничего не значит. */
    droppedTitles: string[];
    /** Сколько подходящих дел каталога было у профиля — знаменатель полноты набора. */
    candidateTasks: number;
    /** Сколько дел каталога вошло в набор: `candidateTasks - droppedTasks`. */
    includedTasks: number;
    /** Худший день недели: сумма недельных дел этого дня. */
    maxDailyMinutes: number;
    dailyLimit: number;
    rooms: string[];
    tags: TaskTag[];
    /** Сколько дел попало на каждую периодичность — по нему видны новые 3 и 6 недель. */
    cadences: Record<TaskCadence, number>;
    /** Во сколько раз пришлось растянуть циклы, чтобы весь каталог поместился. */
    cycleScale: number;
    days: DefaultTaskDay[];
    notes: string[];
  };
}

/** Порядок периодичностей для отчёта: от частого к редкому. */
const CADENCE_ORDER: readonly TaskCadence[] = [
  'daily',
  'weekly',
  'biweekly',
  'threeWeeks',
  'sixWeeks',
  'monthly',
  'twoMonths',
  'quarterly',
  'fourMonths',
  'semiannual',
  'yearly',
  'twoYears',
  'threeYears',
  'fourYears',
  'fiveYears',
];

/**
 * Месяцы года (0-11), в которые дело попадает при своём интервале и опоре.
 *
 * Класс месяца — это месяц, сравнимый с месяцем опоры по модулю интервала: дело
 * «раз в N месяцев» с опорой в марте бывает в марте, в марте через N месяцев и
 * так далее. Отсюда и `MOD(месяц - опора, N) = 0` в выборке «Сегодня».
 *
 * Функция экспортируется, и это принципиально: тем же правилом пользуются
 * проверка (scripts/check-default-tasks.ts) и тест дневного бюджета. Пока классы
 * считались в трёх местах по-разному, генератор, проверка и тест расходились, и
 * набор либо не проходил проверку, либо терял дела.
 */
export const monthClassesOf = (intervalCount: number, anchorMonth: number): number[] => {
  const interval = Math.max(1, intervalCount);
  const months: number[] = [];

  for (let month = 0; month < 12; month += 1) {
    if ((((month - anchorMonth) % interval) + interval) % interval === 0) months.push(month);
  }

  return months;
};

/** Кэш наборов классов по интервалу: раскладка зовёт их тысячи раз. */
const monthClassCache = new Map<number, ReadonlyArray<{ anchor: number; months: number[] }>>();

/**
 * Разные наборы классов месяца для интервала — по одному на вариант опоры.
 *
 * Опор с одинаковым набором классов не больше, чем самих классов: у интервала 1
 * все двенадцать опор дают один и тот же набор «все месяцы», у интервала 2 —
 * два набора, у интервала 12 — двенадцать одноэлементных. Поэтому перебор опор
 * сводится к перебору наборов: раскладка перестаёт быть квадратичной.
 */
const monthClassSets = (
  intervalCount: number
): ReadonlyArray<{ anchor: number; months: number[] }> => {
  const cached = monthClassCache.get(intervalCount);

  if (cached) return cached;

  const unique = new Map<string, { anchor: number; months: number[] }>();

  for (let anchor = 0; anchor < 12; anchor += 1) {
    const months = monthClassesOf(intervalCount, anchor);
    const key = months.join(',');

    if (!unique.has(key)) unique.set(key, { anchor, months });
  }

  const sets = [...unique.values()];

  monthClassCache.set(intervalCount, sets);

  return sets;
};

/** Как назвать недельный цикл: подпись совпадает с числом недель. */
const weeklyCadenceName = (weeks: number): TaskCadence =>
  weeks === 1
    ? 'weekly'
    : weeks === 2
      ? 'biweekly'
      : weeks === 3
        ? 'threeWeeks'
        : 'sixWeeks';

/**
 * Ступень в неделях или месяцах по её шагу.
 *
 * Ступень считается **недельной** только тогда, когда её шаг — ровно целое число
 * недель (1, 2, 3 или 6). «Месяц» — это 4.33 недели, и округлить его до четырёх
 * значило бы выдать месячное дело за недельное: подпись и `interval_count` в базе
 * разъехались бы с тем, что человек видит.
 */
const slotFromMonths = (months: number, fallbackCadence: TaskCadence): CadenceSlot => {
  const weeks = Math.round(months * WEEKS_PER_MONTH);
  const isWeekly =
    weeks >= 1 && weeks <= 6 && Math.abs(months * WEEKS_PER_MONTH - weeks) < 1e-6;

  if (isWeekly) {
    const cadence = weeklyCadenceName(weeks);

    return {
      cadence,
      frequency: 'weekly',
      // В задачу уходит день: «раз в 3 недели» — это 21, а не 3 (миграция 0022).
      intervalCount: CADENCE_DAYS[cadence],
      timesPerYear: 52 / weeks,
      months,
    };
  }

  const wholeMonths = Math.max(1, Math.round(months));
  const cadence = MONTHLY_CADENCE_NAMES[wholeMonths] ?? fallbackCadence;

  return {
    cadence,
    frequency: 'monthly',
    intervalCount: CADENCE_DAYS[cadence],
    timesPerYear: 12 / wholeMonths,
    months,
  };
};

/**
 * Лестница ступеней дела: от частоты каталога до самого редкого цикла.
 *
 * Первая ступень — то, что стоит в каталоге («не реже, чем раз в…»); дальше дело
 * пробует всё более редкие циклы, пока не найдёт место. Шкалы не смешиваются: у
 * месячного дела в лестнице нет недельных ступеней (это была бы другая подпись
 * того же срока, и «раз в месяц» превратилось бы в «раз в 6 недель»), а у
 * недельного после шести недель начинаются месяцы.
 */
const slotLadder = (task: CatalogTask): CadenceSlot[] => {
  const cadence = PINNED_CADENCE[task.task] ?? task.cadence;

  if (cadence === 'daily') {
    return [
      { cadence: 'daily', frequency: 'daily', intervalCount: 1, timesPerYear: 365, months: 0 },
    ];
  }

  const preferred = CADENCE_PREFERRED_MONTHS[cadence];
  const slots: CadenceSlot[] = [];

  if (WEEKLY_CADENCES.includes(cadence)) {
    for (const weeks of WEEKLY_RUNGS) {
      const months = weeks / WEEKS_PER_MONTH;

      if (months >= preferred - 1e-9) slots.push(slotFromMonths(months, cadence));
    }
  }

  for (const months of MONTHLY_RUNGS) {
    if (months >= preferred - 1e-9) slots.push(slotFromMonths(months, cadence));
  }

  return slots.sort((left, right) => left.months - right.months);
};

/** Общее для всех попыток раскладки: от порядка разбора не зависит. */
interface BuildContext {
  answers: HomeAnswers;
  catalogOrder: Map<string, number>;
  pool: CatalogTask[];
  budget: number;
  today: Date;
}

/** Что получилось из раскладки. */
interface BuildAttempt {
  tasks: DefaultTask[];
  slots: DaySlot[];
  dropped: CatalogTask[];
  cadenceCounts: Record<TaskCadence, number>;
  monthSpent: number;
  /** Во сколько раз циклы в среднем длиннее каталожных: это видит отчёт. */
  cycleScale: number;
  /** Общий шаг редких дел в месяцах, с которым строилась эта попытка. */
  scale: number;
  /** Сколько минут дня эта попытка оставляла недельным делам. */
  weeklyCap: number;
}

/** Наименьшая месячная ступень дела: с неё начинается его редкая шкала. */
const firstMonthlyRung = (task: CatalogTask): number => {
  const cadence = PINNED_CADENCE[task.task] ?? task.cadence;
  const preferred = CADENCE_PREFERRED_MONTHS[cadence];

  return MONTHLY_RUNGS.find((months) => months >= preferred - 1e-9) ?? MAX_CYCLE_MONTHS;
};

/**
 * Общий шаг циклов для редких дел.
 *
 * Считается по фактической вместимости чисел, а не «на глаз»: клетка «число
 * месяца + месяц года» держит минуты, и дело занимает столько клеток, сколько
 * месяцев у него в цикле (месячное — двенадцать, годовое — одну). Если спрос
 * больше вместимости, шаг растёт сразу у **всех** редких дел, а не только у тех,
 * что разбираются последними.
 *
 * Без этого шага первые дела занимали месячный цикл во всех двенадцати клетках
 * каждого дня, клетки забивались, и дальше не помещалось почти ничего: замер на
 * профиле «7 дней в неделю» — 179 потерь из 260. С шагом потери исчезают.
 */
const rareScaleFor = (
  capacity: ReadonlyMap<number, number>,
  rareTasks: readonly CatalogTask[]
): number => {
  if (rareTasks.length === 0) return 1;

  let capacityMinutes = 0;

  for (const limit of capacity.values()) capacityMinutes += 12 * limit;

  for (const months of MONTHLY_RUNGS) {
    let spent = 0;

    for (const task of rareTasks) {
      const interval = Math.max(firstMonthlyRung(task), months);
      const classes = monthClassesOf(interval, 0).length;

      spent += task.minutes * classes;
    }

    if (spent <= capacityMinutes * 0.85) return months;
  }

  return MAX_CYCLE_MONTHS;
};

/**
 * Раскладка набора: сначала недельные дела, потом редкие.
 *
 * Порядок фаз принципиален. Недельные дела занимают конкретные дни недели, и их
 * минуты входят в бюджет **каждого** числа с этим днём недели. Редкое дело
 * выбирает число по остатку дня, поэтому ему нужна готовая занятость дней недели,
 * а не та, что накопилась к моменту его разбора: иначе зеркало вставало на среду,
 * куда потом ложились недельные дела, и число выходило за бюджет (замер:
 * 22 + 10 = 32 минуты при бюджете 25).
 *
 * `weeklyCap` — сколько минут дня разрешено занять недельным делам. Потолок нужен
 * потому, что бюджет дня делят оба вида дел: если недельные заберут день целиком
 * (а на семи днях уборки они забирают все семь), редким не останется ничего, и
 * почти весь каталог уедет в потери (замер: 33 дела из 260 на профиле «7 дней в
 * неделю»). Названные заказчиком дела от потолка освобождены: их частота не
 * обсуждается, и потолок не должен её отменять.
 *
 * Дело, которому не хватило места на своей ступени, не теряется: оно переходит на
 * более редкую ступень (правило 2 в шапке модуля) и попадает в `dropped` только
 * если не поместилось даже на пятилетнем цикле.
 */
const attemptBuild = (
  context: BuildContext,
  weeklyCap: number,
  scaleOverride?: number
): BuildAttempt => {
  const { answers, budget, pool, catalogOrder, today } = context;
  const cleaningDays = new Set(orderWeekDays(answers.cleaningDays));
  const slots: DaySlot[] = WEEK_DAYS.map(({ dayOfWeek, label }) => ({
    dayOfWeek,
    label,
    selected: cleaningDays.has(dayOfWeek),
    tasks: [],
    minutes: 0,
  }));

  const zoneFits = (slot: DaySlot, task: CatalogTask): boolean =>
    slot.tasks.filter((entry) => entry.room === task.room).length < MAX_ZONE_TASKS_PER_DAY;

  /** Потолок недельных дел для конкретного дела: названные заказчиком — без потолка. */
  const capFor = (task: CatalogTask): number => (PINNED_CADENCE[task.task] ? budget : weeklyCap);

  const tasks: DefaultTask[] = [];
  const dropped: CatalogTask[] = [];
  const cadenceCounts = Object.fromEntries(
    CADENCE_ORDER.map((cadence) => [cadence, 0])
  ) as Record<TaskCadence, number>;

  let monthSpent = 0;

  /** Нагрузка месяца у дела на этой ступени: минуты в год, делённые на 12. */
  const monthWeightOf = (slot: CadenceSlot, task: CatalogTask): number =>
    (task.minutes * slot.timesPerYear) / 12;

  /** Минуты недельных дел по дням недели: ровно это «Сегодня» показывает каждую неделю. */
  const weeklyMinutesByWeekday = (): Map<number, number> =>
    new Map(slots.map((entry) => [entry.dayOfWeek, entry.minutes]));

  /**
   * Вместимость числа месяца под редкие дела.
   *
   * Редкое дело стоит в дне вместе с недельными делами своего дня недели, поэтому
   * лимит — бюджет дня минус недельные дела **готовой** раскладки. Недельные дела
   * разбираются первыми (фаза A), так что к разбору редких это точная величина, а
   * не оценка. Ту же величину считают проверка (scripts/check-default-tasks.ts) и
   * тест дневного бюджета: все три места берут её из одного правила, поэтому
   * расходиться им больше нечем.
   */
  const capacityByMonthDay = (): Map<number, number> => {
    const weekly = weeklyMinutesByWeekday();
    const capacity = new Map<number, number>();

    for (let day = 1; day <= 28; day += 1) {
      const busy = weekly.get(weekdayOfMonthDay(today, day)) ?? 0;

      capacity.set(day, Math.max(0, budget - busy));
    }

    return capacity;
  };

  /** День недели для недельного дела: самый свободный из выбранных. */
  const findWeekDay = (task: CatalogTask): DaySlot | null => {
    const limit = capFor(task);
    const candidates = slots.filter(
      (slot) => slot.selected && limit - slot.minutes >= task.minutes && zoneFits(slot, task)
    );

    if (candidates.length === 0) return null;

    // Пустой выбранный день закрывается первым: человек выбрал его сам, и пустым
    // он выглядеть не должен.
    const empty = candidates.filter((slot) => slot.tasks.length === 0);
    const free = empty.length > 0 ? empty : candidates;

    return free.reduce((best, slot) => (slot.minutes < best.minutes ? slot : best));
  };

  /** Ставит недельное дело в день: его минуты занимают этот день недели. */
  const placeWeekly = (task: CatalogTask, slot: CadenceSlot): boolean => {
    const day = findWeekDay(task);

    if (!day) return false;

    day.tasks.push(task);
    day.minutes += task.minutes;
    monthSpent += monthWeightOf(slot, task);
    cadenceCounts[slot.cadence] += 1;
    tasks.push({
      title: task.task,
      room: task.room,
      minutes: task.minutes,
      level: task.level,
      tags: task.tags,
      cadence: slot.cadence,
      frequency: slot.frequency,
      intervalCount: slot.intervalCount,
      dayOfWeek: day.dayOfWeek,
      dayOfMonth: null,
      dueDate:
        slot.intervalCount > 1
          ? nextAlignedWeekdayDate(today, day.dayOfWeek, slot.intervalCount)
          : null,
      source: DEFAULT_TASK_SOURCE,
    });

    return true;
  };

  /** Занятость клеток «число месяца + месяц года»: по ней выбирается место. */
  const monthLoadByDate = new Map<number, number[]>();

  for (let day = 1; day <= 28; day += 1) {
    monthLoadByDate.set(day, new Array<number>(12).fill(0));
  }

  /** Сколько редких дел уже стоит на каждом числе: по нему идёт разведение по дням. */
  const rareCountByDate = new Map<number, number>();

  for (let day = 1; day <= 28; day += 1) rareCountByDate.set(day, 0);

  /**
   * Находит число месяца и опору для редкого дела.
   *
   * Место ищется по **фактической** занятости клеток: клетка — это пара «число
   * месяца + месяц года», и дело занимает в ней свои минуты. Клеток столько,
   * сколько месяцев у него в цикле: месячное дело бывает в каждом из двенадцати
   * месяцев, годовое — в одном, поэтому редким делам и нужен общий шаг циклов
   * (см. `rareScaleFor`), иначе клетки кончаются.
   *
   * Клетки разных опор у дел одного интервала не пересекаются: два «раз в год» с
   * разными опорами в одном месяце не встречаются. Поэтому и складывать их нельзя
   * — иначе проверка ругалась бы на дела, которых вместе не бывает.
   */
  const findMonthDay = (
    task: CatalogTask,
    slot: CadenceSlot,
    capacity: ReadonlyMap<number, number>
  ): { dayOfMonth: number; anchorMonth: number } | null => {
    const sets = monthClassSets(slot.intervalCount);
    let best: { day: number; anchor: number; load: number; count: number } | null = null;

    for (let day = 1; day <= 28; day += 1) {
      const limit = capacity.get(day) ?? 0;

      if (limit < task.minutes) continue;

      const loads = monthLoadByDate.get(day) ?? [];
      const count = rareCountByDate.get(day) ?? 0;

      for (const set of sets) {
        let worst = 0;
        let fits = true;

        for (const month of set.months) {
          const load = (loads[month] ?? 0) + task.minutes;

          if (load > limit) {
            fits = false;
            break;
          }

          if (load > worst) worst = load;
        }

        if (!fits) continue;

        /**
         * Выбор места: сначала самое свободное (по клетке), затем число, на
         * котором меньше редких дел. Так редкие дела расходятся по всему месяцу,
         * а не сбиваются в первые числа.
         */
        const better =
          best === null ||
          worst < best.load - 0.001 ||
          (Math.abs(worst - best.load) <= 0.001 &&
            (count < best.count || (count === best.count && day < best.day)));

        if (!better) continue;

        best = { day, anchor: set.anchor, load: worst, count };
      }
    }

    if (best === null) return null;

    return { dayOfMonth: best.day, anchorMonth: best.anchor };
  };

  /**
   * Опора цикла `due_date`: первое число месяца опоры.
   *
   * Именно первое число, а не «то же число, что в расписании»: от опоры считается
   * класс месяца, и сдвиг на день увёл бы дело в следующий месяц, разъехавшись с
   * проверкой. Месяц опоры — месяц класса, поэтому дата берётся как его начало.
   */
  const anchorDate = (anchorMonth: number): string => {
    const offset = (((anchorMonth - today.getUTCMonth()) % 12) + 12) % 12;

    return isoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1)));
  };

  /** Ставит редкое дело на число месяца. false — места нет, нужна ступень реже. */
  const placeMonthly = (
    task: CatalogTask,
    slot: CadenceSlot,
    capacity: ReadonlyMap<number, number>
  ): boolean => {
    const place = findMonthDay(task, slot, capacity);

    if (place === null) return false;

    const loads = monthLoadByDate.get(place.dayOfMonth) ?? [];

    for (const month of monthClassesOf(slot.intervalCount, place.anchorMonth)) {
      loads[month] = (loads[month] ?? 0) + task.minutes;
    }

    monthLoadByDate.set(place.dayOfMonth, loads);
    rareCountByDate.set(place.dayOfMonth, (rareCountByDate.get(place.dayOfMonth) ?? 0) + 1);
    monthSpent += monthWeightOf(slot, task);
    cadenceCounts[slot.cadence] += 1;
    tasks.push({
      title: task.task,
      room: task.room,
      minutes: task.minutes,
      level: task.level,
      tags: task.tags,
      cadence: slot.cadence,
      frequency: slot.frequency,
      intervalCount: slot.intervalCount,
      dayOfWeek: null,
      dayOfMonth: place.dayOfMonth,
      dueDate: slot.intervalCount > 1 ? anchorDate(place.anchorMonth) : null,
      source: DEFAULT_TASK_SOURCE,
    });

    return true;
  };

  /**
   * Порядок разбора: названные заказчиком дела, затем от частых к редким.
   *
   * Частое дело дороже стоит в дне, поэтому его место определяется раньше: если
   * разбирать редкое первым, оно займёт свободные числа, а недельное потом не
   * поместится в день и уедет на пятилетний цикл. Внутри равных частот — порядок
   * каталога: он и есть приоритет важности.
   */
  const orderedPool = [...pool].sort((left, right) => {
    const byPinned = (PINNED_CADENCE[left.task] ? 0 : 1) - (PINNED_CADENCE[right.task] ? 0 : 1);

    if (byPinned !== 0) return byPinned;

    const byPreferred =
      CADENCE_PREFERRED_MONTHS[left.cadence] - CADENCE_PREFERRED_MONTHS[right.cadence];

    if (Math.abs(byPreferred) > 1e-9) return byPreferred;

    return (catalogOrder.get(left.task) ?? 0) - (catalogOrder.get(right.task) ?? 0);
  });

  // ── Фаза A: недельные дела по дням уборки ────────────────────────────────
  const monthlyQueue: CatalogTask[] = [];

  for (const task of orderedPool) {
    const weeklySlot = slotLadder(task).find((slot) => slot.frequency === 'weekly');

    if (weeklySlot && placeWeekly(task, weeklySlot)) continue;

    monthlyQueue.push(task);
  }

  // ── Фаза B: редкие дела по числам месяца ─────────────────────────────────
  const capacity = capacityByMonthDay();
  const scale = scaleOverride ?? rareScaleFor(capacity, monthlyQueue);

  for (const task of monthlyQueue) {
    /**
     * Каждое редкое дело ищет **самый частый** цикл, в который помещается.
     *
     * Раньше на весь месячный поток считался один «масштаб редкости» (`scale`), и
     * когда недельная фаза занимала дни, этот масштаб уезжал в квартал — то есть
     * **все** редкие дела становились квартальными. Замер на живом профиле: 155
     * задач в наборе, из них 120 квартальных, и за месяц человек видел 13 разных
     * дел — «всё повторяется, задач мало».
     *
     * Теперь наоборот: очередь идёт по важности (каталог и пины), и каждое дело
     * берёт ближайшую ступень лестницы, где есть место. Важное остаётся месячным,
     * растягивается только то, чему действительно не хватило бюджета, — и ровно
     * настолько, насколько не хватило.
     */
    const ladder = slotLadder(task).filter((slot) => slot.frequency === 'monthly');
    let placed = false;

    for (const slot of ladder) {
      if (placeMonthly(task, slot, capacity)) {
        placed = true;
        break;
      }
    }

    if (!placed) dropped.push(task);
  }

  /**
   * Во сколько раз циклы в среднем длиннее каталожных.
   *
   * Считается по минутам: дело на пять лет весит столько же, сколько недельное,
   * поэтому невзвешенный «средний интервал» показывал бы ерунду. Число попадает в
   * примечания набора и в отчёт проверки.
   */
  const catalogByTitle = new Map(pool.map((task) => [task.task, task]));
  let preferredCost = 0;
  let placedCost = 0;

  for (const task of tasks) {
    const catalogTask = catalogByTitle.get(task.title);

    if (!catalogTask) continue;

    const cadence = PINNED_CADENCE[catalogTask.task] ?? catalogTask.cadence;
    const preferred = cadence === 'daily' ? 1 / 365 : CADENCE_PREFERRED_MONTHS[cadence];
    // Интервал в задаче — дни, поэтому для сравнения с каталожной частотой он
    // приводится к месяцам: у недельного дела через недели, у месячного через 30.
    // Без перевода «раз в полгода» весило бы как 180 месяцев, и `cycleScale`
    // показывал бы 30 вместо реальных 1.1.
    const placed =
      task.frequency === 'weekly'
        ? task.intervalCount / 7 / WEEKS_PER_MONTH
        : task.intervalCount / 30;

    preferredCost += catalogTask.minutes * preferred;
    placedCost += catalogTask.minutes * placed;
  }

  const cycleScale = preferredCost > 0 ? Math.max(1, placedCost / preferredCost) : 1;

  return { tasks, slots, dropped, cadenceCounts, monthSpent, cycleScale, scale, weeklyCap };
};




/**
 * Описание расписания «Мои задачи» при создании.
 *
 * Одно и то же в двух местах: маршрут анкеты (syncDefaultTasks в
 * routes/homeProfile.ts) и перенос задач из «Плана по дому»
 * (services/mergePlanIntoTasks.ts).
 */
export const myTasksScheduleDescription = (set: DefaultTaskSet): string =>
  `Постоянные дела по настройкам дома: ${set.summary.totalTasks} задач, до ${set.summary.maxDailyMinutes} минут в день`;

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
  const budget = dayBudget(answers);

  const notes: string[] = [];
  const context: BuildContext = {
    answers,
    catalogOrder,
    pool,
    budget,
    today,
  };

  /**
   * Перебор потолков недельных дел: от свободного к строгому.
   *
   * Бюджет дня делят недельные дела и редкие. Если недельным отдать день целиком,
   * редким не останется ничего, и каталог уедет в потери; если держать недельные
   * слишком коротко, они сами уедут на редкие циклы, а заказчик просил обратное.
   * Поэтому раскладка пробует несколько потолков и выбирает попытку, где все
   * выбранные дни заняты и потерь меньше всего. Первая же удачная попытка (от
   * самого свободного потолка) и есть ответ: она меньше всех растягивает циклы.
   *
   * Названные заказчиком дела (постельное, полы, зеркала) от потолка освобождены,
   * поэтому лестница потолков их не отменяет.
   */
  const capacityFloors = [0, 5, 10, 15, 20, 25];
  const caps = capacityFloors
    .map((floor) => budget - floor)
    .filter((cap, index, all) => cap >= 0 && all.indexOf(cap) === index);

  const isComplete = (attempt: BuildAttempt): boolean =>
    attempt.slots.every((slot) => !slot.selected || slot.tasks.length > 0);

  let best = attemptBuild(context, caps[0]);
  let bestDrops = best.dropped.length;
  let bestComplete = isComplete(best);

  for (const cap of caps.slice(1)) {
    if (bestDrops === 0 && bestComplete) break;

    let attempt = attemptBuild(context, cap);

    // Если общий шаг не спас дела, пробуем следующую, более редкую ступень: это
    // последняя попытка уложить каталог, прежде чем признать потери.
    if (attempt.dropped.length > 0) {
      const next = MONTHLY_RUNGS.find((months) => months > attempt.scale + 1e-9);

      if (next !== undefined) {
        const stricter = attemptBuild(context, cap, next);

        if (stricter.dropped.length < attempt.dropped.length) attempt = stricter;
      }
    }

    const complete = isComplete(attempt);
    const drops = attempt.dropped.length;
    const better =
      (complete && !bestComplete) || (complete === bestComplete && drops < bestDrops);

    if (!better) continue;

    best = attempt;
    bestDrops = drops;
    bestComplete = complete;
  }

  const { tasks, slots, dropped, cadenceCounts, monthSpent, cycleScale, scale, weeklyCap } = best;

  /**
   * Сколько дел недельной шкалы уехало на более редкие ступени.
   *
   * Это главный видимый компромисс бюджета: человек с ответом «минимум, 2 дня»
   * физически не может делать всё каждую неделю, и генератор честно удлиняет
   * циклы вместо того, чтобы выбрасывать дела. Число попадает в примечания,
   * чтобы отчёт не выглядел лучше, чем он есть.
   */
  const demotedWeekly = pool.filter(
    (task) =>
      WEEKLY_CADENCES.includes(PINNED_CADENCE[task.task] ?? task.cadence) &&
      tasks.some(
        (placed) => placed.title === task.task && !WEEKLY_CADENCES.includes(placed.cadence)
      )
  ).length;

  // ── Итоги ─────────────────────────────────────────────────────────────────
  const weeklyTasks = tasks.filter((task) => task.frequency === 'weekly');
  const weeklyMinutes = weeklyTasks.reduce((sum, task) => sum + task.minutes, 0);
  const monthlyTasks = tasks.filter((task) => task.frequency === 'monthly');
  const monthlyMinutes = monthlyTasks.reduce((sum, task) => sum + task.minutes, 0);
  const maxDailyMinutes = slots.reduce((max, slot) => Math.max(max, slot.minutes), 0);

  const days: DefaultTaskDay[] = slots.map((slot) => ({
    dayOfWeek: slot.dayOfWeek,
    label: slot.label,
    selected: slot.selected,
    // Дни берутся из тех же слотов, по которым шла раскладка: так сводка и
    // раскладка не могут разойтись.
    tasks: tasks.filter((task) => task.dayOfWeek === slot.dayOfWeek),
    minutes: slot.minutes,
  }));

  notes.push(
    `Каталог: подходит ${pool.length} дел, в наборе ${tasks.length}${dropped.length > 0 ? `, не поместилось ${dropped.length}` : ', потерянных нет'}`
  );

  if (cycleScale > 1) {
    notes.push(
      `Циклы растянуты в ${cycleScale.toFixed(2)} раза: при бюджете ${budget} мин в день частоты каталога целиком не помещаются`
    );
  }

  if (weeklyCap < budget) {
    notes.push(
      `Недельным делам оставлено ${weeklyCap} из ${budget} мин дня: остальное отдано редким делам числа, иначе они не помещаются вовсе`
    );
  }

  if (demotedWeekly > 0) {
    notes.push(
      `Удлинён цикл у ${demotedWeekly} дел недельной шкалы: в выбранные дни помещается ${weeklyMinutes} мин недельных дел при бюджете ${budget} мин в день`
    );
  }

  if (dropped.length > 0) {
    notes.push(
      `Не поместились даже в самый редкий цикл (${MAX_CYCLE_MONTHS} мес): ${dropped
        .map((task) => task.task)
        .join(', ')}`
    );
  }

  notes.push(
    `Недельные дела разложены по дням уборки, редкие — по числам месяца; худший день ${maxDailyMinutes} мин при бюджете ${budget}, занято в месяце ${monthSpent.toFixed(0)} мин`
  );

  return {
    scheduleTitle: DEFAULT_TASKS_SCHEDULE_TITLE,
    tasks,
    summary: {
      totalTasks: tasks.length,
      totalMinutes: tasks.reduce((sum, task) => sum + task.minutes, 0),
      // Ежедневных дел в каталоге нет: бытовая рутина (посуда, стол, кровать)
      // убрана как «то, что человек делает и без плана».
      dailyTasks: 0,
      dailyMinutes: 0,
      rotatedTasks: 0,
      rotatedMinutes: 0,
      weeklyTasks: weeklyTasks.length,
      weeklyMinutes,
      monthlyTasks: monthlyTasks.length,
      monthlyMinutes,
      droppedTasks: dropped.length,
      droppedTitles: dropped.map((task) => task.task),
      candidateTasks: pool.length,
      includedTasks: tasks.length,
      maxDailyMinutes,
      dailyLimit: budget,
      rooms: [...new Set(tasks.map((task) => task.room))],
      tags: [...new Set(tasks.flatMap((task) => task.tags))],
      cadences: cadenceCounts,
      cycleScale,
      days,
      notes,
    },
  };
};

export const defaultTaskCandidateCount = (input: PartialHomeAnswers): number => {
  const answers = withDefaultAnswers(input);
  const declared = activeHomeTags(answers);

  return getTaskCatalog().filter((task) => isRelevant(task, answers, declared)).length;
};
