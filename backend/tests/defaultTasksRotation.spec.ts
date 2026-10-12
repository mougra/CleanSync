import { describe, expect, it } from 'vitest';
import {
  buildDefaultTasks,
  MAX_ZONE_TASKS_PER_DAY,
  type DefaultTaskSet,
} from '../services/defaultTasks';
import { dayBudget } from '../services/dailyBudget';
import { orderWeekDays, type PartialHomeAnswers } from '../services/homePlan';

/**
 * Ротация ежедневного блока по дням уборки.
 *
 * Заказчик жаловался на две вещи сразу: «закрытые сегодня задачи видны закрытыми
 * и в другие дни» (это лечит журнал отметок, миграция 0018) и «на другие дни
 * почти тот же список, и кухни всегда 3». Второе — про генератор: раньше
 * ежедневный минимум набирал 12-18 минут одними и теми же делами (в основном
 * кухонными) и повторял их в каждом дне.
 *
 * Проверки ниже держат три правила и не требуют базы: генератор — чистый модуль.
 *  1. По-настоящему ежедневных дел не больше двух (EVERY_DAY_TASK_LIMIT), и они
 *     лежат в каждом дне — «минимум» никуда не пропадает.
 *  2. Остальные дела ежедневного блока разложены по дням уборки как недельные,
 *     поэтому понедельник, среда и суббота отличаются друг от друга.
 *  3. В одном дне не больше MAX_ZONE_TASKS_PER_DAY задач одной зоны: кухня
 *     больше не занимает день целиком.
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

describe('ротация ежедневного блока по дням уборки', () => {
  it('по-настоящему ежедневных дел не больше двух, и они лежат в каждом дне', () => {
    for (const answers of [THREE_DAYS, EVERY_DAY]) {
      const set = buildDefaultTasks(answers);
      const daily = set.tasks.filter((task) => task.frequency === 'daily');

      expect(set.summary.dailyTasks).toBe(daily.length);
      expect(daily.length).toBeGreaterThan(0);
      expect(daily.length).toBeLessThanOrEqual(2);

      for (const day of set.summary.days) {
        for (const task of daily) {
          expect(day.tasks.map((item) => item.title), day.label).toContain(task.title);
        }
      }
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

    // Разницу дают именно дела ежедневного блока, разложенные по дням: ротация
    // не пустая, и её дела в расписании — недельные.
    expect(set.summary.rotatedTasks).toBeGreaterThan(0);

    for (const task of set.tasks) {
      if (task.frequency !== 'weekly') continue;

      expect(THREE_DAYS.cleaningDays).toContain(task.dayOfWeek);
    }
  });

  it('дело ежедневного блока не повторяется в каждом дне', () => {
    const set = buildDefaultTasks(THREE_DAYS);
    const dailyTitles = new Set(
      set.tasks.filter((task) => task.frequency === 'daily').map((task) => task.title)
    );

    // «Ополоснуть раковину» и «протереть стол» раньше стояли в каждом дне;
    // теперь это недельные дела, и в неделе каждое встречается один раз.
    const weekly = set.tasks.filter((task) => task.frequency === 'weekly');
    const counts = new Map<string, number>();

    for (const task of weekly) {
      counts.set(task.title, (counts.get(task.title) ?? 0) + 1);
    }

    for (const [title, count] of counts) {
      expect(count, title).toBe(1);
    }

    // Хотя бы одно «бывшее ежедневное» дело ушло из каждого дне в свой день.
    expect([...counts.keys()].some((title) => !dailyTitles.has(title))).toBe(true);
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
          expect(count, `${day.label}, зона «${room}»`).toBeLessThanOrEqual(
            MAX_ZONE_TASKS_PER_DAY
          );
        }
      }
    }
  });

  it('дни без уборки остаются с ежедневным минимумом, а дни уборки — с ротацией', () => {
    const set = buildDefaultTasks(THREE_DAYS);
    const dailyTitles = new Set(
      set.tasks.filter((task) => task.frequency === 'daily').map((task) => task.title)
    );

    for (const day of set.summary.days) {
      const extra = day.tasks.filter((task) => !dailyTitles.has(task.title));

      if (day.selected) {
        // В выбранном дне, кроме минимума, есть дела ротации или недельные.
        expect(extra.length, day.label).toBeGreaterThan(0);
      } else {
        expect(extra, day.label).toHaveLength(0);
        expect(day.tasks.length).toBe(dailyTitles.size);
      }

      // Пустых дней нет ни в одном случае: это же проверяет
      // scripts/check-default-tasks.ts на 88 комбинациях ответов.
      expect(day.tasks.length, day.label).toBeGreaterThan(0);
      expect(day.minutes, day.label).toBeLessThanOrEqual(dayBudget(THREE_DAYS));
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

  it('на семи днях уборки ротация раскладывается по всем дням, а не липнет к одному', () => {
    const set = buildDefaultTasks(EVERY_DAY);
    const dailyTitles = new Set(
      set.tasks.filter((task) => task.frequency === 'daily').map((task) => task.title)
    );
    const daysWithRotation = set.summary.days.filter((day) =>
      day.tasks.some((task) => !dailyTitles.has(task.title))
    );

    expect(daysWithRotation.length).toBeGreaterThan(1);
    expect(set.summary.rotatedTasks).toBeGreaterThan(0);
    expect(set.summary.rotatedMinutes).toBeGreaterThan(0);
  });
});
