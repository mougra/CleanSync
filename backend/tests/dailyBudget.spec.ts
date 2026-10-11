import { afterAll, describe, expect, it } from 'vitest';
import {
  DAY_BUDGET_MINUTES,
  MAX_DAILY_MINUTES,
  dayBudget,
  occupiedMinutesByWeekday,
} from '../services/dailyBudget';
import {
  buildDefaultTasks,
  MAX_DAILY_MINUTES as MAX_DAILY_MINUTES_FROM_DEFAULT_TASKS,
} from '../services/defaultTasks';
import {
  buildHomePlan,
  DAILY_BUDGET,
  HOME_PLAN_SOURCE,
  withDefaultAnswers,
  type PartialHomeAnswers,
} from '../services/homePlan';
import pool from '../db';

/**
 * Дневной бюджет сгенерированных задач и согласование двух генераторов.
 *
 * Числа бюджета утверждены заказчиком (under30 → 25, 30to60 → 40, 1to2h → 40,
 * depends → 30) и живут в одном месте — services/dailyBudget.ts. Проверки
 * делятся на две части:
 *
 *  - чистая арифметика бюджета и генераторы (services/defaultTasks.ts,
 *    services/homePlan.ts) — модули ничего не пишут в базу, поэтому эти проверки
 *    идут всегда;
 *  - состояние базы (задачи плана помечены `home_plan`) — только при живой базе,
 *    иначе блок пропускается через `describe.skipIf`.
 */

const dbReady = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch(() => false);

afterAll(async () => {
  await pool.end();
});

/**
 * Суммарные сгенерированные минуты по дням недели: «Мои задачи» (ежедневный
 * минимум и недельные дела) плюс недельный план, собранный с оглядкой на них.
 */
const generatedMinutesByWeekday = (input: PartialHomeAnswers): number[] => {
  const answers = withDefaultAnswers(input);
  const defaultSet = buildDefaultTasks(answers);
  const occupied = occupiedMinutesByWeekday(defaultSet);
  const plan = buildHomePlan(answers, occupied);
  const byWeekday: number[] = Array.from(
    { length: 7 },
    (_, weekday) => occupied.get(weekday) ?? 0
  );

  for (const day of plan.days) {
    if (day.selected) byWeekday[day.dayOfWeek] += day.totalMinutes;
  }

  return byWeekday;
};

describe('дневной бюджет по ответу анкеты', () => {
  it('таблица ответов: under30 → 25, 30to60 → 40, 1to2h → 40, depends → 30', () => {
    expect(DAY_BUDGET_MINUTES.under30).toBe(25);
    expect(DAY_BUDGET_MINUTES['30to60']).toBe(40);
    expect(DAY_BUDGET_MINUTES['1to2h']).toBe(40);
    expect(DAY_BUDGET_MINUTES.depends).toBe(30);
  });

  it('dayBudget отдаёт бюджет по ответу', () => {
    expect(dayBudget({ dailyMinutes: 'under30' })).toBe(25);
    expect(dayBudget({ dailyMinutes: '30to60' })).toBe(40);
    expect(dayBudget({ dailyMinutes: '1to2h' })).toBe(40);
    expect(dayBudget({ dailyMinutes: 'depends' })).toBe(30);
  });

  it('ответа нет — бюджет значения по умолчанию (30-60 минут в день)', () => {
    expect(dayBudget({})).toBe(dayBudget({ dailyMinutes: '30to60' }));
  });

  it('бюджет никогда не выше абсолютного потолка 40 минут', () => {
    for (const option of ['under30', '30to60', '1to2h', 'depends'] as const) {
      expect(dayBudget({ dailyMinutes: option })).toBeLessThanOrEqual(MAX_DAILY_MINUTES);
    }

    // Потолок объявлен один раз: реэкспорт из генератора набора — то же число.
    expect(MAX_DAILY_MINUTES).toBe(40);
    expect(MAX_DAILY_MINUTES_FROM_DEFAULT_TASKS).toBe(MAX_DAILY_MINUTES);
  });

  it('числа бюджета в недельном плане — те же, что в модуле', () => {
    expect(DAILY_BUDGET).toEqual(DAY_BUDGET_MINUTES);
  });

  it('карта занятости дня: ежедневный минимум плюс недельные дела этого дня', () => {
    const set = buildDefaultTasks({ dailyMinutes: 'under30' });
    const occupied = occupiedMinutesByWeekday(set);
    const daily = set.tasks
      .filter((task) => task.frequency === 'daily')
      .reduce((sum, task) => sum + task.minutes, 0);

    expect(occupied.size).toBe(7);

    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      const weekly = set.tasks
        .filter((task) => task.frequency === 'weekly' && task.dayOfWeek === day)
        .reduce((sum, task) => sum + task.minutes, 0);

      expect(occupied.get(day)).toBe(daily + weekly);
    }
  });
});

describe('defaultTasks: бюджет under30 — не больше 25 минут на сгенерированных задачах', () => {
  /** Ответы «минимум, 20-30 минут в день» — тот самый случай из замера. */
  const UNDER30: PartialHomeAnswers = {
    housingType: 'apartment',
    rooms: '3-4',
    composition: 'partner',
    pets: ['cats'],
    outdoor: 'balcony',
    drying: 'air',
    cleaningLevel: 'normal',
    dailyMinutes: 'under30',
    cleaningStyle: 'varies',
    cleaningDays: [1, 3, 6],
    hardestZone: 'kitchen',
  };

  it('ни один день недели не выходит за 25 минут', () => {
    const set = buildDefaultTasks(UNDER30);
    const budget = dayBudget(UNDER30);

    expect(budget).toBe(25);
    expect(set.summary.dailyLimit).toBe(25);
    expect(set.summary.dailyMinutes).toBeLessThanOrEqual(25);
    expect(set.summary.maxDailyMinutes).toBeLessThanOrEqual(25);

    for (const day of set.summary.days) {
      expect(day.minutes).toBeLessThanOrEqual(25);
    }
  });

  it('любое число месяца: ежедневный минимум + недельные + редкие ≤ 25', () => {
    const set = buildDefaultTasks(UNDER30);
    const budget = dayBudget(UNDER30);

    // Редкие дела разведены по классам месяцев (задача с интервалом N занимает
    // только сравнимые с опорой месяцы), поэтому по числу берётся худший класс:
    // складывать все редкие дела одного числа нельзя — вместе они не встречаются.
    const monthClassesOf = (task: { dueDate: string | null; intervalCount: number }): number[] => {
      const interval = Math.max(1, task.intervalCount);
      const now = new Date();
      const anchor = task.dueDate ? new Date(`${task.dueDate}T00:00:00Z`) : now;
      const monthsApart =
        anchor.getUTCFullYear() * 12 +
        anchor.getUTCMonth() -
        (now.getUTCFullYear() * 12 + now.getUTCMonth());
      const offset = ((monthsApart % interval) + interval) % interval;

      return Array.from({ length: 12 }, (_, month) => month).filter(
        (month) => (((month - offset) % interval) + interval) % interval === 0
      );
    };

    const rareByClass = new Map<number, Map<number, number>>();

    for (const task of set.tasks) {
      if (task.frequency !== 'monthly' || task.dayOfMonth === null) continue;

      for (const month of monthClassesOf(task)) {
        const byDate = rareByClass.get(month) ?? new Map<number, number>();

        byDate.set(task.dayOfMonth, (byDate.get(task.dayOfMonth) ?? 0) + task.minutes);
        rareByClass.set(month, byDate);
      }
    }

    const worstRare = new Map<number, number>();

    for (const byDate of rareByClass.values()) {
      for (const [day, minutes] of byDate) {
        worstRare.set(day, Math.max(worstRare.get(day) ?? 0, minutes));
      }
    }

    for (let day = 1; day <= 28; day += 1) {
      const weekday = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), day)
      ).getUTCDay();
      const weekly = set.tasks
        .filter((task) => task.frequency === 'weekly' && task.dayOfWeek === weekday)
        .reduce((sum, task) => sum + task.minutes, 0);
      const total = set.summary.dailyMinutes + weekly + (worstRare.get(day) ?? 0);

      expect(total, `${day}-е число`).toBeLessThanOrEqual(budget);
    }
  });

  it('ежедневный минимум 12-18 минут остаётся минимумом, а не лимитом', () => {
    const set = buildDefaultTasks(UNDER30);

    expect(set.summary.dailyTasks).toBeGreaterThan(0);
    expect(set.summary.dailyMinutes).toBeGreaterThanOrEqual(12);
    expect(set.summary.dailyMinutes).toBeLessThanOrEqual(18);
  });

  it('в каждом выбранном дне есть хотя бы одна задача', () => {
    const set = buildDefaultTasks(UNDER30);

    for (const day of set.summary.days.filter((item) => item.selected)) {
      expect(day.tasks.length, day.label).toBeGreaterThan(0);
    }
  });
});

describe('генераторы согласованы: сумма сгенерированного дня в бюджете', () => {
  const CASES: Array<[string, PartialHomeAnswers]> = [
    ['under30, 3 дня, обычная', { dailyMinutes: 'under30', cleaningDays: [1, 3, 6] }],
    ['under30, 7 дней, глубокая', { dailyMinutes: 'under30', cleaningLevel: 'deep', cleaningDays: [0, 1, 2, 3, 4, 5, 6] }],
    [
      'under30, всё за один подход',
      {
        dailyMinutes: 'under30',
        cleaningStyle: 'all_at_once',
        cleaningDays: [1, 2, 3, 4],
        cleaningLevel: 'deep',
        rooms: '8+',
        pets: ['dogs'],
        worksFromHome: true,
      },
    ],
    ['30to60, 2 дня, лёгкая', { dailyMinutes: '30to60', cleaningLevel: 'light', cleaningDays: [2, 4] }],
    ['depends, 5 дней', { dailyMinutes: 'depends', cleaningDays: [1, 2, 3, 4, 5] }],
    ['1to2h, 5 дней, дом с двором', {
      dailyMinutes: '1to2h',
      rooms: '8+',
      composition: 'family_kids',
      pets: ['dogs', 'fish'],
      outdoor: 'yard',
      hasKidsRoom: true,
      hasGarage: true,
      cleaningLevel: 'deep',
      cleaningStyle: 'all_at_once',
      cleaningDays: [1, 3, 5, 6, 0],
    }],
  ];

  for (const [label, answers] of CASES) {
    it(`${label}: ни один день недели не выше бюджета и не пустой`, () => {
      const budget = dayBudget(answers);
      const byWeekday = generatedMinutesByWeekday(answers);

      expect(byWeekday).toHaveLength(7);

      for (const minutes of byWeekday) {
        expect(minutes, label).toBeLessThanOrEqual(budget);
        // Ежедневный минимум лежит в каждом дне, поэтому пустых дней быть не может.
        expect(minutes, label).toBeGreaterThan(0);
      }
    });
  }

  it('день, полностью занятый «Моими задачами», план не добирает минутами', () => {
    const answers = withDefaultAnswers({
      dailyMinutes: 'under30',
      cleaningDays: [1, 3, 6],
      cleaningLevel: 'deep',
      rooms: '8+',
      composition: 'family_kids',
    });
    const defaultSet = buildDefaultTasks(answers);
    const occupied = occupiedMinutesByWeekday(defaultSet);

    // Искусственная занятость: день выбран, а бюджета в нём не осталось.
    const full = new Map(occupied);
    full.set(1, dayBudget(answers));

    const plan = buildHomePlan(answers, full);
    const monday = plan.days.find((day) => day.dayOfWeek === 1);
    const others = plan.days.filter((day) => day.selected && day.dayOfWeek !== 1);

    expect(monday?.selected).toBe(true);
    expect(monday?.totalMinutes).toBe(0);
    expect(monday?.tasks).toHaveLength(0);
    // Другие дни недели продолжают получать задачи: один занятый день не
    // выключает план целиком, он просто ничего не добавляет в этот день.
    expect(others.length).toBeGreaterThan(0);

    for (const day of others) {
      expect(day.totalMinutes, day.label).toBeGreaterThan(0);
    }
  });

  it('без карты занятости план целиком укладывается в бюджет дня', () => {
    const answers = withDefaultAnswers({ dailyMinutes: 'under30', cleaningDays: [1, 3, 6] });
    const plan = buildHomePlan(answers);
    const budget = dayBudget(answers);

    expect(plan.summary.dailyBudget).toBe(budget);

    for (const day of plan.days) {
      expect(day.totalMinutes, day.label).toBeLessThanOrEqual(budget);
    }
  });

  it('источник задач плана — home_plan', () => {
    expect(HOME_PLAN_SOURCE).toBe('home_plan');
  });
});

/**
 * Часть ниже проверяет состояние базы: задачи недельного плана, записанные
 * маршрутом (routes/homeProfile.ts), обязаны быть помечены `source = 'home_plan'`
 * — иначе сгенерированное неотличимо от созданного руками. Без базы блок
 * пропускается целиком.
 */
describe.skipIf(!dbReady)('источник задач недельного плана', () => {
  it('в схеме есть колонка source, а миграция-бэкфилл проставила home_plan', async () => {
    const column = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'source'`
    );

    expect(column.rows).toHaveLength(1);

    // Задачи расписания «План по дому» без пометки быть не должно: маршрут
    // ставит её при вставке, а старые строки закрыла миграция 0016.
    const unmarked = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
         FROM tasks t JOIN schedules s ON s.id = t.schedule_id
        WHERE s.title = 'План по дому' AND t.source IS NULL`
    );

    expect(unmarked.rows[0].total).toBe(0);
  });
});
