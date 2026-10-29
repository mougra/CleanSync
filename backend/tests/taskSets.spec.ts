import { describe, expect, it } from 'vitest';
import { taskTitleEn, validateTaskSetTranslations } from '../content/en/taskSets';
import {
  CADENCE_PERIOD_DAYS,
  extrasFor,
  getBaseTasks,
  getExtraTasks,
  setStats,
  validateTaskSets,
  type ExtraContextAnswers,
} from '../services/taskSets';

/**
 * Курируемые наборы задач — фундамент новой переделки: из них собирается план
 * гостя и зарегистрированного, поэтому проверяем не только форму, но и
 * обещанные числа: 79 задач, 38 расширений и средняя нагрузка 25–30 минут в
 * день при потолке 40.
 */
const noContext: ExtraContextAnswers = {
  pets: [],
  outdoor: 'none',
  hasKidsRoom: false,
  worksFromHome: false,
};

describe('курируемые наборы задач', () => {
  it('базовый набор — 79 задач со средней нагрузкой 25–30 минут в день', () => {
    const tasks = getBaseTasks();
    const stats = setStats(tasks);

    expect(tasks.length).toBe(79);
    expect(stats.averagePerDay).toBeGreaterThanOrEqual(25);
    expect(stats.averagePerDay).toBeLessThanOrEqual(30);
    expect(stats.averagePerDay).toBeCloseTo(28.19, 2);
  });

  it('базовый набор использует десять частот из согласованного плана', () => {
    const cadences = [...new Set(getBaseTasks().map((task) => task.cadence))].sort();

    expect(cadences).toEqual(
      ['biweekly', 'fourMonths', 'monthly', 'quarterly', 'semiannual', 'sixWeeks', 'threeWeeks', 'twoMonths', 'weekly', 'yearly'].sort(),
    );
    expect(CADENCE_PERIOD_DAYS.sixWeeks).toBe(42);
    expect(CADENCE_PERIOD_DAYS.yearly).toBe(360);
  });

  it('дублей названий нет, минуты в пределах потолка', () => {
    expect(validateTaskSets()).toEqual([]);
    expect(getBaseTasks().every((task) => task.minutes <= 30)).toBe(true);
  });

  it('расширений 38, и у каждого есть контекст включения', () => {
    const extras = getExtraTasks();

    expect(extras.length).toBe(38);
    expect(extras.every((task) => task.contexts.length > 0)).toBe(true);
  });

  it('английский есть у каждой задачи обоих наборов', () => {
    const titles = [...getBaseTasks(), ...getExtraTasks()].map((task) => task.task);

    expect(validateTaskSetTranslations(titles)).toEqual([]);
    expect(taskTitleEn('Протереть подоконники')).toBe('Wipe the windowsills');
  });

  it('питомцы разведены по животным: кот не получает аквариум, рыбка — лоток', () => {
    const cat = extrasFor({ ...noContext, pets: ['cats'] });
    const fish = extrasFor({ ...noContext, pets: ['fish'] });

    expect(cat.some((task) => task.task === 'Вымыть лоток и заменить наполнитель')).toBe(true);
    expect(cat.some((task) => task.task === 'Почистить аквариум и поменять воду')).toBe(false);
    expect(fish.some((task) => task.task === 'Почистить аквариум и поменять воду')).toBe(true);
    expect(fish.some((task) => task.task === 'Вымыть лоток и заменить наполнитель')).toBe(false);
  });

  it('без ответов анкеты расширений нет', () => {
    expect(extrasFor(noContext)).toEqual([]);
  });

  it('ребёнок, балкон, двор и работа из дома включают свои задачи', () => {
    const answers: ExtraContextAnswers = {
      pets: [],
      outdoor: 'yard',
      hasKidsRoom: true,
      worksFromHome: true,
    };
    const tasks = extrasFor(answers).map((task) => task.task);

    expect(tasks).toContain('Убрать книжки на полку');
    expect(tasks).toContain('Полить клумбы и грядки');
    expect(tasks).toContain('Разобрать полку с книгами и документами');
    expect(tasks).not.toContain('Вымыть пол на балконе');
  });
});
