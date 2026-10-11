/**
 * Живая проверка каталога задач, постоянного набора «Мои задачи» и недельного
 * плана «План по дому».
 *
 * Запускается вручную (`npx tsx scripts/check-default-tasks.ts`), не требует
 * базы и API: оба генератора — чистые модули, поэтому все инварианты
 * проверяются прямо на наборах ответов анкеты.
 *
 * Главный инвариант — дневной бюджет. Он один на **оба** генератора
 * (services/dailyBudget.ts): сколько минут сгенерированных задач попадает на
 * конкретный день, столько и считается. Поэтому здесь проверяется сумма
 * «ежедневный минимум + недельные + месячные и редкие дела» по каждому дню
 * недели и по каждому числу месяца сразу для «Моих задач» и «Плана по дому».
 * Свои задачи пользователя в бюджет не входят по определению — генераторы про
 * них ничего не знают.
 *
 * Тот же скрипт запускается шагом CI (.github/workflows/ci.yml) после тестов,
 * чтобы инвариант проверялся на каждый пуш, а не только вручную.
 */
import {
  MAX_CATALOG_TASK_MINUTES,
  TASK_CADENCE_LABELS,
  getTaskCatalog,
  taskCatalogAverageMinutes,
  taskCatalogSize,
  taskCountByCadence,
  taskCountByLevel,
  validateTaskCatalog,
  type TaskCadence,
  type TaskTag,
} from '../services/taskCatalog';
import {
  buildDefaultTasks,
  defaultTaskCandidateCount,
  MAX_DAILY_MINUTES,
  type DefaultTaskSet,
} from '../services/defaultTasks';
import { DAY_BUDGET_MINUTES, dayBudget, occupiedMinutesByWeekday } from '../services/dailyBudget';
import {
  activeHomeTags,
  buildHomePlan,
  HOME_PLAN_SOURCE,
  withDefaultAnswers,
  type HomeAnswers,
  type PartialHomeAnswers,
} from '../services/homePlan';

const problems: string[] = [];

const check = (condition: boolean, message: string) => {
  if (!condition) problems.push(message);
};

const CONTEXT_TAGS: TaskTag[] = ['pets', 'balcony', 'yard', 'garage', 'kids', 'office'];

/** Классы месяцев (0-11), в которые задача со своим интервалом попадает. */
const monthClassesOf = (task: { dueDate: string | null; intervalCount: number }): number[] => {
  const interval = Math.max(1, task.intervalCount);
  const now = new Date();
  const anchor = task.dueDate ? new Date(`${task.dueDate}T00:00:00Z`) : now;
  const monthsApart =
    anchor.getUTCFullYear() * 12 +
    anchor.getUTCMonth() -
    (now.getUTCFullYear() * 12 + now.getUTCMonth());
  const offset = ((monthsApart % interval) + interval) % interval;
  const classes: number[] = [];

  for (let month = 0; month < 12; month += 1) {
    if ((((month - offset) % interval) + interval) % interval === 0) classes.push(month);
  }

  return classes;
};

/**
 * Худшая нагрузка каждого числа месяца от заданной группы редких задач.
 *
 * Редкие дела разведены по «классам месяцев»: задача с интервалом N и опорой в
 * месяце offset занимает только сравнимые с ним месяцы. Поэтому складывать все
 * редкие дела одного числа нельзя — берём худший для этого числа класс месяцев,
 * иначе проверка ругалась бы на задачи, которые вместе никогда не встречаются.
 */
const worstRareByDate = (
  tasks: ReadonlyArray<{ frequency: string; dayOfMonth: number | null; dueDate: string | null; intervalCount: number; minutes: number }>
): Map<number, number> => {
  const rareByClass = new Map<number, Map<number, number>>();

  for (const task of tasks) {
    if (task.frequency !== 'monthly' || task.dayOfMonth === null) continue;

    for (const month of monthClassesOf(task)) {
      const byDate = rareByClass.get(month) ?? new Map<number, number>();

      byDate.set(task.dayOfMonth, (byDate.get(task.dayOfMonth) ?? 0) + task.minutes);
      rareByClass.set(month, byDate);
    }
  }

  const worst = new Map<number, number>();

  for (const byDate of rareByClass.values()) {
    for (const [day, minutes] of byDate) {
      worst.set(day, Math.max(worst.get(day) ?? 0, minutes));
    }
  }

  return worst;
};

/**
 * Проверяет один набор ответов и печатает его сводку.
 */
const verifySet = (label: string, input: PartialHomeAnswers) => {
  const answers = withDefaultAnswers(input);
  const declared = new Set(activeHomeTags(answers));
  const set: DefaultTaskSet = buildDefaultTasks(input);

  const titles = set.tasks.map((task) => task.title);
  const minutes = set.tasks.map((task) => task.minutes);
  const average = minutes.reduce((sum, value) => sum + value, 0) / (minutes.length || 1);

  // 1. Контекст: нет ответа — нет ни одной задачи с этим тегом.
  for (const task of set.tasks) {
    for (const tag of CONTEXT_TAGS) {
      if (task.tags.includes(tag) && !declared.has(tag)) {
        problems.push(`${label}: задача «${task.title}» с тегом ${tag}, которого нет в анкете`);
      }
    }
  }

  // 2. Заявленная тема должна быть представлена хотя бы одной задачей.
  for (const tag of declared) {
    check(
      set.tasks.some((task) => task.tags.includes(tag)),
      `${label}: в наборе нет ни одной задачи с тегом ${tag}`
    );
  }

  // 3. Дублей названий в одном наборе быть не должно.
  check(new Set(titles).size === titles.length, `${label}: в наборе есть дубли названий`);

  // 4. Дневной бюджет по ответу анкеты: ежедневный минимум и любой день недели
  //    укладываются в него. Это бюджет **всех** сгенерированных дел дня, поэтому
  //    он же применяется к недельному плану (см. проверку инварианта ниже).
  const budget = dayBudget(answers);

  check(
    budget <= MAX_DAILY_MINUTES,
    `${label}: бюджет ${budget} мин выше абсолютного потолка ${MAX_DAILY_MINUTES}`
  );
  check(
    set.summary.dailyLimit === budget,
    `${label}: набор считает лимит дня ${set.summary.dailyLimit}, а бюджет по ответу — ${budget}`
  );
  check(
    set.summary.dailyMinutes <= budget,
    `${label}: ежедневный минимум ${set.summary.dailyMinutes} мин при бюджете ${budget}`
  );
  check(
    set.summary.maxDailyMinutes <= budget,
    `${label}: худший день ${set.summary.maxDailyMinutes} мин при бюджете ${budget}`
  );

  for (const day of set.summary.days) {
    check(
      day.minutes <= budget,
      `${label}: день ${day.label} — ${day.minutes} мин при бюджете ${budget}`
    );
  }

  // 5. В каждом выбранном дне должно быть чем заняться.
  for (const day of set.summary.days.filter((item) => item.selected)) {
    check(day.tasks.length > 0, `${label}: выбранный день ${day.label} остался без задач`);
  }

  // 6. Периодичность: у каждой задачи есть корректная пара frequency + интервал.
  for (const task of set.tasks) {
    check(
      task.minutes <= MAX_CATALOG_TASK_MINUTES,
      `${label}: «${task.title}» длиннее ${MAX_CATALOG_TASK_MINUTES} минут`
    );
    check(task.intervalCount >= 1, `${label}: «${task.title}» с интервалом ${task.intervalCount}`);

    if (task.frequency === 'daily') {
      check(
        task.dayOfWeek === null && task.dayOfMonth === null,
        `${label}: ежедневная «${task.title}» привязана к дню`
      );
    }

    if (task.frequency === 'weekly') {
      check(task.dayOfWeek !== null, `${label}: недельная «${task.title}» без дня недели`);
    }

    if (task.frequency === 'monthly') {
      check(
        task.dayOfMonth !== null && task.dayOfMonth >= 1 && task.dayOfMonth <= 28,
        `${label}: месячная «${task.title}» без числа месяца`
      );
    }

    if (task.intervalCount > 1) {
      check(
        task.dueDate !== null,
        `${label}: «${task.title}» с интервалом ${task.intervalCount} без опорной даты`
      );
    }
  }

  // 7. Нагрузка любого календарного дня: ежедневный минимум плюс недельные дела
  //    этого дня недели плюс редкие (месячные и реже), попадающие на это число
  //    в своём месяце цикла. Это проверка дневного бюджета «на земле» для «Моих
  //    задач»; вклад недельного плана в тот же день проверяется ниже.
  //
  //    Редкие дела разведены по «классам месяцев»: задача с интервалом N и
  //    опорой в месяце offset занимает только сравнимые с ним месяцы. Поэтому
  //    складывать все редкие дела одного числа нельзя — надо взять худший для
  //    этого числа класс месяцев, иначе проверка ругается на задачи, которые
  //    вместе никогда не встречаются.
  const weeklyByWeekday = new Map<number, number>();

  for (const task of set.tasks) {
    if (task.frequency === 'weekly' && task.dayOfWeek !== null) {
      weeklyByWeekday.set(task.dayOfWeek, (weeklyByWeekday.get(task.dayOfWeek) ?? 0) + task.minutes);
    }
  }

  const perDate = new Map<number, number>();

  for (let day = 1; day <= 28; day += 1) {
    const weekday = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), day)
    ).getUTCDay();

    perDate.set(day, set.summary.dailyMinutes + (weeklyByWeekday.get(weekday) ?? 0));
  }

  for (const [day, minutes] of worstRareByDate(set.tasks)) {
    const total = (perDate.get(day) ?? 0) + minutes;

    check(
      total <= budget,
      `${label}: ${day}-е число месяца — ${total} мин при бюджете ${budget}`
    );
  }

  const byFrequency = set.tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.frequency] = (acc[task.frequency] ?? 0) + 1;

    return acc;
  }, {});

  console.log(`\n=== ${label} ===`);
  console.log(
    `задач ${set.summary.totalTasks} (daily ${byFrequency.daily ?? 0}, weekly ${byFrequency.weekly ?? 0}, monthly ${byFrequency.monthly ?? 0}), минут всего ${set.summary.totalMinutes}`
  );
  console.log(
    `средняя задача ${average.toFixed(1)} мин, ежедневно ${set.summary.dailyMinutes} мин, худший день ${set.summary.maxDailyMinutes} мин`
  );
  console.log(
    `не поместилось в лимит: ${set.summary.droppedTasks} дел каталога, масштабировано по комнатам — ${set.summary.notes.length > 0 ? 'см. примечания' : 'нет'}`
  );
  console.log(
    `дни: ${set.summary.days
      .map((day) => `${day.label.slice(0, 2)} ${day.minutes}м/${day.tasks.length}з${day.selected ? '*' : ''}`)
      .join(', ')}`
  );
  console.log(`зоны: ${set.summary.rooms.join(', ')}`);
  console.log(`теги: ${set.summary.tags.join(', ') || '—'}`);
  console.log(`подходит задач каталога: ${defaultTaskCandidateCount(input)}`);

  if (set.summary.notes.length > 0) {
    console.log(`примечания: ${set.summary.notes.join(' | ')}`);
  }

  const byCadence = set.tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.cadence] = (acc[task.cadence] ?? 0) + 1;

    return acc;
  }, {});

  console.log(
    `периодичность: ${Object.entries(byCadence)
      .map(([cadence, count]) => `${TASK_CADENCE_LABELS[cadence as TaskCadence] ?? cadence} — ${count}`)
      .join(', ')}`
  );

  return set;
};

// ── 1. Каталог ─────────────────────────────────────────────────────────────
const catalogProblems = validateTaskCatalog();

check(catalogProblems.length === 0, `каталог: ${catalogProblems.join('; ')}`);

const byLevel = taskCountByLevel();
const byCadence = taskCountByCadence();
const catalog = getTaskCatalog();
const longest = catalog.reduce((max, task) => Math.max(max, task.minutes), 0);

console.log('=== Каталог ===');
console.log(
  `задач ${taskCatalogSize()} (лёгких ${byLevel.light}, обычных ${byLevel.normal}, глубоких ${byLevel.deep})`
);
console.log(`средняя ${taskCatalogAverageMinutes()} мин, самая длинная ${longest} мин`);
console.log(
  `периодичность: ${Object.entries(byCadence)
    .map(([cadence, count]) => `${TASK_CADENCE_LABELS[cadence as TaskCadence]} — ${count}`)
    .join(', ')}`
);

const histogram = new Map<number, number>();

for (const task of catalog) {
  histogram.set(task.minutes, (histogram.get(task.minutes) ?? 0) + 1);
}

console.log(
  `минуты: ${[...histogram.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([minutes, count]) => `${minutes}м — ${count}`)
    .join(', ')}`
);

check(taskCatalogSize() > 186, `каталог не вырос: ${taskCatalogSize()} задач`);
check(
  taskCatalogAverageMinutes() >= 12 && taskCatalogAverageMinutes() <= 17,
  `средняя длительность задачи ${taskCatalogAverageMinutes()} мин — вне коридора 12-17`
);

// ── 2. Наборы по ответам ───────────────────────────────────────────────────
const a = verifySet('A: студия 1-2, один, без питомцев, лёгкая, <30 мин, 3 дня', {
  housingType: 'studio',
  rooms: '1-2',
  composition: 'alone',
  pets: ['none'],
  outdoor: 'none',
  hasKidsRoom: false,
  hasGarage: false,
  worksFromHome: false,
  drying: 'air',
  cleaningLevel: 'light',
  dailyMinutes: 'under30',
  cleaningStyle: 'often_small',
  cleaningDays: [1, 3, 6],
  hardestZone: 'kitchen',
});

const b = verifySet('B: дом 8+, семья с детьми, собака и рыбки, двор, гараж, детская, офис, сушильная машина, глубокая, 1-2 ч, 5 дней', {
  housingType: 'house',
  rooms: '8+',
  composition: 'family_kids',
  pets: ['dogs', 'fish'],
  outdoor: 'yard',
  hasKidsRoom: true,
  hasGarage: true,
  worksFromHome: true,
  drying: 'dryer',
  cleaningLevel: 'deep',
  dailyMinutes: '1to2h',
  cleaningStyle: 'all_at_once',
  cleaningDays: [1, 3, 5, 6, 0],
  hardestZone: 'bathroom',
});

const c = verifySet('C: квартира 3-4, пара, без питомцев, балкон, офис, сушка на воздухе, обычная, 30-60 мин, 2 дня', {
  housingType: 'apartment',
  rooms: '3-4',
  composition: 'partner',
  pets: ['none'],
  outdoor: 'balcony',
  hasKidsRoom: false,
  hasGarage: false,
  worksFromHome: true,
  drying: 'air',
  cleaningLevel: 'normal',
  dailyMinutes: '30to60',
  cleaningStyle: 'varies',
  cleaningDays: [2, 4],
  hardestZone: 'tidiness',
});

const d = verifySet('D: квартира 5-7, соседи, кошки, без балкона, стирально-сушильная машина, обычная, зависит, 5 дней', {
  housingType: 'apartment',
  rooms: '5-7',
  composition: 'roommates',
  pets: ['cats'],
  outdoor: 'none',
  hasKidsRoom: false,
  hasGarage: false,
  worksFromHome: false,
  drying: 'washer_dryer',
  cleaningLevel: 'normal',
  dailyMinutes: 'depends',
  cleaningStyle: 'when_energy',
  cleaningDays: [1, 2, 3, 4, 5],
  hardestZone: 'floors',
});

const minimal = verifySet('E: пустые ответы (значения по умолчанию)', {});

// Дни по умолчанию (1, 3, 6) — если ответа про дни нет, набор всё равно собран
check(
  minimal.summary.days.filter((day) => day.selected).length === 3,
  'E: не совпало число дней по умолчанию'
);

const week = verifySet('F: 7 дней в неделю, 3-4 комнаты, офис, питомцы', {
  housingType: 'apartment',
  rooms: '3-4',
  composition: 'partner',
  pets: ['cats', 'dogs'],
  outdoor: 'balcony',
  hasKidsRoom: true,
  hasGarage: false,
  worksFromHome: true,
  drying: 'washer_dryer',
  cleaningLevel: 'deep',
  dailyMinutes: '1to2h',
  cleaningStyle: 'often_small',
  cleaningDays: [0, 1, 2, 3, 4, 5, 6],
  hardestZone: 'nothing',
});

// «Нет питомцев — ни одной задачи с тегом pets» проверяем и на большом доме
const noPets = buildDefaultTasks({
  housingType: 'house',
  rooms: '8+',
  composition: 'family_kids',
  pets: ['none'],
  outdoor: 'yard',
  hasKidsRoom: true,
  hasGarage: true,
  worksFromHome: true,
  drying: 'air',
  cleaningLevel: 'deep',
  dailyMinutes: '1to2h',
  cleaningStyle: 'often_small',
  cleaningDays: [1, 2, 3, 4, 5, 6, 0],
  hardestZone: 'nothing',
});

check(
  noPets.tasks.every((task) => !task.tags.includes('pets')),
  'G: «нет питомцев», но в наборе есть задачи про питомцев'
);
check(
  week.tasks.some((task) => task.tags.includes('pets')),
  'F: питомцы заявлены, но задач про питомцев нет'
);

const sizes = [a, b, c, d, minimal, week].map((set) => set.summary.totalTasks);

console.log(
  `\nВсего наборов проверено: 7, размеры: ${sizes.join(', ')}, максимум ${Math.max(...sizes)} задач`
);

// ── 3. Инвариант дневного бюджета для обоих генераторов ────────────────────
//
// Самая важная проверка: недельный план «План по дому» собирается с оглядкой на
// «Мои задачи» (карта занятости дня), и сумма сгенерированных дел любого дня не
// должна выходить за бюджет по ответу. Раньше два генератора не знали друг о
// друге: у человека с ответом «минимум, до 30 минут в день» выходило 53 минуты в
// понедельник (12 «Мои задачи» + 22 + 19 «План по дому»).

/** Базовый профиль: от него меняется ровно одна ось, остальное зафиксировано. */
const BASELINE: HomeAnswers = {
  housingType: 'apartment',
  rooms: '3-4',
  composition: 'partner',
  pets: ['none'],
  outdoor: 'none',
  hasKidsRoom: false,
  hasGarage: false,
  worksFromHome: false,
  drying: 'air',
  cleaningLevel: 'normal',
  dailyMinutes: '30to60',
  cleaningStyle: 'varies',
  cleaningDays: [1, 3, 5],
  hardestZone: 'nothing',
};

interface Axis {
  name: string;
  values: Array<Partial<HomeAnswers>>;
}

/**
 * Оси, по которым меняется базовый профиль.
 *
 * Оси устроены так, что каждая трогает свой участок правил (дни, комнаты,
 * контекст, стиль недели, глубина уборки), а сама таблица бюджетов проверяется
 * отдельным перебором по четырём ответам `dailyMinutes` ниже. Стиль
 * «all_at_once» намеренно оставлен только на двух днях, как в наборе B: там
 * «блок» забирает больше бюджета, чем остальные дни, и это самое узкое место.
 */
const AXES: Axis[] = [
  {
    name: 'дни уборки',
    values: [
      { cleaningDays: [1] },
      { cleaningDays: [1, 3, 5] },
      { cleaningDays: [0, 2, 4, 6] },
      { cleaningDays: [1, 2, 3, 4, 5, 6, 0] },
    ],
  },
  {
    name: 'комнаты, состав, контекст',
    values: [
      { rooms: '1-2', composition: 'alone' },
      { rooms: '3-4', composition: 'partner' },
      { rooms: '5-7', composition: 'roommates' },
      { rooms: '8+', composition: 'family_kids' },
      {
        pets: ['cats', 'dogs'],
        outdoor: 'yard',
        hasKidsRoom: true,
        hasGarage: true,
        worksFromHome: true,
      },
    ],
  },
  {
    name: 'уровень уборки',
    values: [{ cleaningLevel: 'light' }, { cleaningLevel: 'normal' }, { cleaningLevel: 'deep' }],
  },
  {
    name: 'стиль недели',
    values: [
      { cleaningStyle: 'often_small' },
      { cleaningStyle: 'all_at_once', cleaningDays: [1, 2] },
      { cleaningStyle: 'all_at_once', cleaningDays: [1, 2, 3, 4] },
      { cleaningStyle: 'when_energy' },
      { cleaningStyle: 'varies' },
    ],
  },
  {
    name: 'трудная зона',
    values: [
      { hardestZone: 'kitchen' },
      { hardestZone: 'bathroom' },
      { hardestZone: 'floors' },
      { hardestZone: 'tidiness' },
      { hardestZone: 'nothing' },
    ],
  },
];

const DAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

interface CombinedLoad {
  /** Суммарные сгенерированные минуты по дням недели (0-6). */
  byWeekday: number[];
  /** Суммарные сгенерированные минуты по числам месяца вне недельного цикла. */
  byMonthDay: Map<number, number>;
  /** Худший день по минутам. */
  worst: number;
  /** Дни, в которых нет ни одной сгенерированной задачи. */
  emptyDays: string[];
}

/**
 * Складывает нагрузку обоих генераторов «на земле».
 *
 * - «Мои задачи»: ежедневный минимум лежит в каждом дне недели, недельные дела —
 *   в своём дне, месячные и редкие — в конкретном числе месяца.
 * - «План по дому»: получает остаток бюджета дня уже за вычетом занятости
 *   набора (occupiedMinutesByWeekday), поэтому складывается с картой занятости.
 */
const combinedLoad = (input: PartialHomeAnswers): CombinedLoad => {
  const answers = withDefaultAnswers(input);
  const defaultSet = buildDefaultTasks(answers);
  const occupied = occupiedMinutesByWeekday(defaultSet);
  const plan = buildHomePlan(answers, occupied);

  const byWeekday: number[] = Array.from(
    { length: 7 },
    (_, weekday) => occupied.get(weekday) ?? 0
  );

  // Редкие дела набора раскладываются по числам месяца: нагрузка числа — это
  // нагрузка его дня недели (ежедневный минимум, недельные дела, план) плюс
  // худший класс месяцев по редким делам.
  const byMonthDay = new Map<number, number>();

  for (const [day, minutes] of worstRareByDate(defaultSet.tasks)) {
    const weekday = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), day)
    ).getUTCDay();

    byMonthDay.set(day, (byWeekday[weekday] ?? 0) + minutes);
  }

  for (const day of plan.days) {
    if (!day.selected) continue;

    byWeekday[day.dayOfWeek] += day.totalMinutes;
  }

  const emptyDays: string[] = [];

  for (let weekday = 0; weekday < 7; weekday += 1) {
    if ((byWeekday[weekday] ?? 0) <= 0) emptyDays.push(DAY_LABELS[weekday]);
  }

  return {
    byWeekday,
    byMonthDay,
    worst: Math.max(0, ...byWeekday, ...byMonthDay.values()),
    emptyDays,
  };
};

/** Один набор ответов: бюджет, нагрузка по дням и нарушения инварианта. */
const verifyCombined = (label: string, input: PartialHomeAnswers): CombinedLoad => {
  const answers = withDefaultAnswers(input);
  const budget = dayBudget(answers);
  const load = combinedLoad(input);

  check(
    budget === Math.min(DAY_BUDGET_MINUTES[answers.dailyMinutes], MAX_DAILY_MINUTES),
    `${label}: бюджет ${budget} не совпал с таблицей ${DAY_BUDGET_MINUTES[answers.dailyMinutes]}`
  );

  for (let weekday = 0; weekday < 7; weekday += 1) {
    check(
      (load.byWeekday[weekday] ?? 0) <= budget,
      `${label}: ${DAY_LABELS[weekday]} — ${load.byWeekday[weekday]} мин при бюджете ${budget}`
    );
  }

  for (const [day, minutes] of load.byMonthDay) {
    check(
      minutes <= budget,
      `${label}: ${day}-е число — ${minutes} мин при бюджете ${budget}`
    );

    // «Раз в месяц» и реже разложены по числам месяца: у каждого занятого числа
    // должно быть хотя бы одно дело, иначе раскладка оставила пустую дату.
    check(
      minutes > 0,
      `${label}: ${day}-е число попало в раскладку без единой задачи`
    );
  }

  // Пустых дней быть не должно: и у набора, и у плана в каждом дне недели есть
  // хотя бы одно сгенерированное дело (иначе «план на день» — это дырка).
  check(
    load.emptyDays.length === 0,
    `${label}: дни без сгенерированных задач — ${load.emptyDays.join(', ')}`
  );

  // Ни один день не «занят» целиком настолько, чтобы в нём не было дел вовсе.
  check(load.worst > 0, `${label}: ни в один день нет сгенерированных задач`);

  return load;
};

console.log('\n=== Инвариант дневного бюджета (оба генератора) ===');
console.log('бюджет по ответу: ' + JSON.stringify(DAY_BUDGET_MINUTES) + `, потолок ${MAX_DAILY_MINUTES}`);

// Пометка источника: по ней задача плана отличима от созданной руками. Маршрут
// ставит её при вставке (routes/homeProfile.ts), а значение обязано совпадать с
// тем, что ждёт миграция-бэкфилл 0016_home_plan_task_source.sql.
check(
  HOME_PLAN_SOURCE === 'home_plan',
  `источник задач плана «${HOME_PLAN_SOURCE}» не совпал с ожидаемым home_plan`
);

let combos = 0;
let worstCombo = '';
let worstMinutes = 0;
let worstBudget = 0;

/** Перебирает четыре варианта ответа «сколько времени в день» и все оси. */
for (const dailyMinutes of ['under30', '30to60', '1to2h', 'depends'] as const) {
  const budget = dayBudget({ dailyMinutes });

  console.log(`\n— ответ «${dailyMinutes}» → бюджет ${budget} мин в день —`);

  for (let axisIndex = 0; axisIndex < AXES.length; axisIndex += 1) {
    const axis = AXES[axisIndex];

    for (const value of axis.values) {
      const answers: HomeAnswers = { ...BASELINE, dailyMinutes, ...value };
      const label = `${dailyMinutes}/${axis.name}/${JSON.stringify(value)}`;
      const load = verifyCombined(label, answers);

      combos += 1;

      if (load.worst > worstMinutes) {
        worstMinutes = load.worst;
        worstCombo = label;
        worstBudget = budget;
      }

      console.log(
        `   ${axis.name.padEnd(24)} ${JSON.stringify(value).slice(0, 46).padEnd(46)} ` +
          `дни: ${load.byWeekday.map((minutes) => String(minutes).padStart(2)).join(' ')} | худший ${load.worst}/${budget}`
      );
    }
  }
}

console.log(
  `\nКомбинаций проверено: ${combos}. Самая нагруженная: ${worstCombo} — ${worstMinutes} мин при бюджете ${worstBudget}`
);

if (problems.length > 0) {
  console.log(`\nПРОБЛЕМЫ (${problems.length}):`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('\nВсе проверки пройдены');
}
