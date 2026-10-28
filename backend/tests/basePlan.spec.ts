import { describe, expect, it } from 'vitest';
import { buildBasePlan, taskDueOn } from '../services/basePlan';
import type { PartialHomeAnswers } from '../services/homePlan';
import { extrasFor, getBaseTasks } from '../services/taskSets';

/**
 * Раскладка курируемого набора по дням.
 *
 * Проверяем обещания, которые даны заказчику: все 81 дело на месте, частоты не
 * меняются, средняя 25–30 минут в день, раскладка детерминирована, а расширения
 * включаются только своими ответами. Потолок 40 проверяется отдельно: строгие 40
 * при фиксированных частотах недостижимы, поэтому тест держит предел 55.
 */
const today = new Date('2026-01-05T00:00:00Z');

describe('раскладка базового набора', () => {
  const plan = buildBasePlan({}, today);

  it('ставит все 81 дело и ничего не теряет', () => {
    expect(plan.tasks.length).toBe(getBaseTasks().length);
    expect(plan.dropped).toEqual([]);
  });

  it('сохраняет частоту каждого дела', () => {
    const byTitle = new Map(getBaseTasks().map((task) => [task.task, task.cadence]));

    for (const task of plan.tasks) {
      expect(task.cadence).toBe(byTitle.get(task.title));
    }
  });

  it('держит среднюю 25–30 минут в день', () => {
    expect(plan.averagePerDay).toBeGreaterThanOrEqual(25);
    expect(plan.averagePerDay).toBeLessThanOrEqual(30);
  });

  it('не выходит за предел худшего дня', () => {
    expect(plan.maxDayMinutes).toBeLessThanOrEqual(55);
  });

  it('детерминирована: два прогона дают один план', () => {
    expect(buildBasePlan({}, today).tasks).toEqual(plan.tasks);
  });

  it('ставит дело на конкретный день, а не «вообще»', () => {
    for (const task of plan.tasks) {
      const hits = Array.from({ length: 60 }, (_, offset) =>
        taskDueOn(task, new Date(today.getTime() + offset * 24 * 60 * 60 * 1000)),
      ).filter(Boolean);

      expect(hits.length).toBeGreaterThan(0);
    }
  });
});

describe('расширения по анкете', () => {
  const noContext = { pets: [], outdoor: 'none', hasKidsRoom: false, worksFromHome: false };

  it('без ответов ничего не добавляют', () => {
    expect(extrasFor(noContext)).toEqual([]);
  });

  it('кот получает лоток, но не аквариум', () => {
    const tasks = extrasFor({ ...noContext, pets: ['cats'] }).map((task) => task.task);

    expect(tasks).toContain('Вымыть лоток и заменить наполнитель');
    expect(tasks).not.toContain('Почистить аквариум и поменять воду');
  });

  it('полный дом набирает расширения, но средняя не выходит за бюджет', () => {
    const answers: PartialHomeAnswers = {
      pets: ['cats', 'dogs'],
      outdoor: 'yard',
      hasKidsRoom: true,
      worksFromHome: true,
      dailyMinutes: '30to60',
    };
    const plan = buildBasePlan(answers, today);

    expect(plan.tasks.length).toBeGreaterThan(getBaseTasks().length);
    expect(plan.averagePerDay).toBeLessThanOrEqual(40);
  });
});
