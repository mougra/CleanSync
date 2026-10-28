import express, { type Request, type Response } from 'express';
import { appToday, parseAppDay } from '../services/appTime';
import { buildBasePlan, taskDueOn, type PlannedTask } from '../services/basePlan';
import { catalogCadence, catalogTitle, catalogZone } from '../services/catalogLocale';
import { resolveContentLocale } from '../services/contentLocale';

/**
 * План дня без аккаунта: тот же базовый набор, что получит зарегистрированный.
 *
 * Зачем публичный маршрут. Базовый набор курируемый (`services/taskSets.ts`), он
 * одинаков для всех, поэтому его можно показать гостю без базы и без записи:
 * человек сразу видит, что приложение ему предложит, а не читает обещание.
 *
 * Сборка кэшируется по дню: опорные даты циклов зависят от дня сборки, а в
 * пределах дня ответ один и тот же. Кэш живёт в памяти процесса — набор
 * статичен, и держать его в базе незачем.
 */
const router = express.Router();

/** Кэш собранного набора на день: сборка гоняет симуляцию на 400 дней. */
const planCache = new Map<string, readonly PlannedTask[]>();

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const planFor = (anchor: string): readonly PlannedTask[] => {
  const cached = planCache.get(anchor);

  if (cached) return cached;

  const today = parseAppDay(anchor) ?? new Date(`${anchor}T00:00:00Z`);
  const plan = buildBasePlan({}, today);
  planCache.set(anchor, plan.tasks);

  // Кэш не должен расти: держим только последние десять дней сборки.
  if (planCache.size > 10) {
    const oldest = planCache.keys().next().value;

    if (oldest !== undefined) planCache.delete(oldest);
  }

  return plan.tasks;
};

/**
 * GET /api/plan/today?date=YYYY-MM-DD — дела базового набора на конкретный день.
 *
 * День приходит параметром, потому что «сегодня» у человека в своём поясе;
 * без параметра берём день приложения. Некорректная дата — 400, а не пустой
 * список: пустой список выглядел бы как «на сегодня дел нет».
 */
router.get('/today', (req: Request, res: Response) => {
  const requested = typeof req.query.date === 'string' ? req.query.date : '';
  const anchor = appToday();
  const date = requested || anchor;

  if (!DATE_ONLY.test(date) || parseAppDay(date) === null) {
    res.status(400).json({ error: 'date must be a valid date in YYYY-MM-DD format' });
    return;
  }

  try {
    const tasks = planFor(anchor).filter((task) => taskDueOn(task, parseAppDay(date)!));
    const locale = resolveContentLocale(req);

    res.json({
      date,
      tasks: tasks.map((task) => ({
        title: catalogTitle(task.title, locale),
        room: catalogZone(task.room, locale),
        minutes: task.minutes,
        level: task.level,
        cadence: task.cadence,
        // Подпись периодичности — с сервера: карточка показывает её той же
        // строкой, что и «Мои задачи», а не собирает из кода ещё раз.
        cadenceLabel: catalogCadence(task.cadence, locale),
      })),
      summary: {
        tasks: tasks.length,
        minutes: tasks.reduce((sum, task) => sum + task.minutes, 0),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build the default plan' });
  }
});

export default router;
