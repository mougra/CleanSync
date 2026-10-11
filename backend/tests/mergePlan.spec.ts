import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app';
import pool from '../db';
import { generateTokens } from '../auth';
import { DEFAULT_TASKS_SCHEDULE_TITLE, cadenceRule, normalizeTaskTitle } from '../services/defaultTasks';
import { orderWeekDays } from '../services/homePlan';
import { HOME_PLAN_SCHEDULE_TITLE, mergePlanIntoTasks } from '../services/mergePlanIntoTasks';
import { getTaskCatalog, type CatalogTask } from '../services/taskCatalog';

/**
 * Перенос задач недельного плана «План по дому» в набор «Мои задачи» и память об
 * отказах (миграция 0017).
 *
 * Проверяется то, ради чего перенос и делался: единый источник задач. Дублей по
 * названию не появляется, перенесённая задача получает периодичность из каталога,
 * повторный вызов ничего не меняет, а удалённая сгенерированная задача не
 * возвращается при пересборке набора. Своя задача удаляется без следа в отказах,
 * сброс анкеты очищает список отказов.
 *
 * Тесты работают с настоящей базой, как CI и `npm run db:setup`. Если базы нет,
 * весь блок пропускается, а не падает (см. tests/homeProfile.spec.ts).
 */

const dbReady = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch(() => false);

/** Пользователи, заведённые тестами: уходят каскадом вместе с данными. */
const createdUserIds: number[] = [];

const createUser = async (): Promise<{ userId: number; token: string }> => {
  const user = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password)
     VALUES ($1, $2)
     RETURNING id`,
    [
      `merge-plan-spec-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      'test-password-hash',
    ]
  );

  const userId = user.rows[0].id;
  createdUserIds.push(userId);

  return { userId, token: generateTokens(String(userId)).accessToken };
};

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await pool
      .query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds])
      .catch(() => undefined);
  }

  await pool.end();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Анкета «пройдена» на значениях по умолчанию: набор собирается сразу. */
const completeProfile = (token: string) =>
  request(app).put('/api/home-profile').set(auth(token)).send({ complete: true });

const rebuildPlan = (token: string) =>
  request(app).post('/api/home-profile/plan').set(auth(token)).send({});

const scheduleId = async (userId: number, title: string): Promise<number | null> => {
  const result = await pool.query<{ id: number }>(
    'SELECT id FROM schedules WHERE user_id = $1 AND title = $2 ORDER BY id LIMIT 1',
    [userId, title]
  );

  return result.rows[0]?.id ?? null;
};

interface TaskRow {
  id: number;
  title: string;
  schedule_id: number;
  frequency: string | null;
  interval_count: number;
  day_of_week: number | null;
  day_of_month: number | null;
  due_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  source: string | null;
  estimated_minutes: number;
}

const myTasks = async (userId: number): Promise<TaskRow[]> => {
  const id = await scheduleId(userId, DEFAULT_TASKS_SCHEDULE_TITLE);

  if (id === null) return [];

  const result = await pool.query<TaskRow>(
    `SELECT id, title, schedule_id, frequency, interval_count, day_of_week, day_of_month,
            due_date::text AS due_date, is_completed, completed_at::text AS completed_at,
            source, estimated_minutes
       FROM tasks WHERE schedule_id = $1 ORDER BY id`,
    [id]
  );

  return result.rows;
};

/** Задача каталога с нужной периодичностью, которой нет в наборе пользователя. */
const catalogTaskNotIn = (
  cadence: CatalogTask['cadence'],
  taken: ReadonlySet<string>
): CatalogTask => {
  const found = getTaskCatalog().find(
    (task) => task.cadence === cadence && !taken.has(normalizeTaskTitle(task.task))
  );

  if (!found) throw new Error(`В каталоге нет задачи с периодичностью ${cadence}`);

  return found;
};

/**
 * Ручное расписание «План по дому» — так выглядит состояние пользователя,
 * который прошёл анкету до отказа от недельного плана.
 */
const createLegacyPlan = async (
  userId: number,
  tasks: Array<{ title: string; minutes?: number; completed?: boolean; dueDate?: string | null }>
): Promise<number> => {
  const schedule = await pool.query<{ id: number }>(
    `INSERT INTO schedules (user_id, title, description)
     VALUES ($1, $2, 'Недельный план из прошлой версии приложения')
     RETURNING id`,
    [userId, HOME_PLAN_SCHEDULE_TITLE]
  );

  const planId = schedule.rows[0].id;

  for (const task of tasks) {
    await pool.query(
      `INSERT INTO tasks
         (schedule_id, title, room, estimated_minutes, frequency, day_of_week, due_date,
          source, is_completed, completed_at)
       VALUES ($1, $2, 'Кухня', $3, 'weekly', 1, $4, 'home_plan', $5, $6)`,
      [
        planId,
        task.title,
        task.minutes ?? 10,
        task.dueDate ?? null,
        task.completed ?? false,
        task.completed ? new Date() : null,
      ]
    );
  }

  return planId;
};

const dismissedTitles = async (userId: number): Promise<string[]> => {
  const result = await pool.query<{ title: string }>(
    'SELECT title FROM dismissed_default_tasks WHERE user_id = $1 ORDER BY title',
    [userId]
  );

  return result.rows.map((row) => row.title);
};

describe.skipIf(!dbReady)('mergePlanIntoTasks: перенос задач недельного плана', () => {
  it('переносит задачу без дубля и с периодичностью из каталога, расписание удаляет', async () => {
    const user = await createUser();
    expect((await completeProfile(user.token)).status).toBe(200);

    const before = await myTasks(user.userId);
    expect(before.length).toBeGreaterThan(0);

    const taken = new Set(before.map((task) => normalizeTaskTitle(task.title)));
    const duplicate = before[0].title;
    const weekly = catalogTaskNotIn('weekly', taken);
    taken.add(normalizeTaskTitle(weekly.task));
    const quarterly = catalogTaskNotIn('quarterly', taken);

    await createLegacyPlan(user.userId, [
      { title: duplicate, minutes: before[0].estimated_minutes },
      { title: weekly.task, minutes: weekly.minutes },
      { title: quarterly.task, minutes: quarterly.minutes },
    ]);

    const report = await mergePlanIntoTasks(String(user.userId));

    // Дубль не переносится (задача уже есть в наборе), две новые — переносятся.
    expect(report.moved).toBe(2);
    expect(report.duplicates).toBe(1);
    expect(report.planDeleted).toBe(true);
    expect(report.remaining).toBe(0);
    expect(await scheduleId(user.userId, HOME_PLAN_SCHEDULE_TITLE)).toBeNull();

    const after = await myTasks(user.userId);

    // Дубля по названию не появилось: задача ровно одна.
    expect(after.filter((task) => task.title === duplicate)).toHaveLength(1);
    expect(after).toHaveLength(before.length + 2);

    const movedWeekly = after.find((task) => task.title === weekly.task);
    const weeklyRule = cadenceRule('weekly');
    // День недели — первый из выбранных дней уборки: их порядок задаёт
    // orderWeekDays, как и в самом наборе.
    const cleaningDays = await pool.query<{ cleaning_days: number[] }>(
      'SELECT cleaning_days FROM home_profiles WHERE user_id = $1',
      [user.userId]
    );
    const expectedWeekday = orderWeekDays(cleaningDays.rows[0].cleaning_days)[0];

    expect(movedWeekly?.frequency).toBe(weeklyRule.frequency);
    expect(movedWeekly?.interval_count).toBe(weeklyRule.intervalCount);
    expect(movedWeekly?.day_of_week).toBe(expectedWeekday);
    expect(movedWeekly?.source).toBe('home_profile_defaults');
    expect(movedWeekly?.schedule_id).toBe(await scheduleId(user.userId, DEFAULT_TASKS_SCHEDULE_TITLE));

    const movedQuarterly = after.find((task) => task.title === quarterly.task);
    const quarterlyRule = cadenceRule('quarterly');

    expect(movedQuarterly?.frequency).toBe(quarterlyRule.frequency);
    expect(movedQuarterly?.interval_count).toBe(quarterlyRule.intervalCount);
    expect(movedQuarterly?.day_of_month).toBeGreaterThanOrEqual(1);
    expect(movedQuarterly?.day_of_month).toBeLessThanOrEqual(28);
    // У интервала больше единицы обязана быть опора цикла.
    expect(movedQuarterly?.due_date).toBeTruthy();
  });

  it('идемпотентен: повторный вызов ничего не меняет', async () => {
    const user = await createUser();
    await completeProfile(user.token);

    const taken = new Set((await myTasks(user.userId)).map((task) => normalizeTaskTitle(task.title)));
    const extras = [catalogTaskNotIn('weekly', taken), catalogTaskNotIn('monthly', taken)];

    await createLegacyPlan(
      user.userId,
      extras.map((task) => ({ title: task.task, minutes: task.minutes }))
    );

    const first = await mergePlanIntoTasks(String(user.userId));
    const afterFirst = await myTasks(user.userId);

    expect(first.moved).toBe(2);
    expect(first.planDeleted).toBe(true);

    const second = await mergePlanIntoTasks(String(user.userId));
    const afterSecond = await myTasks(user.userId);

    expect(second.planScheduleId).toBeNull();
    expect(second.moved).toBe(0);
    expect(second.duplicates).toBe(0);
    expect(afterSecond.map((task) => task.id)).toEqual(afterFirst.map((task) => task.id));
    expect(afterSecond.map((task) => task.title)).toEqual(afterFirst.map((task) => task.title));
  });

  it('задачу без каталога делает разовой, выполненную переносит с историей', async () => {
    const user = await createUser();
    await completeProfile(user.token);

    const taken = new Set((await myTasks(user.userId)).map((task) => normalizeTaskTitle(task.title)));
    const known = catalogTaskNotIn('weekly', taken);
    const unknownTitle = 'Проверить шкаф в прихожей (нет в каталоге)';
    const completedDue = '2026-01-05';

    await createLegacyPlan(user.userId, [
      { title: unknownTitle, minutes: 9 },
      { title: known.task, minutes: known.minutes, completed: true, dueDate: completedDue },
    ]);

    const report = await mergePlanIntoTasks(String(user.userId));

    expect(report.moved).toBe(2);
    expect(report.completed).toBe(1);
    expect(report.withoutCatalog).toEqual([unknownTitle]);

    const after = await myTasks(user.userId);
    const unknown = after.find((task) => task.title === unknownTitle);
    const completed = after.find((task) => task.title === known.task);

    // Без каталога интервал придумывать нечем: разовая задача на сегодня.
    expect(unknown?.frequency).toBe('once');
    expect(unknown?.interval_count).toBe(1);
    expect(unknown?.due_date).toBe(new Date().toISOString().slice(0, 10));
    expect(unknown?.source).toBe('home_profile_defaults');

    // Выполненная остаётся историей: отметки на месте, повторов у неё нет.
    expect(completed?.is_completed).toBe(true);
    expect(completed?.completed_at).toBeTruthy();
    expect(completed?.frequency).toBe('once');
    expect(completed?.due_date).toBe(completedDue);
  });

  it('расписание плана не создаётся при завершении анкеты', async () => {
    const user = await createUser();
    const completed = await completeProfile(user.token);

    expect(completed.status).toBe(200);
    expect(completed.body.completed).toBe(true);
    expect(await scheduleId(user.userId, HOME_PLAN_SCHEDULE_TITLE)).toBeNull();

    const plan = await rebuildPlan(user.token);

    expect(plan.status).toBe(200);
    expect(plan.body.schedule?.title).toBe(DEFAULT_TASKS_SCHEDULE_TITLE);
    expect(plan.body.summary.totalTasks).toBeGreaterThan(0);
    expect(await scheduleId(user.userId, HOME_PLAN_SCHEDULE_TITLE)).toBeNull();
  });

  it('не возвращает задачу, которую человек удалил, даже если она есть в плане', async () => {
    const user = await createUser();
    await completeProfile(user.token);

    // Человек удаляет сгенерированную задачу — название попадает в отказы.
    const victim = (await myTasks(user.userId))[0];
    await request(app).delete(`/api/tasks/${victim.id}`).set(auth(user.token));

    // Та же задача осталась в старом недельном плане (это была отдельная строка).
    await createLegacyPlan(user.userId, [{ title: victim.title, minutes: victim.estimated_minutes }]);

    const report = await mergePlanIntoTasks(String(user.userId));
    const after = await myTasks(user.userId);

    expect(report.moved).toBe(0);
    expect(report.dismissed).toBe(1);
    expect(report.planDeleted).toBe(true);
    expect(
      after.some((task) => normalizeTaskTitle(task.title) === normalizeTaskTitle(victim.title))
    ).toBe(false);
    expect(await dismissedTitles(user.userId)).toEqual([normalizeTaskTitle(victim.title)]);
  });
});

describe.skipIf(!dbReady)('память об отказах: удалённое не возвращается', () => {
  it('удалённая сгенерированная задача не возвращается при пересборке', async () => {
    const user = await createUser();
    await completeProfile(user.token);

    const before = await myTasks(user.userId);
    const victim = before[0];

    const deleted = await request(app)
      .delete(`/api/tasks/${victim.id}`)
      .set(auth(user.token));

    expect(deleted.status).toBe(200);
    expect(deleted.body.dismissed).toBe(true);
    expect(await dismissedTitles(user.userId)).toEqual([normalizeTaskTitle(victim.title)]);

    // Пересборка набора (removeStale) не должна вернуть удалённое дело.
    const rebuilt = await rebuildPlan(user.token);
    const after = await myTasks(user.userId);

    expect(rebuilt.status).toBe(200);
    expect(after.some((task) => normalizeTaskTitle(task.title) === normalizeTaskTitle(victim.title))).toBe(
      false
    );
    // Название попало в набор-кандидат, но было пропущено из-за отказа.
    expect(rebuilt.body.myTasks?.dismissed).toBeGreaterThan(0);
  });

  it('свою задачу человек удаляет без следа в отказах', async () => {
    const user = await createUser();
    await completeProfile(user.token);

    const mySchedule = await scheduleId(user.userId, DEFAULT_TASKS_SCHEDULE_TITLE);

    /**
     * Задачу, созданную руками, кладём прямо в базу: `source` у неё пустой, как
     * и у всего, что человек завёл сам (маршрут POST /api/tasks источник не
     * проставляет). Дальше проверяется именно удаление через API.
     */
    const created = await pool.query<{ id: number }>(
      `INSERT INTO tasks (schedule_id, title, frequency, day_of_week, estimated_minutes, source)
       VALUES ($1, $2, 'weekly', 2, 5, NULL)
       RETURNING id`,
      [mySchedule, 'Своя задача, не из каталога']
    );

    const deleted = await request(app)
      .delete(`/api/tasks/${created.rows[0].id}`)
      .set(auth(user.token));

    expect(deleted.status).toBe(200);
    expect(deleted.body.dismissed).toBe(false);
    expect(await dismissedTitles(user.userId)).toEqual([]);

    // Пересборка не воскрешает и не удаляет чужое: свою задачу набор не знает.
    await rebuildPlan(user.token);
    expect(await dismissedTitles(user.userId)).toEqual([]);
  });

  it('сброс анкеты очищает отказы, и задача снова может быть предложена', async () => {
    const user = await createUser();
    await completeProfile(user.token);

    const victim = (await myTasks(user.userId))[0];

    await request(app).delete(`/api/tasks/${victim.id}`).set(auth(user.token));
    expect(await dismissedTitles(user.userId)).toHaveLength(1);

    const reset = await request(app).delete('/api/home-profile').set(auth(user.token));

    expect(reset.status).toBe(200);
    expect(reset.body.dismissedCleared).toBe(1);
    expect(await dismissedTitles(user.userId)).toEqual([]);

    // Анкета пройдена заново — набор собирается с нуля, и удалённое дело снова
    // в нём: прежние отказы больше не действуют.
    await completeProfile(user.token);
    const after = await myTasks(user.userId);

    expect(
      after.some((task) => normalizeTaskTitle(task.title) === normalizeTaskTitle(victim.title))
    ).toBe(true);
  });
});
