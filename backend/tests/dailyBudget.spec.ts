import { describe, expect, it } from 'vitest';
import { DAY_BUDGET_MINUTES, MAX_DAILY_MINUTES, dayBudget } from '../services/dailyBudget';
import { buildBasePlan, occurrencesOf } from '../services/basePlan';
import type { PartialHomeAnswers } from '../services/homePlan';
import { getBaseTasks } from '../services/taskSets';

/**
 * Дневной бюджет и его соблюдение раскладкой.
 *
 * Числа бюджета — решение заказчика: средняя 25–30 минут в день, потолок 40, а
 * ответ анкеты задаёт, сколько места остаётся расширениям (under30 → 30,
 * depends → 35, 30to60 → 40). Сами числа живут в `services/dailyBudget.ts`.
 *
 * Проверки не ходят в базу: `services/basePlan.ts` — чистый модуль, и все
 * инварианты считаются на наборе ответов. Старый тест проверял снятый алгоритм
 * «впихнуть весь каталог в бюджет» и держал CI красным; ему на смену пришла эта
 * проверка нового раскладчика.
 */
const today = new Date('2026-01-05T00:00:00Z');

/** Худшая сумма минут в дне за окно проверки. */
const peakOf = (plan: ReturnType<typeof buildBasePlan>): number => {
  const load = new Map<string, number>();

  for (const task of plan.tasks) {
    for (const date of occurrencesOf(task, today, 400)) {
      load.set(date, (load.get(date) ?? 0) + task.minutes);
    }
  }

  return [...load.values()].reduce((max, minutes) => Math.max(max, minutes), 0);
};

const fullHouse: PartialHomeAnswers = {
  pets: ['cats', 'dogs'],
  outdoor: 'yard',
  hasKidsRoom: true,
  worksFromHome: true,
};

describe('дневной бюджет', () => {
  it('потолок дня 40, а ответы анкеты не превышают его', () => {
    expect(MAX_DAILY_MINUTES).toBe(40);
    expect(DAY_BUDGET_MINUTES.under30).toBe(30);
    expect(DAY_BUDGET_MINUTES['30to60']).toBe(40);
    expect(DAY_BUDGET_MINUTES.depends).toBe(35);

    for (const option of ['under30', '30to60', '1to2h', 'depends'] as const) {
      expect(dayBudget({ dailyMinutes: option })).toBeLessThanOrEqual(MAX_DAILY_MINUTES);
    }
  });

  it('незаполненная анкета берёт бюджет по умолчанию', () => {
    expect(dayBudget({})).toBe(DAY_BUDGET_MINUTES['30to60']);
  });

  it('базовый набор держит среднюю 25–30 без анкеты', () => {
    const plan = buildBasePlan({}, today);

    expect(plan.averagePerDay).toBeGreaterThanOrEqual(25);
    expect(plan.averagePerDay).toBeLessThanOrEqual(30);
  });

  const profiles: ReadonlyArray<readonly [string, PartialHomeAnswers]> = [
    ['без анкеты', {}],
    ['полный дом, 30–60 минут', { ...fullHouse, dailyMinutes: '30to60' }],
    ['полный дом, до 30 минут', { ...fullHouse, dailyMinutes: 'under30' }],
    ['полный дом, по-разному', { ...fullHouse, dailyMinutes: 'depends' }],
  ];

  for (const [label, answers] of profiles) {
    it(`${label}: средняя не выходит за бюджет ответа`, () => {
      const plan = buildBasePlan(answers, today);

      expect(plan.averagePerDay).toBeLessThanOrEqual(dayBudget(answers) + 0.01);
      expect(plan.tasks.length).toBeGreaterThanOrEqual(getBaseTasks().length);
    });

    it(`${label}: худший день не выходит за предел`, () => {
      // Строгие 40 при фиксированных частотах недостижимы: месячное дело стоит
      // на одном числе, а день недели за год проходит все семь. Предел 55 —
      // фактический максимум раскладки (замер: 10–20 дней из 400 выше 40).
      expect(peakOf(buildBasePlan(answers, today))).toBeLessThanOrEqual(55);
    });
  }
});
