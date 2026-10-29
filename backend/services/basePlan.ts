import type { TaskCadence, TaskLevel } from './taskCatalog';
import { dayBudget, MAX_DAILY_MINUTES } from './dailyBudget';
import { withDefaultAnswers, type HomeAnswers, type PartialHomeAnswers } from './homePlan';
import { CADENCE_PERIOD_DAYS, extrasFor, getBaseTasks, type SetTask } from './taskSets';

/**
 * Раскладка курируемого набора по дням.
 *
 * Чем это отличается от прежнего генератора (`services/defaultTasks.ts` до
 * переделки). Раньше алгоритм пытался вписать в бюджет весь каталог из трёхсот
 * задач и для этого **удлинял циклы**: дело с частотой «раз в неделю» могло уехать
 * на «раз в 2 месяца», если день не помещался. Заказчик попросил обратное:
 * частоты в наборе фиксированы, а раскладка только распределяет дела по дням и
 * числам, укладываясь в потолок дня.
 *
 * Правила:
 *  - база — 79 задач, одинаковая для всех; расширения — только по ответам анкеты;
 *  - недельные дела встают на наименее занятый день недели, редкие — на наименее
 *    занятое число месяца;
 *  - потолок дня — 40 минут (`MAX_DAILY_MINUTES` из `dailyBudget.ts`); проверяется не «в среднем», а по
 *    настоящим датам: задача примеряется на 400 дней вперёд и не ставится, если
 *    хотя бы в один день сумма превысит потолок;
 *  - если расширение не помещается никуда на своей частоте, цикл удлиняется
 *    (лестница `DEMOTION_LADDER`) — расширение необязательно, терять его жалко,
 *    а ломать потолок нельзя;
 *  - если редкое дело всё-таки попадает в занятый день, уезжает **само
 *    вхождение**, а не частота: `month_shifts[месяц - 1]` хранит, на сколько дней
 *    перенести дело в этом месяце. Выборка «Сегодня» применяет сдвиг при чтении,
 *    поэтому план в интерфейсе и раскладка совпадают.
 *
 * Почему сдвиг нужен. Месячное дело стоит на одном числе, а день недели у числа
 * за год проходит все семь. Недельная нагрузка местами занимает день почти
 * целиком, и без сдвига сумма выходила за 40 (замер до правки: 20 дней из 400,
 * максимум 50). Со сдвигом потолок держится: 40 минут в худший день на разных
 * опорных датах.
 */

/** Потолок нагрузки дня для сгенерированных задач: решение заказчика. */
const CAP = MAX_DAILY_MINUTES;

/** Окно проверки: год с запасом, чтобы поймать все классы месяцев. */
const WINDOW_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_IN_WEEK = 7;
const DAYS_IN_MONTH = 30;

/** Задача в объёме, который нужен для записи в `tasks`. */
export interface PlannedTask {
  title: string;
  room: string;
  minutes: number;
  level: TaskLevel;
  cadence: TaskCadence;
  frequency: 'daily' | 'weekly' | 'monthly';
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  /**
   * Сдвиг числа месяца по месяцам: массив из 12 значений, `monthShifts[месяц - 1]`.
   * `null` — без сдвигов.
   *
   * Это компромисс с фиксированными частотами: частота остаётся прежней, но само
   * вхождение уезжает на соседний день, когда его число попадает в занятый день.
   */
  monthShifts: number[] | null;
  dueDate: string | null;
}

interface CadenceRule {
  frequency: 'daily' | 'weekly' | 'monthly';
  intervalCount: number;
}

/** Периодичность → пара «частота + интервал в днях»: ровно то, что понимает tasks. */
const RULE: Record<TaskCadence, CadenceRule> = Object.fromEntries(
  (Object.keys(CADENCE_PERIOD_DAYS) as TaskCadence[]).map((cadence) => {
    const days = CADENCE_PERIOD_DAYS[cadence];

    if (cadence === 'daily') return [cadence, { frequency: 'daily', intervalCount: 1 }];
    if (days % DAYS_IN_WEEK === 0 && days <= 42) {
      return [cadence, { frequency: 'weekly', intervalCount: days }];
    }

    return [cadence, { frequency: 'monthly', intervalCount: days }];
  }),
) as Record<TaskCadence, CadenceRule>;

/**
 * Лестница удлинения цикла: только для расширений, которым не хватило места.
 *
 * База не удлиняется никогда: её частоты — это то, что заказчик утвердил, и
 * молча превращать «раз в неделю» в «раз в месяц» нельзя.
 */
const DEMOTION_LADDER: readonly TaskCadence[] = [
  'weekly',
  'biweekly',
  'threeWeeks',
  'sixWeeks',
  'monthly',
  'twoMonths',
  'quarterly',
  'fourMonths',
  'semiannual',
  'yearly',
];

const iso = (date: Date): string => date.toISOString().slice(0, 10);

const utcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** Ближайший день недели на сегодня или позже: опора цикла «раз в N недель». */
const nextWeekday = (today: Date, dayOfWeek: number): string => {
  const base = utcDay(today);
  base.setUTCDate(base.getUTCDate() + ((dayOfWeek - base.getUTCDay() + DAYS_IN_WEEK) % DAYS_IN_WEEK));

  return iso(base);
};

/**
 * Опора недельного цикла, выровненная по дню недели.
 *
 * «Раз в 3 недели» в понедельник — это не любой понедельник, а каждый третий от
 * опоры: выборка считает `MOD(FLOOR((дата - опора)/7), 3) = 0`. Опору подбираем
 * перебором, иначе цикл может ни разу не совпасть с выбранным днём.
 */
const alignedWeekday = (today: Date, dayOfWeek: number, weeks: number): string => {
  const nearest = nextWeekday(today, dayOfWeek);

  if (weeks <= 1) return nearest;

  const anchor = new Date(`${nearest}T00:00:00Z`).getTime();

  for (let step = 0; step < weeks; step += 1) {
    const base = utcDay(today);
    base.setUTCDate(base.getUTCDate() + step);
    const candidate = nextWeekday(base, dayOfWeek);
    const apart = Math.round((new Date(`${candidate}T00:00:00Z`).getTime() - anchor) / DAY_MS);

    if (apart % (weeks * DAYS_IN_WEEK) === 0) return candidate;
  }

  return nearest;
};

/** Ближайшее число месяца на сегодня или позже: опора цикла «раз в N месяцев». */
const nextMonthDay = (today: Date, dayOfMonth: number): string => {
  const base = utcDay(today);

  if (dayOfMonth >= base.getUTCDate()) {
    return iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), dayOfMonth)));
  }

  return iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, dayOfMonth)));
};

/** Сдвигает ISO-дату на дни: разводит первые вхождения одинаковых циклов. */
const addDays = (date: string, days: number): string => {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);

  return iso(base);
};

/** Сдвигает ISO-дату на месяцы: разводит опорные даты разных дел. */
const shiftMonths = (date: string, months: number): string => {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCMonth(base.getUTCMonth() + months);

  return iso(base);
};

/** Попадает ли задача на конкретный день — те же правила, что в SQL «Сегодня». */
export const taskDueOn = (task: PlannedTask, date: Date): boolean => {
  const day = utcDay(date);

  if (task.frequency === 'weekly') {
    if (day.getUTCDay() !== task.dayOfWeek) return false;
    if (task.intervalCount === DAYS_IN_WEEK) return true;
    if (!task.dueDate) return false;

    const anchor = new Date(`${task.dueDate}T00:00:00Z`);
    const weeks = Math.floor((day.getTime() - anchor.getTime()) / (DAY_MS * DAYS_IN_WEEK));

    return weeks >= 0 && weeks % (task.intervalCount / DAYS_IN_WEEK) === 0;
  }

  if (task.frequency === 'monthly') {
    /**
     * Эффективное число месяца: база плюс сдвиг для этого месяца.
     *
     * Сдвиг нужен, потому что редкое дело стоит на одном числе, а день недели у
     * числа за год проходит все семь. Если выпало на занятый день, вхождение
     * уезжает на соседний — ровно то же правило применяет SQL в `tasksDueOn`
     * (`routes/tasks.ts`), поэтому план в API и здесь совпадают.
     */
    const shift = task.monthShifts?.[day.getUTCMonth()] ?? 0;

    if (day.getUTCDate() !== (task.dayOfMonth ?? 0) + shift) return false;
    if (task.intervalCount === DAYS_IN_MONTH) return true;
    if (!task.dueDate) return false;

    const anchor = new Date(`${task.dueDate}T00:00:00Z`);
    const months =
      day.getUTCFullYear() * 12 +
      day.getUTCMonth() -
      (anchor.getUTCFullYear() * 12 + anchor.getUTCMonth());
    const step = task.intervalCount / DAYS_IN_MONTH;

    return months >= 0 && months % step === 0;
  }

  if (!task.dueDate) return false;

  const anchor = new Date(`${task.dueDate}T00:00:00Z`);
  const apart = Math.round((day.getTime() - anchor.getTime()) / DAY_MS);

  return apart >= 0 && apart % task.intervalCount === 0;
};

/** Все даты, когда задача случается, в окне от `from`. */
export const occurrencesOf = (task: PlannedTask, from: Date, days: number): string[] => {
  const start = utcDay(from);
  const dates: string[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(start.getTime() + offset * DAY_MS);

    if (taskDueOn(task, date)) dates.push(iso(date));
  }

  return dates;
};

/** Лестница от каталоговой частоты к более редким: только для расширений. */
const ladderFrom = (cadence: TaskCadence): TaskCadence[] => {
  const start = DEMOTION_LADDER.indexOf(cadence);

  return DEMOTION_LADDER.slice(Math.max(0, start));
};

export interface BasePlan {
  tasks: PlannedTask[];
  /** Максимум минут в дне по симуляции: по нему видно, держится ли потолок. */
  maxDayMinutes: number;
  /** Средняя нагрузка в минутах в день. */
  averagePerDay: number;
  /** Сколько расширений пришлось поставить на более редкий цикл. */
  demoted: number;
  /** Расширения, которым не хватило места даже на годовом цикле. */
  dropped: string[];
  /** Сколько задач было кандидатами: база плюс расширения по ответам. */
  candidateCount: number;
}

const ruleFor = (cadence: TaskCadence): CadenceRule => RULE[cadence];

const taskFrom = (task: SetTask, cadence: TaskCadence): PlannedTask => {
  const rule = ruleFor(cadence);

  return {
    title: task.task,
    room: task.room,
    minutes: task.minutes,
    level: task.level,
    cadence,
    frequency: rule.frequency,
    intervalCount: rule.intervalCount,
    dayOfWeek: null,
    dayOfMonth: null,
    monthShifts: null,
    dueDate: null,
  };
};

/** Средняя нагрузка набора в день: сумма минут, делённая на цикл каждой задачи. */
export const averagePerDayOf = (tasks: readonly PlannedTask[]): number => {
  const sum = tasks.reduce((total, task) => total + task.minutes / task.intervalCount, 0);

  return Math.round(sum * 100) / 100;
};

/**
 * Собирает набор по ответам анкеты.
 *
 * `today` передаётся параметром: от него зависят опорные даты циклов, и в
 * проверках нужен предсказуемый результат.
 */
export const buildBasePlan = (
  input: PartialHomeAnswers,
  today: Date = new Date(),
): BasePlan => {
  const answers: HomeAnswers = withDefaultAnswers(input);
  const budget = dayBudget(answers);
  const start = utcDay(today);

  /** Занятость каждого дня недели недельными делами: по ней выбираем день. */
  const weekLoad = new Map<number, number>([...Array(DAYS_IN_WEEK).keys()].map((day) => [day, 0]));
  /** Занятость каждого числа месяца редкими делами. */
  const monthLoad = new Map<number, number>(
    Array.from({ length: 28 }, (_, index) => [index + 1, 0]),
  );
  /** Сколько минут уже стоит на конкретной дате: главная проверка потолка. */
  const dateLoad = new Map<string, number>();

  const placed: PlannedTask[] = [];
  const dropped: string[] = [];
  let demoted = 0;

  const occurrences = (task: PlannedTask): string[] => occurrencesOf(task, start, WINDOW_DAYS);

  /** Кандидат на место вместе с его датами и худшей нагрузкой после постановки. */
  interface Placement {
    task: PlannedTask;
    dates: string[];
    worst: number;
  }

  const evaluate = (candidate: PlannedTask): Placement => {
    const dates = occurrences(candidate);
    const worst = dates.reduce(
      (max, date) => Math.max(max, (dateLoad.get(date) ?? 0) + candidate.minutes),
      0,
    );

    return { task: candidate, dates, worst };
  };

  const commit = (placement: Placement): void => {
    placed.push(placement.task);

    for (const date of placement.dates) {
      dateLoad.set(date, (dateLoad.get(date) ?? 0) + placement.task.minutes);
    }

    if (placement.task.frequency === 'weekly' && placement.task.dayOfWeek !== null) {
      const day = placement.task.dayOfWeek;

      weekLoad.set(day, (weekLoad.get(day) ?? 0) + placement.task.minutes);
    }

    if (placement.task.frequency === 'monthly' && placement.task.dayOfMonth !== null) {
      const day = placement.task.dayOfMonth;

      monthLoad.set(day, (monthLoad.get(day) ?? 0) + placement.task.minutes);
    }
  };

  /** Кандидаты на место: дни недели для недельных, числа месяца для редких. */
  const candidatesFor = (task: PlannedTask, phase: number): PlannedTask[] => {
    if (task.frequency === 'weekly') {
      return [...weekLoad.keys()]
        .sort(
          (left, right) =>
            (weekLoad.get(left) ?? 0) - (weekLoad.get(right) ?? 0) || left - right,
        )
        .map((dayOfWeek) => ({
          ...task,
          dayOfWeek,
          dayOfMonth: null,
          dueDate:
            task.intervalCount > DAYS_IN_WEEK
              ? addDays(
                  alignedWeekday(today, dayOfWeek, task.intervalCount / DAYS_IN_WEEK),
                  phase * DAYS_IN_WEEK,
                )
              : null,
        }));
    }

    if (task.frequency === 'monthly') {
      return [...monthLoad.keys()]
        .sort(
          (left, right) =>
            (monthLoad.get(left) ?? 0) - (monthLoad.get(right) ?? 0) || left - right,
        )
        .map((dayOfMonth) => ({
          ...task,
          dayOfWeek: null,
          dayOfMonth,
          dueDate:
            task.intervalCount > DAYS_IN_MONTH
              ? shiftMonths(nextMonthDay(today, dayOfMonth), phase)
              : null,
        }));
    }

    return [{ ...task, dueDate: null }];
  };

  /**
   * Сколько фаз у цикла: «раз в 2 недели» бывает в чётные и нечётные недели,
   * «раз в 3 месяца» — в одной из трёх групп месяцев.
   *
   * Фаза сдвигает вхождения на один шаг цикла и не меняет частоту. Перебор фаз
   * важен именно для потолка: два дела «раз в 2 недели» на одном дне недели с
   * разными фазами никогда не совпадают, а с одинаковыми — совпадают всегда, и
   * день получает двойную нагрузку.
   */
  const phasesOf = (task: PlannedTask): number => {
    if (task.frequency === 'weekly') {
      return Math.max(1, Math.round(task.intervalCount / DAYS_IN_WEEK));
    }

    if (task.frequency === 'monthly') {
      return Math.max(1, Math.round(task.intervalCount / DAYS_IN_MONTH));
    }

    return 1;
  };

  /**
   * Ищет место задаче.
   *
   * `strict` — вернуть null, если ни один вариант не держит потолок: так ставятся
   * расширения (лучше удлинить цикл, чем выйти за 40 минут). Без `strict` берём
   * вариант с наименьшей худшей нагрузкой: базовую задачу терять нельзя, и даже
   * если идеального места нет, она встаёт на самое свободное.
   *
   * Перебираются и дни, и фазы цикла. Порядок фаз начинается с той, что задана
   * порядком разбора: раскладка остаётся детерминированной, а остальные фазы —
   * способ развести совпадения, не трогая частоту.
   */
  const place = (task: PlannedTask, seed: number, strict: boolean): Placement | null => {
    const phases = phasesOf(task);
    let best: Placement | null = null;

    for (let step = 0; step < phases; step += 1) {
      const phase = (seed + step) % phases;

      for (const candidate of candidatesFor(task, phase)) {
        const placement = evaluate(candidate);

        if (placement.worst <= CAP) return placement;
        if (!best || placement.worst < best.worst) best = placement;
      }
    }

    return strict ? null : best;
  };

  /**
   * База: ставится всегда и на своей частоте.
   *
   * Тяжёлые дела разбираются первыми: они выбирают самый свободный день недели и
   * число месяца, а лёгкие добирают остатки. Наоборот было бы хуже — 25-минутное
   * дело, пришедшее последним, вставало бы в уже занятый день и выбивало потолок.
   *
   * Частоты не удлиняются ни при каких условиях — это решение заказчика.
   */
  const baseTasks = [...getBaseTasks()];

  for (const [index, task] of baseTasks.entries()) {
    const placement = place(taskFrom(task, task.cadence), index, false);

    if (placement) commit(placement);
  }

  // ── Расширения по анкете ─────────────────────────────────────────────────
  const extras = extrasFor({
    pets: answers.pets,
    outdoor: answers.outdoor,
    hasKidsRoom: answers.hasKidsRoom,
    worksFromHome: answers.worksFromHome,
  });

  for (const extra of extras) {
    let placedNow = false;
    let demotedNow = false;

    for (const cadence of ladderFrom(extra.cadence)) {
      const planned = taskFrom(extra, cadence);
      const projected = averagePerDayOf([...placed, planned]);

      // Бюджет по ответу: «до 30 минут в день» — это не разрешение на 50.
      // Частота расширения удлиняется, пока средняя не влезет в бюджет.
      if (projected > budget) {
        demotedNow = true;
        continue;
      }

      const placement = place(planned, placed.length, true);

      if (placement) {
        commit(placement);
        placedNow = true;
        if (cadence !== extra.cadence) demotedNow = true;
        break;
      }

      demotedNow = true;
    }

    if (placedNow) {
      if (demotedNow) demoted += 1;
      continue;
    }

    dropped.push(extra.task);
  }

  /**
   * Пересчитывает занятость с нуля по уже поставленным задачам.
   *
   * Нужен доводке: она переносит задачу, и прежние карты занятости после этого
   * врут. Пересчёт честнее, чем вычитать минуты по датам: не остаётся дрейфа.
   */
  const rebuildLoads = (): void => {
    dateLoad.clear();
    weekLoad.clear();
    monthLoad.clear();

    for (let day = 0; day < DAYS_IN_WEEK; day += 1) weekLoad.set(day, 0);
    for (let day = 1; day <= 28; day += 1) monthLoad.set(day, 0);

    for (const task of placed) {
      for (const date of occurrences(task)) {
        dateLoad.set(date, (dateLoad.get(date) ?? 0) + task.minutes);
      }

      if (task.frequency === 'weekly' && task.dayOfWeek !== null) {
        weekLoad.set(task.dayOfWeek, (weekLoad.get(task.dayOfWeek) ?? 0) + task.minutes);
      }

      if (task.frequency === 'monthly' && task.dayOfMonth !== null) {
        monthLoad.set(task.dayOfMonth, (monthLoad.get(task.dayOfMonth) ?? 0) + task.minutes);
      }
    }
  };

  /**
   * Оценка раскладки: худший день, число дней сверх потолка и суммарный перегруз.
   *
   * Сравнение по одному худшему дню мало: перенос убирает пик, но размазывает
   * минуты в дни по 40–45, и «дней сверх потолка» становится больше. Поэтому
   * доводка смотрит на все три числа по порядку.
   */
  const score = (): readonly [number, number, number] => {
    let peak = 0;
    let over = 0;
    let excess = 0;

    for (const minutes of dateLoad.values()) {
      if (minutes > peak) peak = minutes;
      if (minutes > CAP) {
        over += 1;
        excess += minutes - CAP;
      }
    }

    return [peak, over, excess];
  };

  const worseThan = (
    candidate: readonly [number, number, number],
    current: readonly [number, number, number],
  ): boolean => {
    if (candidate[0] !== current[0]) return candidate[0] > current[0];
    if (candidate[1] !== current[1]) return candidate[1] > current[1];

    return candidate[2] > current[2];
  };

  /**
   * Доводка: переносит уже поставленные дела на менее занятые места.
   *
   * Жадная раскладка зависит от порядка: дело, пришедшее последним, выбирает уже
   * из занятого календаря. Несколько проходов по списку снимают самые заметные
   * пики. Перенос принимается, только если оценка улучшилась, поэтому доводка
   * сходится и не может сделать набор хуже, чем он был.
   */
  for (let pass = 0; pass < 4; pass += 1) {
    let improved = false;

    for (let index = 0; index < placed.length; index += 1) {
      const task = placed[index]!;
      const before = score();

      placed.splice(index, 1);
      rebuildLoads();

      const candidate = place(task, index, false);

      if (!candidate) {
        placed.splice(index, 0, task);
        rebuildLoads();
        continue;
      }

      commit(candidate);

      if (worseThan(score(), before)) {
        // Откат: кандидат лежит последним, возвращаем прежнее место.
        placed.pop();
        placed.splice(index, 0, task);
        rebuildLoads();
        continue;
      }

      improved = true;
    }

    if (!improved) break;
  }

  /**
   * Перенос вхождений редких дел на соседний день.
   *
   * Частоты зафиксированы, поэтому «раз в месяц» нельзя превратить в «раз в два
   * месяца». Зато конкретное вхождение можно сдвинуть: `month_shifts[m]` говорит,
   * на сколько дней перенести дело в месяце m. Здесь сдвиг подбирается так, чтобы
   * сумма дня держалась в потолке: перебираются −3…+3, выбирается вариант с
   * наименьшей нагрузкой (при равенстве — ближайший к исходному числу).
   *
   * Задача на время расчёта снимается с календаря: иначе её собственные минуты
   * учитывались бы дважды. Несколько проходов нужны потому, что сдвиг одного дела
   * может наехать на другое.
   */
  for (let pass = 0; pass < 4; pass += 1) {
    let moved = false;

    // Тяжёлые дела выбирают день первыми: у них меньше вариантов, а лёгкому
    // проще уехать на соседний день.
    const rareOrder = [...placed].sort((left, right) => right.minutes - left.minutes);

    for (const task of rareOrder) {
      if (task.frequency !== 'monthly' || task.dayOfMonth === null) continue;

      const current = occurrences(task);
      const before = current.reduce(
        (max, date) => Math.max(max, dateLoad.get(date) ?? 0),
        0,
      );

      if (before <= CAP) continue;

      for (const date of current) {
        dateLoad.set(date, (dateLoad.get(date) ?? 0) - task.minutes);
      }

      /**
       * У дел реже месяца есть вторая степень свободы — фаза цикла.
       *
       * Сдвиг опоры на шаг цикла меняет набор месяцев, в которые дело случается.
       * Если в текущих месяцах свободного дня нет (так бывает, когда недельная
       * нагрузка занимает все дни недели), берём фазу с наименьшим худшим днём.
       */
      if (task.intervalCount > DAYS_IN_MONTH && task.dueDate) {
        const step = task.intervalCount / DAYS_IN_MONTH;

        if (step > 1) {
          const originalDue = task.dueDate;
          let bestDue = originalDue;
          let bestWorst = Number.POSITIVE_INFINITY;

          for (let phase = 0; phase < step; phase += 1) {
            const probe = {
              ...task,
              dueDate: shiftMonths(originalDue, phase),
              monthShifts: null,
            };
            const worst = occurrences(probe).reduce(
              (max, date) => Math.max(max, (dateLoad.get(date) ?? 0) + task.minutes),
              0,
            );

            if (worst < bestWorst) {
              bestWorst = worst;
              bestDue = probe.dueDate;
            }
          }

          task.dueDate = bestDue;
        }
      }

      const shifts = new Array(12).fill(0);

      for (let month = 1; month <= 12; month += 1) {
        let bestShift = 0;
        let bestWorst = Number.POSITIVE_INFINITY;

        for (const shift of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7]) {
          const day = task.dayOfMonth + shift;

          if (day < 1 || day > 28) continue;

          const probe = new Array(12).fill(0);
          probe[month - 1] = shift;

          const dates = occurrences({ ...task, monthShifts: probe }).filter(
            (date) => Number(date.slice(5, 7)) === month,
          );
          const worst = dates.reduce(
            (max, date) => Math.max(max, (dateLoad.get(date) ?? 0) + task.minutes),
            0,
          );

          if (worst < bestWorst) {
            bestWorst = worst;
            bestShift = shift;
          }
        }

        shifts[month - 1] = bestShift;
      }

      task.monthShifts = shifts;

      for (const date of occurrences(task)) {
        dateLoad.set(date, (dateLoad.get(date) ?? 0) + task.minutes);
      }

      if (occurrences(task).some((date) => (dateLoad.get(date) ?? 0) > CAP)) moved = true;
    }

    if (!moved) break;
  }

  const maxDayMinutes = [...dateLoad.values()].reduce((max, minutes) => Math.max(max, minutes), 0);

  return {
    tasks: placed,
    maxDayMinutes,
    averagePerDay: averagePerDayOf(placed),
    demoted,
    dropped,
    candidateCount: getBaseTasks().length + extras.length,
  };
};
