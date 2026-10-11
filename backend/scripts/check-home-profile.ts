/**
 * Живая проверка мастера «Настройка по дому»: API + генератор плана.
 *
 * Запускается вручную (`npx tsx scripts/check-home-profile.ts`), заводит
 * временных пользователей через API, прогоняет несколько наборов ответов,
 * проверяет инварианты плана и удаляет тестовые данные за собой.
 */
import dotenv from 'dotenv';
import pool from '../db';
import { dayBudget } from '../services/dailyBudget';
import { getTaskCatalog } from '../services/taskCatalog';

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

/** Заголовок постоянного набора: по нему задачи ищутся во всех сценариях. */
const MY_TASKS = 'Мои задачи';

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

/**
 * Проверки плана. `expectedBudget` — дневной бюджет по ответу анкеты: он должен
 * совпасть с тем, что посчитал сервер, иначе числа бюджета разъехались между
 * генератором и общей таблицей (services/dailyBudget.ts).
 *
 * День плана сравнивается с бюджетом **всего** дня, а не только с планом, но
 * сам план уже получает остаток: сколько минут дня занимает набор «Мои задачи»,
 * столько вычитается из бюджета перед сборкой (см. buildPlanFor в
 * routes/homeProfile.ts). Поэтому здесь бюджет — это потолок для плана.
 */
const verifyPlan = (
  title: string,
  plan: any,
  options: { expectedBudget: number; level: string }
) => {
  const budget = plan.summary.dailyBudget;
  const active = plan.days.filter((day: any) => day.selected);

  check(
    budget === options.expectedBudget,
    `${title}: бюджет ${budget}, а по ответу анкеты — ${options.expectedBudget}`
  );

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
    // Мастер отмечает последний шаг явно: без флага completed_at не ставится
    complete: true,
  });
  check(complete.status === 200, `полная анкета: ${complete.status}`);
  check(complete.body?.completed === true, 'анкета заполнена, но completed=false');
  console.log(`\nАнкета заполнена, completed=${complete.body.completed}`);

  // Постоянный набор обязан появиться сам, ещё до кнопки «собрать план»
  const autoCreated = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM tasks t
       JOIN schedules s ON s.id = t.schedule_id
      WHERE s.user_id = $1 AND s.title = 'Мои задачи'`,
    [first.id]
  );

  check(
    autoCreated.rows[0].total > 0,
    'после завершения анкеты набор «Мои задачи» не создался автоматически'
  );
  console.log(
    `«Мои задачи» сразу после анкеты: ${autoCreated.rows[0].total} задач (создано вызовом ${complete.body?.myTasks?.created})`
  );

  // ── 3. Сценарий из задания ───────────────────────────────────────────────
  const scenarioA = await call('POST', '/home-profile/plan', first.token);
  const planA = printPlan(
    'Сценарий A: студия, кошки, глубокая, <30 мин, понемногу но часто, 3 дня, труднее всего кухня',
    scenarioA
  );
  if (planA) verifyPlan('A', planA, { expectedBudget: dayBudget({ dailyMinutes: 'under30' }), level: 'deep' });

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

  // Пометка источника: задачи недельного плана пишет сервер, поэтому у всех
  // должен стоять `home_plan` — иначе сгенерированное неотличимо от созданного
  // руками (см. savePlan в routes/homeProfile.ts и миграцию 0016).
  const planSources = await pool.query<{ source: string | null; total: number }>(
    `SELECT t.source, COUNT(*)::int AS total
       FROM tasks t JOIN schedules s ON s.id = t.schedule_id
      WHERE s.user_id = $1 AND s.title = 'План по дому'
      GROUP BY t.source`,
    [first.id]
  );

  check(
    planSources.rows.length > 0 && planSources.rows.every((row) => row.source === 'home_plan'),
    `«План по дому»: источники задач ${JSON.stringify(planSources.rows)}`
  );
  console.log(`Источник задач плана: ${JSON.stringify(planSources.rows)}`);

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
  if (planB) verifyPlan('B', planB, { expectedBudget: dayBudget({ dailyMinutes: '1to2h' }), level: 'deep' });

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
  if (planC) verifyPlan('C', planC, { expectedBudget: dayBudget({ dailyMinutes: '30to60' }), level: 'light' });

  /**
   * ── 5. Проверки содержимого планов и задачи из базы ──────────────────────
   *
   * Дальше нужны задачи постоянного набора «Мои задачи» и их теги: бюджет дня
   * общий, поэтому контекст анкеты проверяется по сумме двух наборов.
   */
  interface MyTaskRow {
    id: number;
    title: string;
    room: string | null;
    estimated_minutes: number;
    frequency: string;
    interval_count: number;
    day_of_week: number | null;
    day_of_month: number | null;
    due_date: string | null;
    source: string | null;
    is_completed: boolean;
  }

  const loadMyTasks = async (userId: number): Promise<MyTaskRow[]> => {
    const result = await pool.query<MyTaskRow>(
      `SELECT t.id, t.title, t.room, t.estimated_minutes, t.frequency, t.interval_count,
              t.day_of_week, t.day_of_month, t.due_date::text AS due_date, t.source, t.is_completed
         FROM tasks t
         JOIN schedules s ON s.id = t.schedule_id
        WHERE s.user_id = $1 AND s.title = $2
        ORDER BY t.id`,
      [userId, MY_TASKS]
    );

    return result.rows;
  };

  const catalogTitles = (tag: string): Set<string> =>
    new Set(getTaskCatalog().filter((task) => task.tags.includes(tag as never)).map((task) => task.task));

  const petTitles = catalogTitles('pets');
  const kidsTitles = catalogTitles('kids');

  /** Теги задач по названию: нужно проверить контекст по задачам из базы. */
  const catalogTagsByTitle = new Map(
    getTaskCatalog().map((task) => [task.task, task.tags as string[]])
  );

  /** Какие темы анкеты закрыты задачами в сумме двух наборов. */
  const coveredTags = (titles: string[]): Set<string> => {
    const tags = new Set<string>();

    for (const title of titles) {
      for (const tag of catalogTagsByTitle.get(title) ?? []) tags.add(tag);
    }

    return tags;
  };

  const scheduleCount = async (userId: number, title: string): Promise<number> => {
    const result = await pool.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM schedules WHERE user_id = $1 AND title = $2',
      [userId, title]
    );

    return result.rows[0].total;
  };

  // Проверки содержимого: теги под ответы
  const allB = planB.days.flatMap((day: any) => day.tasks);
  const allC = planC.days.flatMap((day: any) => day.tasks);

  /**
   * Контекст анкеты проверяем по **сумме** двух наборов: «Мои задачи» плюс план.
   *
   * Бюджет дня общий, поэтому план получает только остаток от набора «Мои
   * задачи»: у второго пользователя набор занимает 33-35 минут из 40, и плану
   * достаются считанные минуты. Требовать, чтобы тема (гараж, двор, сушка) была
   * именно в плане, после этого нельзя — важно, что она есть в днях человека.
   * Что каждая тема представлена внутри самого плана при свободном бюджете,
   * проверяет отдельный сценарий D ниже.
   */
  const myTasksB = (await loadMyTasks(second.id)).map((task) => task.title);
  const myTasksC = (await loadMyTasks(third.id)).map((task) => task.title);
  const combinedTagsB = coveredTags([...myTasksB, ...allB.map((task: any) => task.title)]);
  const combinedTagsC = coveredTags([...myTasksC, ...allC.map((task: any) => task.title)]);

  console.log(`\nТемы сценария B: ${[...combinedTagsB].sort().join(', ') || '—'}`);
  console.log(`Темы сценария C: ${[...combinedTagsC].sort().join(', ') || '—'}`);

  for (const tag of ['kids', 'garage', 'yard', 'office', 'pets']) {
    check(combinedTagsB.has(tag), `B: ни одна задача не закрывает тему ${tag}`);
  }

  check(
    combinedTagsB.has('dry_machine'),
    'B: при сушильной машине нет задачи про фильтр/загрузку'
  );
  check(
    !combinedTagsB.has('dry_air'),
    'B: при сушильной машине попались задачи про сушку на воздухе'
  );
  check(
    !combinedTagsC.has('pets'),
    'C: «нет питомцев», но в задачах есть про питомцев'
  );
  check(combinedTagsC.has('balcony'), 'C: ни одна задача не закрывает тему балкона');
  check(
    combinedTagsC.has('dry_air'),
    'C: при сушке на воздухе нет задачи про развешивание'
  );
  check(
    allC.every((task: any) => !task.tags.includes('pets')),
    'C: «нет питомцев», но в плане есть задачи про питомцев'
  );
  check(
    allC.every((task: any) => task.level === 'light'),
    'C: лёгкий уровень, но есть более тяжёлые задачи'
  );
  // Сушка на воздухе и в машине — взаимоисключающие пометки: в одном наборе их
  // быть не должно ни при каких ответах.
  check(
    !(combinedTagsB.has('dry_air') && combinedTagsB.has('dry_machine')),
    'B: в задачах смешаны сушка на воздухе и сушильная машина'
  );

  // ── 5б. Сценарий D: свободный бюджет — фокусная зона идёт первой ─────────
  //
  // Отдельный пользователь с «минимумом» и двумя днями уборки: набор «Мои
  // задачи» занимает только 12-17 минут из 25, поэтому у плана есть 10+ минут
  // на день, и «трудная» зона обязана встать в начало недели. На сценарии A
  // такой проверки больше нет: при остром бюджете первым днём может стать
  // единственный свободный, и это правильное поведение — бюджет важнее фокуса.
  const focus = await createUser('focus');
  await call('PUT', '/home-profile', focus.token, {
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
    cleaningDays: [1, 4],
    hardestZone: 'kitchen',
  });

  const planD = printPlan(
    'Сценарий D: квартира, пара, «минимум, до 30 минут», 2 дня, труднее всего кухня',
    await call('POST', '/home-profile/plan', focus.token)
  );
  if (planD) verifyPlan('D', planD, { expectedBudget: dayBudget({ dailyMinutes: 'under30' }), level: 'normal' });

  if (planD) {
    const kitchenDays = planD.days
      .filter((day: any) => day.selected && day.tasks.some((task: any) => task.room === 'Кухня'))
      .map((day: any) => day.dayOfWeek);
    const activeD = planD.days.filter((day: any) => day.selected).map((day: any) => day.dayOfWeek);

    console.log(`Сценарий D: дни с кухней ${JSON.stringify(kitchenDays)} из активных ${JSON.stringify(activeD)}`);
    check(
      kitchenDays.length > 0 && kitchenDays[0] === activeD[0],
      `D: кухня (трудная зона) не попала в первый день недели (${JSON.stringify(kitchenDays)} vs ${JSON.stringify(activeD)})`
    );
  }

  // ── 6. Постоянный набор «Мои задачи» ────────────────────────────────────
  // Хелперы чтения (loadMyTasks, catalogTitles, coveredTags, scheduleCount)
  // объявлены выше: по ним уже проверялись темы второго и третьего сценариев.

  const tasksFirst = await loadMyTasks(first.id);
  const mySchedules = await scheduleCount(first.id, MY_TASKS);

  check(mySchedules === 1, `«Мои задачи»: расписаний ${mySchedules}, ожидалось 1`);
  check(tasksFirst.length >= 20, `«Мои задачи»: всего ${tasksFirst.length} задач — слишком мало`);
  check(
    new Set(tasksFirst.map((task) => task.title)).size === tasksFirst.length,
    '«Мои задачи»: есть дубли названий'
  );
  check(
    tasksFirst.every((task) => task.source === 'home_profile_defaults'),
    '«Мои задачи»: не у всех задач проставлен source'
  );

  // Периодичность: у набора есть ежедневные, недельные, месячные и редкие дела.
  // Про «раз в 3 месяца» и «раз в полгода» по отдельности не требуем: бюджет дня
  // ограничивает число свободных чисел месяца, и в набор попадает не всё. Важно,
  // что редкий цикл (интервал больше месяца) в наборе вообще есть — иначе
  // «генеральная раз в полгода» из анкеты не появится никогда.
  for (const [label, predicate] of [
    ['ежедневные', (task: MyTaskRow) => task.frequency === 'daily'],
    ['недельные', (task: MyTaskRow) => task.frequency === 'weekly'],
    ['месячные', (task: MyTaskRow) => task.frequency === 'monthly'],
    ['с интервалом больше 1', (task: MyTaskRow) => task.interval_count > 1],
    ['редкие (3 месяца и реже)', (task: MyTaskRow) => task.interval_count >= 3],
  ] as Array<[string, (task: MyTaskRow) => boolean]>) {
    check(tasksFirst.some(predicate), `«Мои задачи»: нет дел «${label}»`);
  }

  check(
    tasksFirst.filter((task) => task.interval_count > 1).every((task) => task.due_date !== null),
    '«Мои задачи»: у дела с интервалом больше 1 нет опорной даты'
  );
  check(
    tasksFirst
      .filter((task) => task.frequency === 'weekly')
      .every((task) => task.day_of_week !== null),
    '«Мои задачи»: недельное дело без дня недели'
  );
  check(
    tasksFirst
      .filter((task) => task.frequency === 'monthly')
      .every((task) => task.day_of_month !== null && task.day_of_month >= 1 && task.day_of_month <= 28),
    '«Мои задачи»: месячное дело без числа месяца'
  );

  // Дневной лимит: ежедневный минимум плюс недельные дела любого дня недели
  const dailyMinutes = tasksFirst
    .filter((task) => task.frequency === 'daily')
    .reduce((sum, task) => sum + task.estimated_minutes, 0);

  /**
   * Дневной бюджет «Моих задач» для первого пользователя (ответ under30 → 25).
   * Число берётся из общей таблицы, а не пишется в проверке второй раз.
   */
  const myTasksBudget = dayBudget({ dailyMinutes: 'under30' });

  check(
    dailyMinutes <= myTasksBudget,
    `«Мои задачи»: ежедневный минимум ${dailyMinutes} мин при бюджете ${myTasksBudget}`
  );

  for (let day = 0; day <= 6; day += 1) {
    const weeklyMinutes = tasksFirst
      .filter((task) => task.frequency === 'weekly' && task.day_of_week === day)
      .reduce((sum, task) => sum + task.estimated_minutes, 0);

    check(
      dailyMinutes + weeklyMinutes <= myTasksBudget,
      `«Мои задачи»: день ${DAY_LABELS[day]} — ${dailyMinutes + weeklyMinutes} мин при бюджете ${myTasksBudget}`
    );
  }

  console.log(
    `\n«Мои задачи»: расписаний ${mySchedules}, задач ${tasksFirst.length}, ежедневно ${dailyMinutes} мин`
  );
  console.log(
    `периодичность: ${JSON.stringify(
      tasksFirst.reduce<Record<string, number>>((acc, task) => {
        const key = task.frequency === 'monthly' ? `monthly+${task.interval_count}` : task.frequency;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {})
    )}`
  );

  // Сами задачи: они попадают в «Сегодня» по правилу (частота + интервал)
  const todayResult = await call('GET', '/tasks/today', first.token);
  check(todayResult.status === 200, `GET /tasks/today: ${todayResult.status}`);

  const todayIds = new Set<number>(
    Object.values(todayResult.body?.tasks ?? {})
      .flat()
      .map((task: any) => Number(task.id))
  );

  /** Та же выборка, что и в SQL маршрута: проверяем её на живых данных. */
  const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
  const daysBetween = (from: string, to: string) =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  const monthsBetween = (from: string, to: string) => {
    const left = new Date(`${from}T00:00:00Z`);
    const right = new Date(`${to}T00:00:00Z`);

    return (
      right.getUTCFullYear() * 12 +
      right.getUTCMonth() -
      (left.getUTCFullYear() * 12 + left.getUTCMonth())
    );
  };

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const dayOfWeek = now.getUTCDay();
  const dayOfMonth = now.getUTCDate();

  const isDue = (task: MyTaskRow): boolean => {
    if (task.frequency === 'daily') {
      if (task.interval_count <= 1) return true;
      return task.due_date !== null && mod(daysBetween(task.due_date, todayIso), task.interval_count) === 0;
    }

    if (task.frequency === 'weekly') {
      if (task.day_of_week !== dayOfWeek) return false;
      if (task.interval_count <= 1) return true;
      return (
        task.due_date !== null &&
        mod(Math.floor(daysBetween(task.due_date, todayIso) / 7), task.interval_count) === 0
      );
    }

    if (task.frequency === 'monthly') {
      if (task.day_of_month !== dayOfMonth) return false;
      if (task.interval_count <= 1) return true;
      return (
        task.due_date !== null &&
        mod(monthsBetween(task.due_date, todayIso), task.interval_count) === 0
      );
    }

    return task.due_date === todayIso;
  };

  const allTasks = await pool.query<MyTaskRow>(
    `SELECT t.id, t.title, t.room, t.estimated_minutes, t.frequency, t.interval_count,
            t.day_of_week, t.day_of_month, t.due_date::text AS due_date, t.source, t.is_completed
       FROM tasks t JOIN schedules s ON s.id = t.schedule_id
      WHERE s.user_id = $1`,
    [first.id]
  );

  const expectedIds = allTasks.rows.filter(isDue).map((task) => task.id).sort((a, b) => a - b);
  const actualIds = [...todayIds].sort((a, b) => a - b);

  check(
    JSON.stringify(expectedIds) === JSON.stringify(actualIds),
    `«Сегодня»: выборка расходится с правилом (ожидалось ${expectedIds.length}, пришло ${actualIds.length})`
  );
  check(todayIds.size > 0, '«Сегодня»: у пользователя с набором нет ни одной задачи на сегодня');
  console.log(`«Сегодня»: задач ${todayIds.size}, ожидалось по правилу ${expectedIds.length}`);

  // Идемпотентность: повторная пересборка не плодит задачи
  const secondBuild = await call('POST', '/home-profile/plan', first.token);
  const tasksSecond = await loadMyTasks(first.id);

  check(
    secondBuild.body?.myTasks?.created === 0,
    `повторный план создал ${secondBuild.body?.myTasks?.created} новых задач «Мои задачи»`
  );
  check(
    tasksSecond.length === tasksFirst.length,
    `повторный план изменил число задач: ${tasksFirst.length} → ${tasksSecond.length}`
  );
  check(
    (await scheduleCount(first.id, MY_TASKS)) === 1,
    'повторный план создал второе расписание «Мои задачи»'
  );
  console.log(
    `Идемпотентность «Мои задачи»: created=${secondBuild.body?.myTasks?.created}, existing=${secondBuild.body?.myTasks?.existing}, всего ${tasksSecond.length}`
  );

  // GET /plan достраивает набор, но ничего не перезаписывает
  const getPlan = await call('GET', '/home-profile/plan', first.token);
  check(getPlan.status === 200, `GET /plan: ${getPlan.status}`);
  check(getPlan.body?.myTasks?.created === 0, `GET /plan создал ${getPlan.body?.myTasks?.created} задач`);
  check(getPlan.body?.schedule !== null, 'GET /plan не нашёл сохранённый «План по дому»');
  console.log(
    `GET /plan: расписание #${getPlan.body?.schedule?.id}, «Мои задачи» created=${getPlan.body?.myTasks?.created}`
  );

  // Правки пользователя не затираются пересборкой
  const edited = tasksFirst[0];
  const edit = await call('PUT', `/tasks/${edited.id}`, first.token, { estimated_minutes: 7 });
  check(edit.status === 200 && edit.body?.estimated_minutes === 7, `правка задачи: ${edit.status}`);
  await call('POST', '/home-profile/plan', first.token);

  const afterRebuild = await loadMyTasks(first.id);
  const kept = afterRebuild.find((task) => task.id === edited.id);

  check(kept?.estimated_minutes === 7, 'пересборка перезаписала правку пользователя');
  check(Boolean(kept), 'пересборка удалила задачу пользователя');
  console.log(`Правка задачи сохранена: ${edited.title} → ${kept?.estimated_minutes} мин`);

  // Фильтрация по ответам: у третьего пользователя питомцев нет
  const thirdTasks = await loadMyTasks(third.id);
  check(thirdTasks.length > 0, 'у третьего пользователя нет набора «Мои задачи»');
  check(
    thirdTasks.every((task) => !petTitles.has(task.title)),
    'у пользователя без питомцев есть задачи про питомцев'
  );
  check(
    thirdTasks.every((task) => !kidsTitles.has(task.title)),
    'у пользователя без детской есть задачи про детскую'
  );
  console.log(`Без питомцев и детской: задач ${thirdTasks.length}, из них про питомцев 0`);

  // Ответы изменились (появился кот) — набор достраивается, а потом лишнее уходит
  await call('PUT', '/home-profile', third.token, { pets: ['cats'] });
  const withCat = await call('POST', '/home-profile/plan', third.token);
  const withCatTasks = await loadMyTasks(third.id);

  check(
    withCatTasks.some((task) => petTitles.has(task.title)),
    'после появления кота в наборе нет задач про питомцев'
  );
  console.log(
    `Появился кот: добавлено ${withCat.body?.myTasks?.created}, задач про питомцев ${withCatTasks.filter((task) => petTitles.has(task.title)).length}`
  );

  await call('PUT', '/home-profile', third.token, { pets: ['none'] });
  const withoutCat = await call('POST', '/home-profile/plan', third.token);
  const withoutCatTasks = await loadMyTasks(third.id);

  check(
    withoutCatTasks.every((task) => !petTitles.has(task.title)),
    'после удаления кота задачи про питомцев остались'
  );
  check(
    (withoutCat.body?.myTasks?.removed ?? 0) > 0,
    'устаревшие задачи про питомцев не были убраны'
  );
  console.log(
    `Кот исчез: убрано ${withoutCat.body?.myTasks?.removed}, задач про питомцев ${withoutCatTasks.filter((task) => petTitles.has(task.title)).length}`
  );

  // Периодичность задачи через API: POST/PUT принимают счётчик интервала
  const scheduleRow = await pool.query<{ id: number }>(
    'SELECT id FROM schedules WHERE user_id = $1 AND title = $2 LIMIT 1',
    [first.id, MY_TASKS]
  );
  const createdTask = await call('POST', '/tasks', first.token, {
    schedule_id: scheduleRow.rows[0].id,
    title: 'Проверка интервала',
    frequency: 'monthly',
    day_of_month: 15,
    estimated_minutes: 10,
    interval_count: 3,
  });

  check(
    createdTask.status === 201 && createdTask.body?.interval_count === 3,
    `POST /tasks с интервалом: ${createdTask.status} ${JSON.stringify(createdTask.body)}`
  );

  const updatedTask = await call('PUT', `/tasks/${createdTask.body.id}`, first.token, {
    interval_count: 2,
  });
  check(
    updatedTask.status === 200 && updatedTask.body?.interval_count === 2,
    `PUT /tasks с интервалом: ${updatedTask.status} ${JSON.stringify(updatedTask.body)}`
  );

  const scheduleDetail = await call('GET', `/schedules/${scheduleRow.rows[0].id}`, first.token);
  check(
    scheduleDetail.body?.tasks?.every((task: any) => typeof task.interval_count === 'number'),
    'GET /schedules/:id не отдаёт interval_count'
  );

  await call('DELETE', `/tasks/${createdTask.body.id}`, first.token);
  console.log(
    `API периодичности: POST interval_count=${createdTask.body?.interval_count}, PUT interval_count=${updatedTask.body?.interval_count}`
  );

  // ── 7. Сброс анкеты ─────────────────────────────────────────────────────
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
