import { describe, expect, it } from 'vitest';
import { buildDefaultTasks, defaultTaskCandidateCount } from '../services/defaultTasks';
import type { PartialHomeAnswers } from '../services/homePlan';
import { getBaseTasks } from '../services/taskSets';

/**
 * Дни набора «Мои задачи».
 *
 * Старый тест проверял ротацию ежедневного минимума и раскладку каталога — обе
 * механики сняты переделкой (docs/PLAN-tasks-rework.md). Осталось то, что важно
 * для человека: в каждом дне недели есть дела, дни не повторяют друг друга, а
 * база не теряется при добавлении расширений.
 */
const TODAY = new Date('2026-01-05T00:00:00Z');
const set = buildDefaultTasks({}, TODAY);

describe('дни набора «Мои задачи»', () => {
  it('в каждом дне недели есть дела', () => {
    expect(set.summary.days).toHaveLength(7);

    for (const day of set.summary.days) {
      expect(day.tasks.length).toBeGreaterThan(0);
    }
  });

  it('дни различаются: это не один и тот же список', () => {
    const signatures = set.summary.days.map((day) =>
      day.tasks.map((task) => task.title).join('|'),
    );

    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('без ответов анкеты кандидатов ровно столько, сколько в базе', () => {
    expect(defaultTaskCandidateCount({})).toBe(getBaseTasks().length);
  });

  it('анкета добавляет дела, но базовые не теряются', () => {
    const answers: PartialHomeAnswers = {
      pets: ['cats'],
      outdoor: 'yard',
      hasKidsRoom: true,
      worksFromHome: true,
    };

    const full = buildDefaultTasks(answers, TODAY);
    const titles = new Set(full.tasks.map((task) => task.title));

    expect(full.summary.totalTasks).toBeGreaterThan(set.summary.totalTasks);

    for (const base of getBaseTasks()) {
      expect(titles.has(base.task)).toBe(true);
    }
  });
});
