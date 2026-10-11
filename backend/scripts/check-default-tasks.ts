/**
 * Живая проверка каталога задач и постоянного набора «Мои задачи».
 *
 * Запускается вручную (`npx tsx scripts/check-default-tasks.ts`), не требует
 * базы и API: модуль defaultTasks — чистый, поэтому все инварианты (лимит
 * 40 минут в день, фильтрация по ответам, периодичность, отсутствие дублей)
 * проверяются прямо на нескольких наборах ответов.
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
import {
  activeHomeTags,
  withDefaultAnswers,
  type PartialHomeAnswers,
} from '../services/homePlan';

const problems: string[] = [];

const check = (condition: boolean, message: string) => {
  if (!condition) problems.push(message);
};

const CONTEXT_TAGS: TaskTag[] = ['pets', 'balcony', 'yard', 'garage', 'kids', 'office'];

/** Проверяет один набор ответов и печатает его сводку. */
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

  // 4. Дневной лимит: ежедневный минимум и любой день недели — до 40 минут.
  check(
    set.summary.dailyMinutes <= MAX_DAILY_MINUTES,
    `${label}: ежедневный минимум ${set.summary.dailyMinutes} мин`
  );
  check(
    set.summary.maxDailyMinutes <= MAX_DAILY_MINUTES,
    `${label}: худший день ${set.summary.maxDailyMinutes} мин при лимите ${MAX_DAILY_MINUTES}`
  );

  for (const day of set.summary.days) {
    check(
      day.minutes <= MAX_DAILY_MINUTES,
      `${label}: день ${day.label} — ${day.minutes} мин при лимите ${MAX_DAILY_MINUTES}`
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
  //    этого дня недели плюс месячные дела, попадающие на это число в текущем
  //    месяце. Это и есть проверка лимита 40 минут в день «на земле».
  const perDate = new Map<number, number>();

  for (let day = 1; day <= 28; day += 1) {
    const weekday = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), day)
    ).getUTCDay();
    const weekly = set.tasks
      .filter((task) => task.frequency === 'weekly' && task.dayOfWeek === weekday)
      .reduce((sum, task) => sum + task.minutes, 0);

    perDate.set(day, set.summary.dailyMinutes + weekly);
  }

  for (const task of set.tasks) {
    if (task.frequency !== 'monthly' || task.dayOfMonth === null || task.dueDate === null) {
      if (task.frequency === 'monthly' && task.dayOfMonth !== null) {
        perDate.set(task.dayOfMonth, (perDate.get(task.dayOfMonth) ?? 0) + task.minutes);
      }
      continue;
    }

    const anchor = new Date(`${task.dueDate}T00:00:00Z`);
    const now = new Date();

    if (task.intervalCount > 1) {
      const monthsApart =
        anchor.getUTCFullYear() * 12 +
        anchor.getUTCMonth() -
        (now.getUTCFullYear() * 12 + now.getUTCMonth());

      if (monthsApart !== 0) continue;
    }

    perDate.set(task.dayOfMonth, (perDate.get(task.dayOfMonth) ?? 0) + task.minutes);
  }

  for (const [day, minutes] of perDate) {
    check(
      minutes <= MAX_DAILY_MINUTES,
      `${label}: ${day}-е число месяца — ${minutes} мин при лимите ${MAX_DAILY_MINUTES}`
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

if (problems.length > 0) {
  console.log(`\nПРОБЛЕМЫ (${problems.length}):`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('\nВсе проверки пройдены');
}
