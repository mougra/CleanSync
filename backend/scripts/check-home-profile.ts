/**
 * Живая проверка мастера «Настройка по дому»: API + генератор плана.
 *
 * Запускается вручную (`npx tsx scripts/check-home-profile.ts`), заводит
 * временных пользователей через API, прогоняет несколько наборов ответов,
 * проверяет инварианты плана и удаляет тестовые данные за собой.
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

const call = async (method: string, path: string, token?: string, payload?: unknown): Promise<ApiResult> => {
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

const createUser = async (label: string): Promise<{ id: number; token: string }> => {
  const email = `home-check-${label}-${runId}@example.com`;
  const password = 'CheckPass123!';

  const registered = await call('POST', '/auth/register', undefined, {
    email,
    password,
    acceptTerms: true,
  });

  if (registered.status !== 201 && registered.status !== 200) {
    throw new Error(`register ${label}: ${registered.status} ${JSON.stringify(registered.body)}`);
  }

  const login = await call('POST', '/auth/login', undefined, { email, password });

  if (login.status !== 200 || !login.body?.accessToken) {
    throw new Error(`login ${label}: ${login.status} ${JSON.stringify(login.body)}`);
  }

  const who = await call('GET', '/auth/me', login.body.accessToken);
  const id = who.body?.user?.id ?? who.body?.id;

  createdUserIds.push(Number(id));

  return { id: Number(id), token: login.body.accessToken as string };
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

const printPlan = (title: string, result: ApiResult) => {
  if (result.status !== 200) {
    console.log(`${title}: ОШИБКА ${result.status} ${JSON.stringify(result.body)}`);
    problems.push(`${title}: план не сгенерирован (${result.status})`);
    return;
  }

  const { schedule, days, summary, focusZone, level } = result.body;

  console.log(`\n=== ${title} ===`);
  console.log(
    `schedule #${schedule.id} «${schedule.title}», уровень ${level}, фокус: ${focusZone ?? 'нет'}, дней ${summary.activeDays}`
  );
  console.log(
    `итого: задач ${summary.totalTasks}, минут ${summary.totalMinutes}, среднее в день ${summary.minutesPerDay}, бюджет ${summary.dailyBudget}`
  );
  console.log(`зоны: ${summary.rooms.join(', ')}`);
  console.log(`теги: ${summary.tags.join(', ') || '—'}`);
  if (summary.notes?.length) console.log(`примечания: ${summary.notes.join(' | ')}`);

  for (const day of days) {
    if (!day.selected) {
      console.log(`${DAY_LABELS[day.dayOfWeek]} — выходной`);
      continue;
    }

    console.log(`${DAY_LABELS[day.dayOfWeek]} (${day.totalMinutes} мин, ${day.totalTasks} задач):`);
    for (const task of day.tasks) {
      console.log(
        `   ${task.position}. #${task.id} ${task.title} — ${task.room}, ${task.estimatedMinutes} мин [${task.level}]`
      );
    }
  }

  return result.body;
};

const verifyPlan = (title: string, plan: any, options: { budget: number; level: string }) => {
  const budget = plan.summary.dailyBudget;
  const active = plan.days.filter((day: any) => day.selected);

  check(active.length > 0, `${title}: нет ни одного дня с задачами`);

  for (const day of active) {
    // Дневной бюджет — жёсткое обещание: ни один день не должен его превышать.
    check(
      day.totalMinutes <= budget,
      `${title}: день ${DAY_LABELS[day.dayOfWeek]} — ${day.totalMinutes} мин при бюджете ${budget}`
    );

    const titles = day.tasks.map((task: any) => task.title);
    check(
      new Set(titles).size === titles.length,
      `${title}: в дне ${day.dayOfWeek} есть повтор задачи`
    );
  }

  // Никакая задача не стоит два дня подряд
  for (let index = 1; index < active.length; index += 1) {
    const previous = new Set(active[index - 1].tasks.map((task: any) => task.title));
    const current = active[index].tasks.map((task: any) => task.title);
    const overlapping = current.filter((task: string) => previous.has(task));

    check(
      overlapping.length === 0,
      `${title}: повтор два дня подряд (${DAY_LABELS[active[index - 1].dayOfWeek]} → ${DAY_LABELS[active[index].dayOfWeek]}): ${overlapping.join(', ')}`
    );
  }

  if (options.level === 'light') {
    check(
      plan.days.every((day: any) => day.tasks.every((task: any) => task.level === 'light')),
      `${title}: в лёгком плане есть задачи выше light`
    );
  }

  if (options.level === 'normal') {
    check(
      plan.days.every((day: any) => day.tasks.every((task: any) => task.level !== 'deep')),
      `${title}: в обычном плане есть глубокие задачи`
    );
  }
};

const main = async () => {
  // ── 1. Пустой профиль и валидация ────────────────────────────────────────
  const first = await createUser('main');

  const empty = await call('GET', '/home-profile', first.token);
  check(empty.status === 200 && empty.body.profile === null, `пустой профиль: ${JSON.stringify(empty.body)}`);
  check(empty.body?.completed === false, 'пустой профиль: completed должен быть false');
  console.log(`Пустой профиль: ${JSON.stringify(empty.body)}`);

  const invalid = await call('PUT', '/home-profile', first.token, { housingType: 'castle' });
  check(invalid.status === 400, `невалидное значение принято: ${invalid.status}`);
  console.log(`Валидация «castle»: ${invalid.status} ${JSON.stringify(invalid.body)}`);

  const invalidDays = await call('PUT', '/home-profile', first.token, { cleaningDays: [0, 9] });
  check(invalidDays.status === 400, `невалидные дни приняты: ${invalidDays.status}`);
  console.log(`Валидация дня 9: ${invalidDays.status} ${JSON.stringify(invalidDays.body)}`);

  const planBefore = await call('POST', '/home-profile/plan', first.token);
  check(planBefore.status === 400, `план без анкеты: ${planBefore.status}`);
  console.log(`План без анкеты: ${planBefore.status} ${JSON.stringify(planBefore.body)}`);

  // ── 2. Пошаговое сохранение ──────────────────────────────────────────────
  const step1 = await call('PUT', '/home-profile', first.token, { housingType: 'studio' });
  check(step1.status === 200, `шаг 1: ${step1.status}`);
  check(step1.body?.profile?.housingType === 'studio', 'шаг 1: ответ не сохранён');
  check(step1.body?.completed === false, 'шаг 1: completed должен быть false');
  console.log(`\nШаг 1 сохранён частично: ${JSON.stringify(step1.body.profile)}`);

  const step2 = await call('PUT', '/home-profile', first.token, { pets: ['cats'] });
  check(step2.status === 200, `шаг 2: ${step2.status}`);
  check(step2.body?.profile?.housingType === 'studio', 'шаг 2: предыдущий ответ потерялся');
  check(step2.body?.profile?.pets?.[0] === 'cats', 'шаг 2: питомцы не сохранены');
  console.log(`Шаг 2 дописан, шаг 1 цел: ${JSON.stringify(step2.body.profile)}`);

  const complete = await call('PUT', '/home-profile', first.token, {
    rooms: '1-2',
    composition: 'alone',
    outdoor: 'none',
    hasKidsRoom: false,
    hasGarage: false,
    worksFromHome: false,
    drying: 'air',
    cleaningLevel: 'deep',
    dailyMinutes: 'under30',
    cleaningStyle: 'often_small',
    cleaningDays: [1, 3, 6],
    hardestZone: 'kitchen',
  });
  check(complete.status === 200, `полная анкета: ${complete.status}`);
  check(complete.body?.completed === true, 'анкета заполнена, но completed=false');
  console.log(`\nАнкета заполнена, completed=${complete.body.completed}`);

  // ── 3. Сценарий из задания ───────────────────────────────────────────────
  const scenarioA = await call('POST', '/home-profile/plan', first.token);
  const planA = printPlan(
    'Сценарий A: студия, кошки, глубокая, <30 мин, понемногу но часто, 3 дня, труднее всего кухня',
    scenarioA
  );
  if (planA) verifyPlan('A', planA, { budget: 25, level: 'deep' });

  // Идемпотентность: повторный вызов не должен плодить расписания
  const schedulesBefore = await pool.query(
    `SELECT COUNT(*)::int AS total FROM schedules WHERE user_id = $1 AND title = 'План по дому'`,
    [first.id]
  );
  const secondCall = await call('POST', '/home-profile/plan', first.token);
  const schedulesAfter = await pool.query(
    `SELECT COUNT(*)::int AS total FROM schedules WHERE user_id = $1 AND title = 'План по дому'`,
    [first.id]
  );
  const tasksAfter = await pool.query(
    `SELECT COUNT(*)::int AS total FROM tasks t
       JOIN schedules s ON s.id = t.schedule_id
      WHERE s.user_id = $1 AND s.title = 'План по дому'`,
    [first.id]
  );

  check(
    schedulesBefore.rows[0].total === 1 && schedulesAfter.rows[0].total === 1,
    `идемпотентность: расписаний стало ${schedulesAfter.rows[0].total}`
  );
  check(
    tasksAfter.rows[0].total === secondCall.body?.summary?.totalTasks,
    `идемпотентность: задач в БД ${tasksAfter.rows[0].total}, в ответе ${secondCall.body?.summary?.totalTasks}`
  );
  console.log(
    `\nИдемпотентность: расписаний до ${schedulesBefore.rows[0].total}, после ${schedulesAfter.rows[0].total}, задач в БД ${tasksAfter.rows[0].total} (в ответе ${secondCall.body?.summary?.totalTasks})`
  );

  const weeklyRows = await pool.query(
    `SELECT day_of_week, frequency, COUNT(*)::int AS total
       FROM tasks t JOIN schedules s ON s.id = t.schedule_id
      WHERE s.user_id = $1 AND s.title = 'План по дому'
      GROUP BY day_of_week, frequency ORDER BY day_of_week`,
    [first.id]
  );
  console.log('Задачи в БД по дням:', JSON.stringify(weeklyRows.rows));

  // ── 4. Второй сценарий: дом с двором, гаражом, детской и офисом ──────────
  const second = await createUser('house');
  await call('PUT', '/home-profile', second.token, {
    housingType: 'house',
    rooms: '8+',
    composition: 'family_kids',
    pets: ['dogs', 'fish'],
    outdoor: 'yard',
    hasKidsRoom: true,
    hasGarage: true,
    worksFromHome: true,
    drying: 'dryer',
    cleaningLevel: 'deep',
    dailyMinutes: '1to2h',
    cleaningStyle: 'all_at_once',
    cleaningDays: [1, 3, 5, 6, 0],
    hardestZone: 'bathroom',
  });
  const planB = printPlan(
    'Сценарий B: дом 8+ комнат, семья с детьми, собака и рыбки, двор, гараж, детская, офис, сушильная машина, глубокая, 1-2 часа, всё за один подход, 5 дней',
    await call('POST', '/home-profile/plan', second.token)
  );
  if (planB) verifyPlan('B', planB, { budget: 110, level: 'deep' });

  // ── 5. Третий сценарий: лёгкая уборка, сушка на воздухе ─────────────────
  const third = await createUser('light');
  await call('PUT', '/home-profile', third.token, {
    housingType: 'apartment',
    rooms: '3-4',
    composition: 'partner',
    pets: ['none'],
    outdoor: 'balcony',
    hasKidsRoom: false,
    hasGarage: false,
    worksFromHome: true,
    drying: 'air',
    cleaningLevel: 'light',
    dailyMinutes: '30to60',
    cleaningStyle: 'varies',
    cleaningDays: [2, 4],
    hardestZone: 'tidiness',
  });
  const planC = printPlan(
    'Сценарий C: квартира, пара, балкон, офис, сушка на воздухе, лёгкая, 30-60 мин, 2 дня, труднее всего порядок',
    await call('POST', '/home-profile/plan', third.token)
  );
  if (planC) verifyPlan('C', planC, { budget: 55, level: 'light' });

  // Проверки содержимого: теги под ответы
  const allB = planB.days.flatMap((day: any) => day.tasks);
  const allC = planC.days.flatMap((day: any) => day.tasks);

  check(
    allB.some((task: any) => task.tags.includes('kids')),
    'B: нет задач по детской'
  );
  check(
    allB.some((task: any) => task.tags.includes('garage')),
    'B: нет задач по гаражу'
  );
  check(
    allB.some((task: any) => task.tags.includes('yard')),
    'B: нет задач по двору'
  );
  check(
    allB.some((task: any) => task.tags.includes('office')),
    'B: нет задач по домашнему офису'
  );
  check(
    allB.some((task: any) => task.tags.includes('pets')),
    'B: нет задач про питомцев'
  );
  check(
    allB.some((task: any) => task.tags.includes('dry_machine')),
    'B: при сушильной машине нет задачи про фильтр/загрузку'
  );
  check(
    !allB.some((task: any) => task.tags.includes('dry_air')),
    'B: при сушильной машине попались задачи про сушку на воздухе'
  );
  check(
    allC.every((task: any) => !task.tags.includes('pets')),
    'C: «нет питомцев», но в плане есть задачи про питомцев'
  );
  check(
    allC.some((task: any) => task.tags.includes('balcony')),
    'C: нет задач про балкон'
  );
  check(
    allC.some((task: any) => task.tags.includes('dry_air')),
    'C: при сушке на воздухе нет задачи про развешивание'
  );
  check(
    allC.every((task: any) => task.level === 'light'),
    'C: лёгкий уровень, но есть более тяжёлые задачи'
  );

  // Кухня в сценарии A: фокусная зона должна быть в начале недели
  const kitchenDays = planA.days
    .filter((day: any) => day.selected && day.tasks.some((task: any) => task.room === 'Кухня'))
    .map((day: any) => day.dayOfWeek);
  const activeA = planA.days.filter((day: any) => day.selected).map((day: any) => day.dayOfWeek);
  console.log(`\nСценарий A: дни с кухней ${JSON.stringify(kitchenDays)} из активных ${JSON.stringify(activeA)}`);
  check(
    kitchenDays.length > 0 && kitchenDays[0] === activeA[0],
    `A: кухня (трудная зона) не попала в первый день недели (${JSON.stringify(kitchenDays)} vs ${JSON.stringify(activeA)})`
  );

  // ── 6. Сброс анкеты ─────────────────────────────────────────────────────
  const reset = await call('DELETE', '/home-profile', third.token);
  check(reset.status === 200 && reset.body?.profileReset === true, `DELETE: ${JSON.stringify(reset.body)}`);
  console.log(`\nDELETE: ${JSON.stringify(reset.body)}`);

  const afterReset = await call('GET', '/home-profile', third.token);
  check(afterReset.body?.profile === null, 'после DELETE профиль не пуст');

  const planAfterReset = await call('POST', '/home-profile/plan', third.token);
  check(planAfterReset.status === 400, `после DELETE план собрался: ${planAfterReset.status}`);
  console.log(`После сброса: профиль ${JSON.stringify(afterReset.body)}, план → ${planAfterReset.status}`);

  // После сброса старое расписание не должно висеть
  const leftover = await pool.query(
    `SELECT COUNT(*)::int AS total FROM schedules WHERE user_id = $1 AND title = 'План по дому'`,
    [third.id]
  );
  check(leftover.rows[0].total === 0, 'после DELETE осталось расписание «План по дому»');
  console.log(`Расписаний «План по дому» после сброса: ${leftover.rows[0].total}`);
};

const cleanup = async () => {
  if (createdUserIds.length === 0) return;

  await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds]);
  const left = await pool.query('SELECT COUNT(*)::int AS total FROM users WHERE id = ANY($1::int[])', [
    createdUserIds,
  ]);

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
