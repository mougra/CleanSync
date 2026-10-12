/**
 * Живая проверка результата дня и ротации списка: API на :5000.
 *
 * Проверяются обе жалобы заказчика на живом сервере:
 *  1. «Закрытые сегодня задачи видны закрытыми и в другие дни» — отмечаем
 *     сгенерированное дело сегодня и убеждаемся, что в календаре оно закрыто
 *     ровно сегодня, а вчера и завтра открыто; снятие отметки возвращает день в
 *     исходное состояние.
 *  2. «На другие дни почти тот же список, и кухни всегда 3» — сравниваем списки
 *     дней уборки (понедельник, среда, суббота) и считаем зоны: наборы обязаны
 *     отличаться, а одной зоны в дне — не больше MAX_ZONE_TASKS_PER_DAY.
 *
 * Заводит временного пользователя, проходит анкету, собирает набор и удаляет
 * пользователя за собой (вместе с ним каскадом уходят расписания и задачи).
 *
 * Запуск: `npx tsx scripts/check-day-results-live.ts` (сервер должен быть поднят
 * с тем же кодом, что и проверка, иначе проверяются старые правила).
 */
import dotenv from 'dotenv';
import pool from '../db';
import { MAX_ZONE_TASKS_PER_DAY } from '../services/defaultTasks';

dotenv.config();

const API = process.env.API_URL ?? 'http://127.0.0.1:5000/api';
const runId = Date.now().toString(36);
const createdUserIds: number[] = [];

interface ApiResult {
  status: number;
  body: any;
}

const call = async (
  method: string,
  path: string,
  token?: string,
  payload?: unknown
): Promise<ApiResult> => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  const text = await response.text();
  let body: any = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { status: response.status, body };
};

const problems: string[] = [];

const check = (condition: boolean, message: string) => {
  if (!condition) problems.push(message);
};

const DAY_LABELS: Record<number, string> = {
  0: 'Вс',
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC-полночь сегодняшнего дня: тем же днём считает и сервер (`tasksDueOn`). */
const utcToday = (): Date => {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const iso = (date: Date): string => date.toISOString().slice(0, 10);

const dayOf = (offset: number): Date => new Date(utcToday().getTime() + offset * DAY_MS);

/** Ближайший день недели на сегодня или позже: для Пн/Ср/Сб хватает недели вперёд. */
const nextWeekday = (dayOfWeek: number): Date => {
  const base = utcToday();
  base.setUTCDate(base.getUTCDate() + ((dayOfWeek - base.getUTCDay() + 7) % 7));

  return base;
};

const main = async () => {
  const email = `day-result-check-${runId}@example.com`;
  const password = 'CheckPass123!';

  const registered = await call('POST', '/auth/register', undefined, {
    email,
    password,
    acceptTerms: true,
  });

  check(
    registered.status === 201 || registered.status === 200,
    `register: ${registered.status} ${JSON.stringify(registered.body)}`
  );

  const login = await call('POST', '/auth/login', undefined, { email, password });

  check(login.status === 200 && Boolean(login.body?.accessToken), `login: ${login.status}`);

  const token = login.body.accessToken as string;
  const me = await call('GET', '/auth/me', token);
  const userId = Number(me.body?.user?.id ?? me.body?.id);

  createdUserIds.push(userId);

  console.log(`Пользователь #${userId} (${email})`);

  // ── Анкета: три дня уборки (Пн, Ср, Сб) ───────────────────────────────────
  const profile = await call('PUT', '/home-profile', token, {
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
    complete: true,
  });

  check(profile.status === 200, `анкета: ${profile.status} ${JSON.stringify(profile.body)}`);
  console.log(
    `Анкета пройдена: дней уборки ${JSON.stringify(profile.body?.profile?.cleaningDays)}, «Мои задачи»: создано ${profile.body?.myTasks?.created}`
  );

  const plan = await call('POST', '/home-profile/plan', token);
  check(plan.status === 200, `POST /plan: ${plan.status} ${JSON.stringify(plan.body)}`);

  // ── 1. Результат дня: отметка не переезжает на другие дни ─────────────────
  const today = await call('GET', '/tasks/today', token);

  check(today.status === 200, `GET /tasks/today: ${today.status}`);

  const todayTasks = Object.values(today.body?.tasks ?? {}).flat() as any[];
  /**
   * Для проверки «отметка не переезжает на другие дни» нужно **повторяющееся**
   * дело: разовое живёт только в своей дате, и «завтра» его в календаре просто
   * нет. Первое в списке брать нельзя — порядок задач в дне задаёт `time`, а у
   * сгенерированных дел времени нет.
   */
  const victim =
    todayTasks.find((task) => task.frequency === 'daily') ??
    todayTasks.find((task) => task.frequency === 'weekly') ??
    todayTasks[0];

  check(Boolean(victim), 'в «Сегодня» не оказалось ни одной задачи');

  if (!victim) {
    return;
  }

  console.log(
    `\nОтмечаем сегодня: #${victim.id} «${victim.title}» (${victim.frequency}, ${victim.estimated_minutes} мин, ${victim.room})`
  );

  const marked = await call('PUT', `/tasks/${victim.id}`, token, { is_completed: true });

  check(marked.status === 200, `PUT /tasks/${victim.id}: ${marked.status} ${JSON.stringify(marked.body)}`);
  check(marked.body?.is_completed === true, 'отметка не сохранилась в ответе PUT');

  const range = `from=${iso(dayOf(-1))}&to=${iso(dayOf(1))}`;
  const calendar = await call('GET', `/tasks/calendar?${range}`, token);

  check(calendar.status === 200, `GET /tasks/calendar: ${calendar.status}`);

  const days: any[] = calendar.body?.days ?? [];
  const dayOfIso = (date: string) => days.find((day) => day.date === date);
  const taskOn = (date: string, id: number) =>
    dayOfIso(date)?.tasks?.find((task: any) => Number(task.id) === Number(id));

  check(
    taskOn(iso(dayOf(0)), victim.id)?.is_completed === true,
    `сегодня задача #${victim.id} не отмечена закрытой`
  );
  check(
    taskOn(iso(dayOf(1)), victim.id)?.is_completed === false,
    `завтра задача #${victim.id} видна закрытой — старый баг`
  );
  check(
    taskOn(iso(dayOf(-1)), victim.id)?.is_completed === false,
    `вчера задача #${victim.id} видна закрытой`
  );

  console.log(
    `Календарь: вчера ${dayOfIso(iso(dayOf(-1)))?.completed_tasks} закрыто, сегодня ${dayOfIso(iso(dayOf(0)))?.completed_tasks}, завтра ${dayOfIso(iso(dayOf(1)))?.completed_tasks}`
  );

  // Разовое дело на сегодня: сделанное однажды, оно остаётся сделанным.
  const schedules = await call('GET', '/schedules', token);
  const ownScheduleId = (schedules.body ?? [])[0]?.id;

  if (ownScheduleId) {
    const onceTask = await call('POST', '/tasks', token, {
      schedule_id: ownScheduleId,
      title: `Разовое дело проверки ${runId}`,
      frequency: 'once',
      due_date: iso(dayOf(0)),
      estimated_minutes: 5,
      room: 'Гостиная',
    });

    const onceMarked = await call('PUT', `/tasks/${onceTask.body?.id}`, token, {
      is_completed: true,
    });

    const onceCalendar = await call('GET', `/tasks/calendar?${range}`, token);
    const onceToday = onceCalendar.body?.days
      ?.find((day: any) => day.date === iso(dayOf(0)))
      ?.tasks?.find((task: any) => Number(task.id) === Number(onceTask.body?.id));

    check(onceMarked.status === 200, `PUT разового дела: ${onceMarked.status}`);
    check(onceToday?.is_completed === true, 'разовое дело сегодня не видно сделанным');
  }

  // Снятие отметки: сегодняшний день снова открыт.
  const unmarked = await call('PUT', `/tasks/${victim.id}`, token, { is_completed: false });
  const afterUnmark = await call('GET', `/tasks/calendar?${range}`, token);
  const todayAfter = afterUnmark.body?.days
    ?.find((day: any) => day.date === iso(dayOf(0)))
    ?.tasks?.find((task: any) => Number(task.id) === Number(victim.id));

  check(unmarked.status === 200, `PUT со снятием: ${unmarked.status}`);
  check(todayAfter?.is_completed === false, 'после снятия отметки дело осталось закрытым');

  // Отмечаем снова: дальше проверяем уже отмеченное состояние.
  await call('PUT', `/tasks/${victim.id}`, token, { is_completed: true });

  // ── 2. Списки дней отличаются, и одна зона не доминирует ──────────────────
  const from = iso(dayOf(-1));
  const to = iso(dayOf(12));
  const week = await call('GET', `/tasks/calendar?from=${from}&to=${to}`, token);

  check(week.status === 200, `календарь на две недели: ${week.status}`);

  const weekDays: any[] = week.body?.days ?? [];
  const lists = new Map<number, Set<string>>();

  for (const dayOfWeek of [1, 3, 6]) {
    const target = nextWeekday(dayOfWeek);
    const day = weekDays.find((item) => item.date === iso(target));

    if (!day) {
      problems.push(`в календаре нет дня ${iso(target)} (${DAY_LABELS[dayOfWeek]})`);
      continue;
    }

    lists.set(dayOfWeek, new Set(day.tasks.map((task: any) => task.title)));

    const byRoom = new Map<string, number>();

    for (const task of day.tasks) {
      byRoom.set(task.room ?? '—', (byRoom.get(task.room ?? '—') ?? 0) + 1);
    }

    for (const [room, count] of byRoom) {
      check(
        count <= MAX_ZONE_TASKS_PER_DAY,
        `${DAY_LABELS[dayOfWeek]} (${day.date}): ${count} задач зоны «${room}» при пределе ${MAX_ZONE_TASKS_PER_DAY}`
      );
    }

    console.log(
      `\n${DAY_LABELS[dayOfWeek]} (${day.date}): ${day.total_minutes} мин — ${day.tasks
        .map((task: any) => `${task.estimated_minutes}м [${task.room}] ${task.title}`)
        .join(' | ')}`
    );
  }

  const monday = lists.get(1) ?? new Set<string>();
  const wednesday = lists.get(3) ?? new Set<string>();
  const saturday = lists.get(6) ?? new Set<string>();

  const same = (left: Set<string>, right: Set<string>) =>
    left.size === right.size && [...left].every((title) => right.has(title));

  check(!same(monday, wednesday), 'Пн и Ср: наборы задач совпали');
  check(!same(monday, saturday), 'Пн и Сб: наборы задач совпали');
  check(!same(wednesday, saturday), 'Ср и Сб: наборы задач совпали');

  // ── 3. Прежние колонки задачи продолжают обновляться ─────────────────────
  const legacy = await pool.query<{ is_completed: boolean; completed_at: string | null; completed_by: number | null }>(
    'SELECT is_completed, completed_at::text AS completed_at, completed_by FROM tasks WHERE id = $1',
    [victim.id]
  );

  check(legacy.rows[0]?.is_completed === true, 'tasks.is_completed не обновился отметкой');
  check(legacy.rows[0]?.completed_at !== null, 'tasks.completed_at не обновился отметкой');
  check(
    String(legacy.rows[0]?.completed_by) === String(userId),
    'tasks.completed_by не обновился отметкой'
  );

  const journal = await pool.query<{ completed_on: string }>(
    'SELECT completed_on::text AS completed_on FROM task_completions WHERE task_id = $1 ORDER BY completed_on',
    [victim.id]
  );

  console.log(
    `\nЖурнал задачи #${victim.id}: отметки ${journal.rows.map((row) => row.completed_on).join(', ') || '—'}; прежние колонки: is_completed=${legacy.rows[0]?.is_completed}, completed_by=${legacy.rows[0]?.completed_by}`
  );
};

const cleanup = async () => {
  if (createdUserIds.length === 0) return;

  await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds]);

  const left = await pool.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM users WHERE id = ANY($1::int[])',
    [createdUserIds]
  );

  console.log(`\nУдалено тестовых пользователей: ${createdUserIds.length} (осталось ${left.rows[0].total})`);
};

main()
  .then(async () => {
    await cleanup();

    if (problems.length > 0) {
      console.log(`\nПРОБЛЕМЫ (${problems.length}):`);
      for (const problem of problems) console.log(`  - ${problem}`);
      process.exitCode = 1;
    } else {
      console.log('\nВсе проверки пройдены');
    }

    await pool.end();
  })
  .catch(async (err) => {
    console.error('Проверка упала:', err);
    await cleanup().catch(() => undefined);
    await pool.end();
    process.exitCode = 1;
  });
