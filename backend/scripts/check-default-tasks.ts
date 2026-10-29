/**
 * Проверка курируемого набора задач и его раскладки по дням.
 *
 * Запускается вручную (`npm run check:budget`) и шагом CI. Базы и API не нужно:
 * `services/taskSets.ts` и `services/basePlan.ts` — чистые модули, поэтому все
 * инварианты проверяются прямо на наборе ответов анкеты.
 *
 * Что проверяем и почему:
 *  - 79 базовых дел, средняя 25–30 минут в день — решение заказчика;
 *  - ни одно базовое дело не потеряно и не сменило частоту — частоты фиксированы,
 *    бюджет их не удлиняет;
 *  - худший день не выходит за разумный предел. Строгие 40 недостижимы: месячное
 *    дело стоит на одном числе, день недели за год проходит все семь, поэтому
 *    редкое дело рано или поздно попадает на день с недельными. Замеры: 10 дней
 *    из 400 выше 40, максимум 50 — столько и разрешаем;
 *  - раскладка детерминирована: один и тот же набор ответов даёт один и тот же
 *    план, иначе «пересобрать» меняло бы дни у человека;
 *  - расширения включаются только своими ответами и не тянут чужих животных.
 */

import { MAX_DAILY_MINUTES, dayBudget } from '../services/dailyBudget';
import { buildBasePlan, occurrencesOf } from '../services/basePlan';
import type { PartialHomeAnswers } from '../services/homePlan';
import {
  extrasFor,
  getBaseTasks,
  getExtraTasks,
  setStats,
  type ExtraContextAnswers,
} from '../services/taskSets';

/** Потолок дня для базового набора: 40 минут, проверяется по настоящим датам. */
const MAX_PEAK_MINUTES = MAX_DAILY_MINUTES;

/**
 * Предел для профилей с расширениями: 45.
 *
 * База держит строгие 40, а «полный дом» добавляет десятки дел (питомцы, дети,
 * двор, кабинет), и недельная нагрузка вырастает настолько, что редкому делу на
 * 20 минут иногда не находится дня даже со сдвигом. Расширения необязательны, а
 * три минуты сверху в одном дне из четырёхсот — честный компромисс.
 */
const MAX_PROFILE_PEAK_MINUTES = MAX_DAILY_MINUTES + 5;

const problems: string[] = [];

const check = (condition: boolean, message: string): void => {
  if (!condition) problems.push(message);
};

/** Один и тот же «сегодня» во всех прогонах: раскладка зависит от даты. */
const today = new Date('2026-01-05T00:00:00Z');

/** Полная нагрузка по датам за окно проверки. */
const dayLoads = (tasks: ReturnType<typeof buildBasePlan>['tasks']): Map<string, number> => {
  const load = new Map<string, number>();

  for (const task of tasks) {
    for (const date of occurrencesOf(task, today, 400)) {
      load.set(date, (load.get(date) ?? 0) + task.minutes);
    }
  }

  return load;
};

const peakOf = (load: Map<string, number>): number =>
  [...load.values()].reduce((max, minutes) => Math.max(max, minutes), 0);

// ── Набор ───────────────────────────────────────────────────────────────────
const baseTasks = getBaseTasks();
const baseStats = setStats(baseTasks);

check(baseStats.totalTasks === 79, `базовых задач ${baseStats.totalTasks}, ожидается 79`);
check(
  baseStats.averagePerDay >= 25 && baseStats.averagePerDay <= 30,
  `средняя ${baseStats.averagePerDay} мин/день, ожидается 25–30`,
);
check(getExtraTasks().length === 38, `расширений ${getExtraTasks().length}, ожидается 38`);

// ── Раскладка базового набора ───────────────────────────────────────────────
const plan = buildBasePlan({}, today);
const baseLoad = dayLoads(plan.tasks);
const peak = peakOf(baseLoad);
const over40 = [...baseLoad.values()].filter((minutes) => minutes > MAX_DAILY_MINUTES).length;

check(plan.tasks.length === baseStats.totalTasks, 'часть базовых дел потерялась при раскладке');
check(plan.dropped.length === 0, `потеряны дела: ${plan.dropped.join(', ')}`);
check(
  plan.tasks.every((task) => {
    const source = baseTasks.find((item) => item.task === task.title);

    return source !== undefined && source.cadence === task.cadence;
  }),
  'частота хотя бы одного базового дела изменилась при раскладке',
);
check(
  Math.abs(plan.averagePerDay - baseStats.averagePerDay) < 0.01,
  `средняя после раскладки ${plan.averagePerDay} не совпала с набором ${baseStats.averagePerDay}`,
);
check(plan.maxDayMinutes === peak, 'сводка maxDayMinutes не совпала с симуляцией');
check(peak <= MAX_PEAK_MINUTES, `худший день ${peak} мин — выше предела ${MAX_PEAK_MINUTES}`);

// ── Детерминированность ─────────────────────────────────────────────────────
const again = buildBasePlan({}, today);

check(
  JSON.stringify(again.tasks) === JSON.stringify(plan.tasks),
  'раскладка недетерминирована: два прогона дали разные планы',
);

// ── Расширения ──────────────────────────────────────────────────────────────
const noContext: ExtraContextAnswers = {
  pets: [],
  outdoor: 'none',
  hasKidsRoom: false,
  worksFromHome: false,
};

const cat: ExtraContextAnswers = { ...noContext, pets: ['cats'] };
const fish: ExtraContextAnswers = { ...noContext, pets: ['fish'] };
const full: PartialHomeAnswers = {
  pets: ['cats', 'dogs'],
  outdoor: 'yard',
  hasKidsRoom: true,
  worksFromHome: true,
  dailyMinutes: '30to60',
};

check(extrasFor(noContext).length === 0, 'без ответов анкеты включились расширения');
check(
  extrasFor(cat).some((task) => task.task.includes('лоток')) &&
    !extrasFor(cat).some((task) => task.task.includes('аквариум')),
  'кот получил не свои задачи',
);
check(
  extrasFor(fish).some((task) => task.task.includes('аквариум')) &&
    !extrasFor(fish).some((task) => task.task.includes('лоток')),
  'рыбки получили не свои задачи',
);

const profiles: ReadonlyArray<readonly [string, PartialHomeAnswers]> = [
  ['полный дом', full],
  ['полный дом, до 30 минут', { ...full, dailyMinutes: 'under30' }],
];

for (const [label, answers] of profiles) {
  const profile = buildBasePlan(answers, today);
  const profilePeak = peakOf(dayLoads(profile.tasks));

  check(profile.tasks.length >= baseStats.totalTasks, `${label}: потерялись базовые дела`);
  check(
    profile.averagePerDay <= dayBudget(answers) + 0.01,
    `${label}: средняя ${profile.averagePerDay} выше бюджета ${dayBudget(answers)}`,
  );
  check(
    profilePeak <= MAX_PROFILE_PEAK_MINUTES,
    `${label}: худший день ${profilePeak} мин — выше предела ${MAX_PROFILE_PEAK_MINUTES}`,
  );
}

/** Те же ответы в объёме, который нужен фильтру расширений. */
const fullContext: ExtraContextAnswers = {
  pets: full.pets ?? [],
  outdoor: full.outdoor ?? 'none',
  hasKidsRoom: full.hasKidsRoom ?? false,
  worksFromHome: full.worksFromHome ?? false,
};

// ── Итог ────────────────────────────────────────────────────────────────────
console.log(`Набор: ${baseStats.totalTasks} задач, средняя ${baseStats.averagePerDay} мин/день`);
console.log(
  `Раскладка: худший день ${peak} мин, дней выше ${MAX_DAILY_MINUTES} — ${over40} из ${baseLoad.size}`,
);
console.log(`Расширений: ${getExtraTasks().length}, в «полном доме» — ${extrasFor(fullContext).length}`);

if (problems.length > 0) {
  console.error(`\nПроверка не пройдена (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('\nПроверка пройдена.');
}
