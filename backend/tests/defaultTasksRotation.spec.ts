import { describe, expect, it } from 'vitest';
import {
  buildDefaultTasks,
  MAX_ZONE_TASKS_PER_DAY,
  type DefaultTaskSet,
} from '../services/defaultTasks';
import { dayBudget } from '../services/dailyBudget';
import { getTaskCatalog } from '../services/taskCatalog';
import { orderWeekDays, type PartialHomeAnswers } from '../services/homePlan';

/**
 * Дни плана: ротация по дням уборки вместо ежедневного минимума.
 *
 * История правки. Сначала заказчик пожаловался, что «на другие дни почти тот же
 * список, и кухни всегда 3», и ежедневный минимум разложили по дням уборки.
 * Потом выяснилось, что сам ежедневный минимум был лишним: в каталоге он состоял
 * из бытовой рутины — убрать посуду, протереть обеденный стол после еды,
 * заправить кровать, проветрить. Человек делает это и без плана, а в расписании
 * оно выглядело заданием и выпадало на каждый день.
 *
 * Поэтому ежедневных дел в каталоге больше нет, а дни формирует ротация:
 *  - в выбранные дни уборки задачи есть всегда, и наборы разных дней различаются;
 *  - дни вне расписания пусты: человек там не убирается, и придумывать ему дело
 *    на понедельник, когда он убирается по вторникам, четвергам и субботам, —
 *    ровно та жалоба, из-за которой правка и делалась;
 *  - одна зона не занимает день целиком (не больше MAX_ZONE_TASKS_PER_DAY);
 *  - дневной бюджет по ответу анкеты не пробит.
 *
 * Проверки не требуют базы: генератор — чистый модуль.
 */

/** Профиль из трёх дней уборки: понедельник, среда, суббота — как в анкете. */
const THREE_DAYS: PartialHomeAnswers = {
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
  dailyMinutes: 'under30',
  cleaningStyle: 'varies',
  cleaningDays: [1, 3, 6],
  hardestZone: 'kitchen',
};

/** Тот же дом, но уборка каждый день: ротация должна работать и на семи днях. */
const EVERY_DAY: PartialHomeAnswers = {
  ...THREE_DAYS,
  dailyMinutes: '1to2h',
  cleaningLevel: 'deep',
  rooms: '8+',
  composition: 'family_kids',
  pets: ['cats', 'dogs'],
  outdoor: 'yard',
  hasKidsRoom: true,
  hasGarage: true,
  worksFromHome: true,
  drying: 'dryer',
  cleaningStyle: 'all_at_once',
  cleaningDays: [0, 1, 2, 3, 4, 5, 6],
  hardestZone: 'bathroom',
};

const titlesOf = (set: DefaultTaskSet, dayOfWeek: number): Set<string> =>
  new Set(set.summary.days.find((day) => day.dayOfWeek === dayOfWeek)?.tasks.map((task) => task.title));

const differs = (left: Set<string>, right: Set<string>): boolean =>
  left.size !== right.size || [...left].some((title) => !right.has(title));

describe('дни плана: ротация вместо ежедневного минимума', () => {
  it('в каталоге не осталось ежедневных дел', () => {
    const daily = getTaskCatalog().filter((task) => task.cadence === 'daily');

    expect(daily.map((task) => task.task)).toEqual([]);
  });

  it('в каталоге нет бытовой рутины, которую человек делает и без плана', () => {
    const titles = getTaskCatalog().map((task) => task.task);
    const routine = /убрать посуду|обеденный стол после еды|заправить кровать|проветрить|вечерний проход по ванной|плиту после готовки|разложить вещи по местам/i;

    expect(titles.filter((title) => routine.test(title))).toEqual([]);
  });

  it('набор не содержит задач с ежедневной периодичностью', () => {
    for (const answers of [THREE_DAYS, EVERY_DAY]) {
      const set = buildDefaultTasks(answers);

      expect(set.tasks.filter((task) => task.frequency === 'daily')).toEqual([]);
      expect(set.summary.dailyTasks).toBe(0);
    }
  });

  it('каждый выбранный день уборки не пустой', () => {
    const set = buildDefaultTasks(THREE_DAYS);

    for (const dayOfWeek of THREE_DAYS.cleaningDays ?? []) {
      const day = set.summary.days.find((entry) => entry.dayOfWeek === dayOfWeek);

      expect(day?.tasks.length ?? 0, `день ${dayOfWeek}`).toBeGreaterThan(0);
    }
  });

  it('дни вне расписания пусты: человек там не убирается', () => {
    const set = buildDefaultTasks(THREE_DAYS);
    const outside = [0, 2, 4, 5].filter((weekday) => !(THREE_DAYS.cleaningDays ?? []).includes(weekday));

    for (const weekday of outside) {
      const day = set.summary.days.find((entry) => entry.dayOfWeek === weekday);

      expect(day?.tasks.length ?? 0, `день ${weekday}`).toBe(0);
    }
  });

  it('понедельник, среда и суббота — разные наборы, а не один и тот же список', () => {
    const set = buildDefaultTasks(THREE_DAYS);
    const monday = titlesOf(set, 1);
    const wednesday = titlesOf(set, 3);
    const saturday = titlesOf(set, 6);

    expect(monday.size).toBeGreaterThan(0);
    expect(differs(monday, wednesday), 'Пн и Ср совпали').toBe(true);
    expect(differs(monday, saturday), 'Пн и Сб совпали').toBe(true);
    expect(differs(wednesday, saturday), 'Ср и Сб совпали').toBe(true);

    // Недельные дела лежат только в выбранных днях: иначе «день уборки» теряет смысл.
    for (const task of set.tasks) {
      if (task.frequency !== 'weekly') continue;

      expect(THREE_DAYS.cleaningDays, task.title).toContain(task.dayOfWeek);
    }
  });

  it('в дне не больше двух задач одной зоны', () => {
    for (const answers of [THREE_DAYS, EVERY_DAY]) {
      const set = buildDefaultTasks(answers);

      for (const day of set.summary.days) {
        const byRoom = new Map<string, number>();

        for (const task of day.tasks) {
          byRoom.set(task.room, (byRoom.get(task.room) ?? 0) + 1);
        }

        for (const [room, count] of byRoom) {
          expect(count, `${day.label}, зона «${room}»`).toBeLessThanOrEqual(MAX_ZONE_TASKS_PER_DAY);
        }
      }
    }
  });

  it('бюджет дня не пробит и порядок дней уборки соблюдён', () => {
    const set = buildDefaultTasks(THREE_DAYS);
    const budget = dayBudget(THREE_DAYS);

    expect(set.summary.maxDailyMinutes).toBeLessThanOrEqual(budget);
    expect(set.summary.dailyLimit).toBe(budget);

    for (const day of set.summary.days) {
      expect(day.minutes, day.label).toBeLessThanOrEqual(budget);
    }

    // Дни уборки идут в порядке макета: понедельник, среда, суббота.
    expect(orderWeekDays(THREE_DAYS.cleaningDays ?? [])).toEqual([1, 3, 6]);
  });

  it('на семи днях уборки задачи есть в большинстве дней, а не в одном', () => {
    const set = buildDefaultTasks(EVERY_DAY);
    const withTasks = set.summary.days.filter((day) => day.tasks.length > 0);

    expect(withTasks.length).toBeGreaterThanOrEqual(4);
  });
});
