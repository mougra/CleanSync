import { describe, expect, it } from 'vitest';
import {
  buildDefaultTasks,
  defaultTaskCandidateCount,
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

/**
 * Полнота набора и частоты, которые заказчик назвал прямо.
 *
 * Смысл правки: квоты («полов не больше трёх, пыли не больше двух») убраны, а
 * бюджет удлиняет цикл вместо того, чтобы выбрасывать дело. Поэтому здесь
 * проверяется, что набор **не теряет** подходящие дела каталога (кроме
 * объяснённого минимума на предельных профилях) и что названные частоты стоят
 * там, где их просили.
 */
describe('полнота набора и названные частоты', () => {
  const PROFILES: Array<[string, PartialHomeAnswers]> = [
    ['студия, минимум, 3 дня', THREE_DAYS],
    ['квартира, 30-60 мин, 2 дня', { ...THREE_DAYS, dailyMinutes: '30to60', cleaningDays: [2, 4] }],
    ['дом, всё сразу, 5 дней', { ...EVERY_DAY, cleaningDays: [1, 3, 5, 6, 0] }],
    ['квартира, зависит, 5 дней', { ...THREE_DAYS, dailyMinutes: 'depends', cleaningDays: [1, 2, 3, 4, 5] }],
  ];

  it('каталог не теряет подходящие дела: в наборе ровно то, что подходит минус объяснённые потери', () => {
    for (const [label, answers] of PROFILES) {
      const set = buildDefaultTasks(answers);

      expect(set.summary.candidateTasks, label).toBe(defaultTaskCandidateCount(answers));
      expect(set.summary.totalTasks, label).toBe(
        set.summary.candidateTasks - set.summary.droppedTasks
      );
      expect(set.summary.includedTasks, label).toBe(set.summary.totalTasks);
    }
  });

  it('в наборе нет дублей названий: название — ключ расписания', () => {
    for (const [label, answers] of PROFILES) {
      const set = buildDefaultTasks(answers);
      const titles = set.tasks.map((task) => task.title);

      expect(new Set(titles).size, label).toBe(titles.length);
    }
  });

  it('постельное бельё меняется раз в неделю', () => {
    for (const [label, answers] of PROFILES) {
      const task = buildDefaultTasks(answers).tasks.find(
        (entry) => entry.title === 'Сменить постельное бельё'
      );

      expect(task, label).toBeDefined();
      expect(task?.cadence, label).toBe('weekly');
      expect(task?.frequency, label).toBe('weekly');
      // Интервал периодичности — в днях: неделя это 7 дней.
      expect(task?.intervalCount, label).toBe(7);
      expect(task?.dayOfWeek, label).not.toBeNull();
    }
  });

  it('зеркало в ванной — раз в месяц, зеркало в прихожей — раз в 3 недели', () => {
    /**
     * Частоты из пункта 6 правки заказчика: зеркало в ванной — раз в месяц,
     * зеркало в прихожей — раз в 3 месяца. Каталог держит первую ступень, а
     * генератор может её удлинить, если бюджет не пускает: это разрешено, но
     * названная частота должна быть первой ступенью, а не «когда-нибудь».
     */
    const catalog = getTaskCatalog();
    const bathroomCatalog = catalog.find(
      (task) => task.task === 'Помыть зеркало в ванной без разводов'
    );
    const hallwayCatalog = catalog.find((task) => task.task === 'Протереть зеркало в прихожей');

    expect(bathroomCatalog?.cadence).toBe('monthly');
    expect(hallwayCatalog?.cadence).toBe('threeWeeks');

    for (const [label, answers] of PROFILES) {
      const tasks = buildDefaultTasks(answers).tasks;
      const bathroom = tasks.find((entry) => entry.title === 'Помыть зеркало в ванной без разводов');
      const hallway = tasks.find((entry) => entry.title === 'Протереть зеркало в прихожей');

      // Названная частота не может стать **чаще**, чем просили: генератор только
      // удлиняет цикл. Для «раз в месяц» это интервал не меньше месяца — то есть
      // не меньше 30 дней (интервал периодичности выражается в днях).
      expect(bathroom, label).toBeDefined();
      expect(bathroom?.frequency, label).toBe('monthly');
      expect(bathroom?.intervalCount, label).toBeGreaterThanOrEqual(30);
      expect(bathroom?.dayOfMonth, label).toBeGreaterThanOrEqual(1);
      expect(bathroom?.dayOfMonth, label).toBeLessThanOrEqual(28);

      expect(hallway, label).toBeDefined();
      expect(hallway?.frequency, label).toBe('weekly');
      expect(hallway?.intervalCount, label).toBeGreaterThanOrEqual(21);
      expect(hallway?.dayOfWeek, label).not.toBeNull();
    }
  });

  it('полы жилых комнат — одной задачей на квартиру, гаражные дела в наборе не участвуют', () => {
    const titles = getTaskCatalog().map((task) => task.task);
    // В каталоге остаются только гаражные полы: гараж исключён из генерации
    // целиком (заказчик убрал вопрос про гараж), а каталог его сохраняет.
    const perRoom = titles.filter((title) => /^(вымыть|помыть|подмести) пол в /i.test(title));

    expect(perRoom.sort()).toEqual(['Подмести пол в гараже', 'Помыть пол в гараже'].sort());

    const wholeFlat = getTaskCatalog().filter((task) => task.tags.includes('floors'));
    const wipe = wholeFlat.filter((task) => task.task.includes('во всей квартире'));

    expect(wipe.some((task) => task.task === 'Вымыть полы во всей квартире')).toBe(true);
    expect(wipe.some((task) => task.task === 'Пропылесосить полы во всей квартире')).toBe(true);

    // В самом наборе гаражных дел нет ни у одного профиля.
    for (const [label, answers] of PROFILES) {
      const set = buildDefaultTasks(answers);

      expect(
        set.tasks.filter((task) => task.room === 'Гараж' || task.tags.includes('garage')),
        label
      ).toEqual([]);
    }
  });

  it('робот-пылесос — отдельные дела про технику, а не ежедневная рутина', () => {
    const robot = getTaskCatalog().filter((task) => /робот-пылесос/i.test(task.task));

    expect(robot.length).toBeGreaterThanOrEqual(2);

    for (const task of robot) {
      expect(task.cadence).not.toBe('daily');
      expect(task.minutes).toBeLessThanOrEqual(25);
    }
  });

  it('недельные периодичности попадают в набор и считаются выборкой', () => {
    const set = buildDefaultTasks(THREE_DAYS);
    const weekly = set.tasks.filter((task) => task.frequency === 'weekly');

    // Недельные интервалы — ступени лестницы в днях: неделя, 2, 3 и 6 недель.
    // «Раз в 3 недели» и «раз в 6 недель» — полноценные ступени (21 и 42 дня).
    for (const task of weekly) {
      expect([7, 14, 21, 42], task.title).toContain(task.intervalCount);
    }

    expect(set.summary.cadences.weekly + set.summary.cadences.biweekly).toBeGreaterThan(0);
  });

  it('периодичность сгенерированного набора живёт в коридоре 7…180 дней', () => {
    /**
     * Решение заказчика: дефолтные дела — не чаще раза в неделю и не реже раза в
     * полгода. Годовые дела каталога становятся «раз в 180 дней», а всё, чему не
     * хватило места на этой ступени, уходит в `droppedTasks`, а не превращается в
     * сгенерированное «раз в 3 года».
     */
    for (const answers of [THREE_DAYS, EVERY_DAY]) {
      for (const task of buildDefaultTasks(answers).tasks) {
        expect(task.intervalCount, `${task.title} (${task.frequency})`).toBeGreaterThanOrEqual(7);
        expect(task.intervalCount, `${task.title} (${task.frequency})`).toBeLessThanOrEqual(180);
      }
    }
  });
});
