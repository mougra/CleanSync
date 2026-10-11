/**
 * Живая проверка дневного бюджета сгенерированных задач: API на :5000.
 *
 * Заводит временного пользователя, проходит анкету с ответом «минимум, 20-30
 * минут в день» (under30 → бюджет 25 минут), смотрит «Сегодня» и ближайшую
 * неделю, затем добавляет свою задачу на 40 минут и убеждается, что она видна
 * сверх лимита, а сгенерированный набор не изменился. Пользователя удаляет за
 * собой.
 */
import dotenv from 'dotenv';
import pool from '../db';

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

/**
 * Сгенерированные задачи — те, что лежат в расписаниях генераторов.
 *
 * `/api/tasks/upcoming` не отдаёт `source`, поэтому признак — заголовок
 * расписания. Сейчас сервер создаёт только «Мои задачи»; «План по дому» остаётся
 * в списке на случай строк, которые ещё не перенесены разовым скриптом
 * (scripts/merge-plan-into-mine.ts). Свои задачи проверка кладёт в отдельное
 * расписание «Свои дела».
 */
const GENERATED_SCHEDULES = new Set(['Мои задачи', 'План по дому']);

const isGenerated = (task: any): boolean =>
  GENERATED_SCHEDULES.has(String(task.schedule_title));

const minutes = (tasks: any[]): number =>
  tasks.reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0);

const main = async () => {
  const email = `budget-check-${runId}@example.com`;
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

  // ── Анкета: «минимум, 20-30 минут в день» (under30 → бюджет 25) ──────────
  const profile = await call('PUT', '/home-profile', token, {
    housingType: 'apartment',
    rooms: '3-4',
    composition: 'partner',
    pets: ['cats'],
    outdoor: 'balcony',
    hasKidsRoom: false,
    hasGarage: false,
    worksFromHome: true,
    drying: 'air',
    cleaningLevel: 'normal',
    dailyMinutes: 'under30',
    cleaningStyle: 'often_small',
    cleaningDays: [1, 3, 6],
    hardestZone: 'kitchen',
    complete: true,
  });

  check(profile.status === 200, `анкета: ${profile.status} ${JSON.stringify(profile.body)}`);
  check(profile.body?.completed === true, 'анкета не отмечена пройденной');
  check(profile.body?.profile?.dailyMinutes === 'under30', 'ответ dailyMinutes не сохранился');
  console.log(
    `Анкета сохранена: dailyMinutes=${profile.body?.profile?.dailyMinutes}, «Мои задачи»: created=${profile.body?.myTasks?.created}, maxDailyMinutes=${profile.body?.myTasks?.maxDailyMinutes}`
  );

  const plan = await call('POST', '/home-profile/plan', token);

  check(plan.status === 200, `POST /plan: ${plan.status} ${JSON.stringify(plan.body)}`);
  console.log(
    `\nПлан собран: бюджет в ответе ${plan.body?.summary?.dailyBudget}, дней ${plan.body?.summary?.activeDays}, задач ${plan.body?.summary?.totalTasks}`
  );

  for (const day of plan.body?.days ?? []) {
    if (!day.selected) continue;

    console.log(
      `  ${DAY_LABELS[day.dayOfWeek]}: план ${day.totalMinutes} мин — ${day.tasks.map((task: any) => `${task.estimatedMinutes}м ${task.title}`).join(' | ')}`
    );
  }

  check(
    plan.body?.summary?.dailyBudget === 25,
    `бюджет плана ${plan.body?.summary?.dailyBudget}, ожидалось 25 для under30`
  );

  // ── Сколько сгенерированного попадает на дни ─────────────────────────────
  const upcomingBefore = await call('GET', '/tasks/upcoming?days=7', token);
  const todayBefore = await call('GET', '/tasks/today', token);

  check(upcomingBefore.status === 200, `upcoming: ${upcomingBefore.status}`);
  check(todayBefore.status === 200, `today: ${todayBefore.status}`);

  const todayGenerated = Object.values(todayBefore.body?.tasks ?? {})
    .flat()
    .filter(isGenerated) as any[];
  const todayCustom = Object.values(todayBefore.body?.tasks ?? {})
    .flat()
    .filter((task: any) => !isGenerated(task)) as any[];

  console.log(
    `\nСегодня (${new Date().toISOString().slice(0, 10)}): сгенерировано ${minutes(todayGenerated)} мин (${todayGenerated.length} задач), своих ${todayCustom.length}`
  );
  check(
    minutes(todayGenerated) <= 25,
    `«Сегодня»: сгенерировано ${minutes(todayGenerated)} мин при бюджете 25`
  );

  const perDayBefore = new Map<string, { generated: number; custom: number; generatedIds: Set<number> }>();

  for (const day of upcomingBefore.body?.days ?? []) {
    const generated = (day.tasks as any[]).filter(isGenerated);
    const custom = (day.tasks as any[]).filter((task: any) => !isGenerated(task));

    perDayBefore.set(day.date, {
      generated: minutes(generated),
      custom: minutes(custom),
      generatedIds: new Set(generated.map((task: any) => Number(task.id))),
    });

    console.log(
      `  ${day.date} ${DAY_LABELS[day.weekday]}: сгенерировано ${minutes(generated)} мин (${generated.length} задач), своих ${custom.length} — ${generated
        .map((task: any) => `${task.estimated_minutes}м`)
        .join('+') || '—'} | ${generated.map((task: any) => task.schedule_title).join(', ')}`
    );

    check(
      minutes(generated) <= 25,
      `${day.date}: сгенерировано ${minutes(generated)} мин при бюджете 25`
    );
  }

  // ── Своя задача на 40 минут: сверх бюджета, набор не меняется ────────────
  const schedule = await call('POST', '/schedules', token, { title: 'Свои дела' });

  check(schedule.status === 201, `POST /schedules: ${schedule.status}`);
  const scheduleId = schedule.body?.id;

  const ownTask = await call('POST', '/tasks', token, {
    schedule_id: scheduleId,
    title: 'Своя задача на 40 минут',
    frequency: 'daily',
    day_of_week: null,
    estimated_minutes: 40,
    room: 'Гостиная',
  });

  check(ownTask.status === 201, `POST /tasks: ${ownTask.status} ${JSON.stringify(ownTask.body)}`);
  console.log(
    `\nДобавлена своя задача #${ownTask.body?.id} на ${ownTask.body?.estimated_minutes} мин (source=${JSON.stringify(ownTask.body?.source ?? null)})`
  );

  const upcomingAfter = await call('GET', '/tasks/upcoming?days=7', token);
  const todayAfter = await call('GET', '/tasks/today', token);

  const todayGeneratedAfter = Object.values(todayAfter.body?.tasks ?? {})
    .flat()
    .filter(isGenerated) as any[];
  const todayCustomAfter = Object.values(todayAfter.body?.tasks ?? {})
    .flat()
    .filter((task: any) => !isGenerated(task)) as any[];

  console.log(
    `Сегодня после своей задачи: сгенерировано ${minutes(todayGeneratedAfter)} мин, своих ${minutes(todayCustomAfter)} мин (${todayCustomAfter.length} задач)`
  );

  check(
    minutes(todayGeneratedAfter) === minutes(todayGenerated),
    `сгенерированный набор «Сегодня» изменился: ${minutes(todayGenerated)} → ${minutes(todayGeneratedAfter)}`
  );
  check(
    todayCustomAfter.some((task: any) => Number(task.id) === Number(ownTask.body?.id)),
    'своя задача не видна в «Сегодня»'
  );
  check(
    minutes(todayCustomAfter) >= 40,
    `свои задачи дают ${minutes(todayCustomAfter)} мин, ожидалось не меньше 40`
  );

  for (const day of upcomingAfter.body?.days ?? []) {
    const generated = (day.tasks as any[]).filter(isGenerated);
    const custom = (day.tasks as any[]).filter((task: any) => !isGenerated(task));
    const before = perDayBefore.get(day.date);
    const afterIds = new Set(generated.map((task: any) => Number(task.id)));
    const sameSet =
      before !== undefined &&
      before.generatedIds.size === afterIds.size &&
      [...before.generatedIds].every((id) => afterIds.has(id));

    console.log(
      `  ${day.date} ${DAY_LABELS[day.weekday]}: сгенерировано ${minutes(generated)} мин, своих ${minutes(custom)} мин — набор ${sameSet ? 'не изменился' : 'ИЗМЕНИЛСЯ'}`
    );

    check(
      minutes(generated) <= 25,
      `${day.date}: после своей задачи сгенерировано ${minutes(generated)} мин при бюджете 25`
    );
    check(sameSet, `${day.date}: сгенерированный набор изменился после добавления своей задачи`);
    check(
      minutes(custom) >= 40,
      `${day.date}: своя задача на 40 минут не видна (${minutes(custom)} мин)`
    );
  }

  // Сумма «сгенерированное + своё» законно больше бюджета: бюджет считает
  // только генерацию, свои задачи добавляются сверх и ничего не скрывают.
  const todayTotal = minutes(todayGeneratedAfter) + minutes(todayCustomAfter);

  console.log(
    `\nИтог по «Сегодня»: сгенерировано ${minutes(todayGeneratedAfter)} ≤ 25, плюс своя задача ${minutes(todayCustomAfter)} = ${todayTotal} мин`
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
