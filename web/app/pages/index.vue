<script setup lang="ts">
/**
 * Главная «Сегодня» по макетам docs/design/mockups/main page 1-2.
 *
 * Публичные данные (шаблоны чек-листов, справочник достижений, список челленджей)
 * приходят во время серверного рендера. Персональные (активный челлендж, план дня,
 * заработанные достижения) — только для вошедшего: авторизация на httpOnly-cookie.
 */

import type { AchievementProgress } from '~/types/achievement';
import type { ChallengeProgress } from '~/types/challenge';
import type { TaskFrequency } from '~/types/checklist';
import type { StatsPeriod } from '~/types/stats';
import type {
  CalendarDay,
  CalendarResponse,
  CalendarTask,
  DeleteTaskResponse,
  TaskCreateInput,
  TaskEditInput,
  TaskRepeat,
  TaskRepeatUnit,
  TodayPlan,
  TodayPlanTask,
} from '~/types/task';
import { isGeneratedTask } from '~/types/task';

interface SeasonalTemplate {
  title: string;
  desc: string;
  steps: string[];
}

interface ChecklistTemplate {
  title: string;
  items: { id: number; text: string; done: boolean }[];
}

interface TemplatesResponse {
  seasonal: SeasonalTemplate[];
  checklist: ChecklistTemplate[];
}

const { t, locale } = useI18n();
const { zoneLabel } = useZoneLabel();
const localePath = useLocalePath();
const auth = useAuthStore();
const api = useApi();

/** Шторка «Добавить задачу» — та же, что открывает круглая кнопка в углу. */
const { openSheet: openTaskSheet } = useTaskSheet();

/** Анкета «Настройка по дому»: пока она не пройдена, пустой план предлагает её пройти. */
const { completed: homeProfileDone } = await useHomeProfile();

const { actives, current, seasonChallenge, seasonGuestProgress, guestCompletedSlug } =
  await useChallenges();

/**
 * Режим отпуска читаем из состояния серии: ключ кэша общий с карточкой серии,
 * поэтому второго запроса не будет, а блок на главной обновится тем же ответом.
 */
const { streak: streakState, setVacation } = await useStreak();

const vacationActive = computed(() => streakState.value?.vacation.active === true);
const vacationBusy = ref(false);

/** Выход из отпуска прямо с главной: та же операция, что и переключатель в настройках. */
const endVacationNow = async () => {
  if (vacationBusy.value) return;

  vacationBusy.value = true;
  try {
    await setVacation(false);
  } finally {
    vacationBusy.value = false;
  }
};

// Привычки: тот же composable, что и на вкладке «Привычки», ключи общие —
// отметка на главной сразу видна и там.
const { habits, dueToday, doneToday, refreshMine: refreshHabits } = await useHabits();
const { intervalLabel, categoryLabel } = useHabitLabels();
const habitBusy = ref<number | null>(null);

const { data: templates, error: templatesError } = await useAsyncData(
  'templates',
  () => api.request<TemplatesResponse>('/api/templates'),
  { default: () => ({ seasonal: [], checklist: [] }) },
);

// Достижения: прогресс по каждому — из общего composable (тот же ключ, что
// на экране достижений), гостю показываем справочник без прогресса.
const { catalog: achievementsCatalog, progress: achievementsProgress, earned: achievementsEarned, total: achievementsTotal } =
  await useAchievements();
const { show: showAchievements } = useAchievementToast();

const { data: today } = await useAsyncData('today-plan', () =>
  auth.isAuthenticated ? api.request<TodayPlan>('/api/tasks/today') : Promise.resolve(null),
);

/**
 * Выбранный в календаре день — тот же ключ состояния, что ставит `WeekStrip`
 * в раскладке: клик по числу меняет его, а карточка плана перечитывает день.
 */
const selectedDate = useState<string>('selected-date', () => toISODate(new Date()));

/**
 * Сегодняшний день — **по часам устройства**.
 *
 * Раньше «сегодня» считалось в поясе приложения (`APP_TIME_ZONE`, Москва), как
 * на сервере, и это расходилось с календарём: полоса недели выбирает дату из
 * браузера, а карточка плана сравнивала её с московской. После местной полуночи
 * человек видел выбранным сегодняшний день, а подпись говорила «завтра».
 *
 * Теперь источник один — устройство. Сервер узнаёт этот же день заголовком
 * `X-Client-Date` (composables/useApi.ts) и считает отметки по нему.
 */
const localToday = () => toISODate(new Date());

/** Выбран сегодняшний день: по нему решаем, показывать ли подпись «сегодня». */
const isToday = computed(() => selectedDate.value === localToday());

/** День не загрузился: показываем строку ошибки, а не пустой список. */
const dayFailed = ref(false);

/**
 * План выбранного дня: `GET /api/tasks/calendar` отдаёт день с задачами и
 * итогами. Ключ `calendar-day` общий с другими экранами (`AppFab`, `useTaskUndo`),
 * поэтому после отметки или удаления задачи день перечитывается тем же вызовом.
 *
 * Данные берутся именно для выбранной даты, а не из кэша «сегодня»: иначе при
 * переключении дня в карточке остались бы чужие числа.
 */
const { data: calendarDay } = await useAsyncData(
  'calendar-day',
  async () => {
    if (!auth.isAuthenticated) {
      return null;
    }

    dayFailed.value = false;

    try {
      const response = await api.request<CalendarResponse>(
        `/api/tasks/calendar?from=${selectedDate.value}&to=${selectedDate.value}`,
      );

      return response.days?.[0] ?? null;
    } catch {
      dayFailed.value = true;
      return null;
    }
  },
  { watch: [selectedDate] },
);

/** День выбранной даты: у дня — задачи, итоги и распределение по зонам. */
const day = computed<CalendarDay | null>(() => calendarDay.value ?? null);

const checklists = computed(() => templates.value?.checklist ?? []);
const checklistTasksTotal = computed(() =>
  checklists.value.reduce((sum, checklist) => sum + checklist.items.length, 0),
);

const showcase = computed<AchievementProgress[]>(() =>
  auth.isAuthenticated
    ? achievementsProgress.value.slice(0, 2)
    : achievementsCatalog.value.slice(0, 2).map((item) => ({ ...item, current: 0, earned: false })),
);

/**
 * Челлендж сезона закрыт — до следующего сезона на главной его нет.
 *
 * Отдельной строки «челлендж закрыт» больше нет: заказчик попросил в этом случае
 * не писать ничего («просто ничего») — блок и так исчезает, а объяснять очевидное
 * текстом не нужно. Признак оставлен: по нему скрывается карточка сезонного
 * челленджа у гостя.
 */
const challengeCompleted = computed(
  () => current.value.status === 'completed' || guestCompletedSlug.value !== null,
);

/**
 * Прогресс сезонного челленджа на карточке: у вошедшего он приходит с сервера
 * вместе с состоянием, у гостя считается по локальным отметкам. Если гость ещё
 * ничего не отметил, показываем описание — так же, как для незапущенного челленджа.
 */
const seasonCardProgress = computed(() => {
  const state = current.value;

  if (!('progress' in state) || !state.progress) {
    return null;
  }

  const progress = auth.isAuthenticated ? state.progress : seasonGuestProgress.value;

  if (!progress) {
    return null;
  }

  return !auth.isAuthenticated && progress.done === 0 ? null : progress;
});

/** «День 3: осталось 55 мин» на карточке сезонного челленджа. */
const seasonCardNote = computed(() => {
  const progress = seasonCardProgress.value;

  if (!progress?.currentDay) {
    return null;
  }

  return t('home.dayLeft', { day: progress.currentDay, minutes: progress.minutesLeft });
});

interface HomeChallengeCard {
  slug: string;
  title: string;
  description: string | null;
  badge: string;
  progress: ChallengeProgress | null;
  note: string | null;
  cover: string | null;
}

const dayNote = (progress: ChallengeProgress | null) =>
  progress?.currentDay
    ? t('home.dayLeft', { day: progress.currentDay, minutes: progress.minutesLeft })
    : null;

/**
 * Карточки челленджей для главной.
 *
 * Их может быть несколько: прошлый сезон человек не закрыл, а новый уже начал —
 * в базе тогда две активные записи. Показываем все активные подряд, а сезонный
 * «ещё не начатый» добавляем только если он не дублирует уже показанный.
 */
const challengeCards = computed<HomeChallengeCard[]>(() => {
  const cards: HomeChallengeCard[] = actives.value.map((item) => ({
    slug: item.challenge.slug,
    title: item.challenge.title,
    description: item.challenge.description ?? null,
    badge: t('home.inProgress'),
    progress: item.progress,
    note: dayNote(item.progress),
    cover: item.challenge.cover_url ?? null,
  }));

  const seasonal = seasonChallenge.value;

  if (
    seasonal &&
    !challengeCompleted.value &&
    !cards.some((card) => card.slug === seasonal.slug)
  ) {
    cards.push({
      slug: seasonal.slug,
      title: seasonal.title,
      description: seasonal.description ?? null,
      badge: t('home.challenges'),
      progress: seasonCardProgress.value,
      note: seasonCardNote.value,
      cover: seasonal.cover_url ?? null,
    });
  }

  return cards;
});

/**
 * «План на сегодня» — только свои задачи и план по дому.
 *
 * Задачи челленджа сюда не подмешиваются: челлендж — отдельная сущность, и
 * живёт он в своей карточке. Раньше задачи дня челленджа попадали в чипы плана,
 * из-за чего один и тот же пункт виделся в двух местах.
 */
const planTotal = computed(() => today.value?.summary.total_tasks ?? 0);
const planDone = computed(() => today.value?.summary.completed_tasks ?? 0);

/**
 * Сводка выбранного дня — те же числа, что показывала шторка дня: сколько задач
 * запланировано и закрыто, минуты по плану и по факту. Считает их сервер
 * (`GET /api/tasks/calendar`), поэтому они совпадают с «Планом на сегодня».
 */
const plural = (count: number, forms: [string, string, string]): string =>
  locale.value === 'ru'
    ? pluralRu(count, forms[0], forms[1], forms[2])
    : pluralEn(count, forms[0], forms[2]);

/** Заголовок дня: «Сегодня», «Вчера», «Завтра» или «Пн, 12 октября». */
const dayTitle = computed(() => {
  const target = selectedDate.value;

  if (isToday.value) {
    return t('calendar.today');
  }

  const start = localToday();

  if (target === toISODate(addDays(fromISODate(start), -1))) {
    return t('calendar.yesterday');
  }

  if (target === toISODate(addDays(fromISODate(start), 1))) {
    return t('calendar.tomorrow');
  }

  const label = new Intl.DateTimeFormat(locale.value, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(fromISODate(target));

  // «вт, 13 октября» — Intl отдаёт день недели со строчной буквы; заголовок
  // карточки начинается с него, поэтому поднимаем первую букву вручную.
  return label.charAt(0).toUpperCase() + label.slice(1);
});

/** «запланировано 5 задач» — число берём из итогов сервера, а не из длины списка. */
const plannedLabel = computed(() => {
  const count = day.value?.total_tasks ?? 0;

  return plural(count, [
    t('calendar.plannedOne', { count }),
    t('calendar.plannedFew', { count }),
    t('calendar.plannedMany', { count }),
  ]);
});

/** «выполнено 2 задачи» — только там, где факт вообще может быть не нулевым. */
const doneLabel = computed(() => {
  const count = day.value?.completed_tasks ?? 0;

  return plural(count, [
    t('calendar.doneOne', { count }),
    t('calendar.doneFew', { count }),
    t('calendar.doneMany', { count }),
  ]);
});

/**
 * «Выполнено» и «факт» показываем для любого дня, включая будущий: с тех пор как
 * отмечать можно заранее, ноль на завтра — это настоящий ноль, а не «ещё не
 * наступило».
 */
const showFact = computed(() => true);

/** «план 45 мин · факт 30 мин»: остаток показываем, только когда он ненулевой. */
const minutesLabel = computed(() => {
  const total = day.value?.total_minutes ?? 0;
  // Длительность форматируем здесь, а не в строке словаря: «план 112 мин» человеку
  // ничего не говорит, а «план 1 ч 52 мин» — говорит.
  const parts = [t('calendar.planMinutes', { minutes: formatDuration(total, locale.value) })];

  if (showFact.value) {
    const done = day.value?.completed_minutes ?? 0;
    parts.push(
      done > 0
        ? t('calendar.factMinutes', { minutes: formatDuration(done, locale.value) })
        : t('calendar.leftMinutes', { minutes: formatDuration(total, locale.value) }),
    );
  }

  return parts.join(' · ');
});

/**
 * Распределение по зонам: «Кухня 3 · Ванная 2».
 *
 * Считается здесь же из списка задач дня: сервер отдаёт зону у каждой задачи,
 * отдельного поля для разбивки нет и не нужно. Задачи без зоны собираются в
 * «Без зоны», чтобы сумма по зонам совпадала с числом задач дня.
 */
const zones = computed(() => {
  const counts = new Map<string, number>();

  for (const task of day.value?.tasks ?? []) {
    // Ключ группировки — значение из базы (оно же ключ срезов в статистике),
    // а на экран идёт переведённая подпись: иначе в английском интерфейсе
    // зоны оставались бы русскими.
    const zone = task.room?.trim() || '';
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([zone, count]) => ({ zone: zoneLabel(zone) ?? t('calendar.noRoom'), count }))
    .sort((left, right) => right.count - left.count || left.zone.localeCompare(right.zone));
});

/**
 * Локальные отметки: их видно сразу, ещё до ответа сервера.
 *
 * Ключ — id задачи, значение — новое состояние. Накладываются поверх ответа
 * `GET /api/tasks/today`, поэтому отметка не зависит от того, обновился ли уже
 * кэш `useAsyncData`; после успешного обновления накладка снимается, и на экране
 * остаётся состояние сервера.
 */
const planMarks = ref<Record<number, boolean>>({});

/** Задачи, по которым прямо сейчас идёт запрос: повторный тап по ним не проходит. */
const planBusy = ref<number[]>([]);

/** Понятная строка ошибки вместо молчаливого отката. */
const planError = ref('');

/** Периодичность из пары «частота + интервал»: «раз в неделю», «раз в 3 месяца». */
const frequencyLabel = (task: {
  frequency: TaskFrequency | null;
  interval_count: number | null;
}): string | null => {
  const frequency = task.frequency;

  if (!frequency) {
    return null;
  }

  if (frequency === 'once') {
    return t('plan.repeatOnce');
  }

  const count = task.interval_count ?? 1;

  if (count <= 1) {
    return frequency === 'daily'
      ? t('plan.repeatDay')
      : frequency === 'weekly'
        ? t('plan.repeatWeek')
        : t('plan.repeatMonth');
  }

  const forms =
    frequency === 'daily'
      ? [t('plan.unitDayOne'), t('plan.unitDayFew'), t('plan.unitDayMany')]
      : frequency === 'weekly'
        ? [t('plan.unitWeekOne'), t('plan.unitWeekFew'), t('plan.unitWeekMany')]
        : [t('plan.unitMonthOne'), t('plan.unitMonthFew'), t('plan.unitMonthMany')];

  // Склонения — как везде в проекте: русские формы через `pluralRu`, английские через `pluralEn`.
  const unit =
    locale.value === 'ru'
      ? pluralRu(count, forms[0]!, forms[1]!, forms[2]!)
      : pluralEn(count, forms[0]!, forms[2]!);

  return t('plan.repeatN', { count, unit });
};

/** Подпись строки сегодняшнего дня: зона, источник (расписание), периодичность и время. */
const taskHint = (task: TodayPlanTask): string =>
  [
    zoneLabel(task.room),
    task.schedule_title,
    frequencyLabel(task),
    task.estimated_minutes ? t('plan.minutes', { minutes: task.estimated_minutes }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * Подпись строки другого дня: зона, периодичность и минуты.
 *
 * Без названия расписания и длинных подсказок: список дня должен помещаться
 * целиком, поэтому лишнее отброшено сознательно — как и было в шторке дня.
 */
const calendarTaskHint = (task: CalendarTask): string =>
  [
    zoneLabel(task.room),
    frequencyLabel(task),
    task.estimated_minutes ? t('plan.minutes', { minutes: task.estimated_minutes }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * Строка списка задач дня: карточке нужны только название, подпись и отметка.
 * `generated` заполнен у сегодняшних строк — от него зависит текст в листе действий.
 *
 * Остальные поля — для правки: название и периодичность человек меняет, а зону,
 * минуты, время и дату постановки задача сохраняет прежними. Раньше запрос на
 * правку читал бы задачу заново и мог взять уже изменённые данные; здесь же
 * перед глазами ровно то, что пришло из плана.
 */
interface PlanDayRow {
  id: number;
  title: string;
  hint: string;
  done: boolean;
  generated: boolean;
  scheduleId: number;
  frequency: TodayPlanTask['frequency'];
  intervalCount: number | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  dueDate: string | null;
  time: string | null;
  estimatedMinutes: number | null;
  room: string | null;
}

/**
 * Пункты плана на сегодня.
 *
 * Сервер отдаёт словарь «зона → задачи», поэтому значения разворачиваем в один
 * список и сохраняем порядок сервера: отметка не должна переставлять строки.
 * Завершённые задачи остаются в списке зачёркнутыми — человек видит результат
 * своей отметки, а не пустеющий блок.
 *
 * `source` тянем наружу ради действия в строке: по нему видно, сгенерирована
 * задача сервером (значит, удаление — это отказ от предложения) или создана
 * человеком. Само решение об отказе принимает сервер, интерфейс лишь выбирает текст.
 */
const planTasks = computed<PlanDayRow[]>(() =>
  Object.values(today.value?.tasks ?? {})
    .flat()
    .map((task) => ({
      id: task.id,
      title: task.title,
      hint: taskHint(task),
      done: planMarks.value[task.id] ?? task.is_completed,
      generated: isGeneratedTask(task.source),
      scheduleId: task.schedule_id,
      frequency: task.frequency,
      intervalCount: task.interval_count,
      dayOfWeek: task.day_of_week,
      dayOfMonth: task.day_of_month,
      dueDate: task.due_date,
      time: task.time,
      estimatedMinutes: task.estimated_minutes,
      room: task.room,
    })),
);

/**
 * Строки, удалённые прямо сейчас, но ещё не подтверждённые обновлением данных.
 *
 * Сервер отдаёт план без удалённой задачи, однако между ответом на удаление и
 * новым `today-plan` проходит запрос: без этой отметки строка на мгновение
 * вернулась бы на экран. Снимается при возврате задачи и при обновлении данных.
 */
const planRemoved = ref<number[]>([]);

/** Что видно в списке: план сервера без только что удалённых строк. */
const visiblePlanTasks = computed(() =>
  planTasks.value.filter((task) => !planRemoved.value.includes(task.id)),
);

/** Задачи другого дня: только название, зона и минуты — отметки в них нет. */
const calendarRows = computed<PlanDayRow[]>(() =>
  (day.value?.tasks ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    hint: calendarTaskHint(task),
    done: task.is_completed,
    generated: false,
    // Чужой день только просматривается: правки там нет, поэтому поля,
    // нужные форме редактирования, остаются пустыми.
    scheduleId: 0,
    frequency: task.frequency,
    intervalCount: task.interval_count,
    dayOfWeek: null,
    dayOfMonth: null,
    dueDate: null,
    time: null,
    estimatedMinutes: task.estimated_minutes,
    room: task.room,
  })),
);

/**
 * Список карточки: сегодня — строки «Плана на сегодня» (отметка, удаление и
 * возврат), другой день — компактный просмотр дня из календаря. Дата и данные
 * берутся из одного и того же выбора, поэтому чужой день сюда не подмешивается.
 */
const dayRows = computed<PlanDayRow[]>(() =>
  isToday.value ? visiblePlanTasks.value : calendarRows.value,
);

/**
 * Удаление и возврат задачи.
 *
 * Общее состояние (что именно можно вернуть) и оба запроса живут в `useTaskUndo`:
 * кнопку «Вернуть» показывает уведомление в раскладке, а удаление запускает эта
 * страница — это одно действие, и держать его в двух местах нельзя.
 */
const {
  pending: pendingUndo,
  error: taskError,
  remove: removeTask,
} = useTaskUndo();

/** Понятная строка ошибки удаления: показывается в самом листе действий. */
const taskSheetError = ref('');

/** Окно удаления открыто для этой строки: `null` — закрыто. */
const actionTask = ref<PlanDayRow | null>(null);

/** Задача, для которой прямо сейчас идёт удаление: повторное нажатие не проходит. */
const actionBusy = ref(false);

/**
 * Открыть окно удаления со строкой.
 *
 * Отметка и удаление разведены намеренно: по строке человек отмечает задачу одним
 * тапом, а удаление живёт за отдельным кружком и подтверждается в окне — иначе
 * удаление случалось бы от промаха по строке.
 */
const openTaskActions = (task: PlanDayRow) => {
  actionBusy.value = false;
  taskSheetError.value = '';
  actionTask.value = task;
};

const closeTaskActions = () => {
  actionTask.value = null;
  taskSheetError.value = '';
};

/**
 * Перенос дела на другой день: открытый лист и выбранная в нём дата.
 *
 * Переносится вся серия (меняется день недели или число месяца), поэтому лист не
 * спрашивает «на один раз или навсегда»: ответ один — серия. Так дело сохраняет
 * периодичность, а не превращается в разовое.
 */
const moveTask = ref<PlanDayRow | null>(null);
const moveDate = ref('');
const moveBusy = ref(false);
const moveError = ref('');

const openMove = (task: PlanDayRow) => {
  moveTask.value = task;
  moveDate.value = selectedDate.value;
  moveError.value = '';
};

const closeMove = () => {
  moveTask.value = null;
  moveError.value = '';
};

const confirmMove = async () => {
  const task = moveTask.value;

  if (!task || !moveDate.value || moveBusy.value) {
    return;
  }

  moveBusy.value = true;
  moveError.value = '';

  try {
    await api.request(`/api/tasks/${task.id}/move`, {
      method: 'POST',
      body: { toDate: moveDate.value },
    });

    closeMove();
    await refreshNuxtData(['today-plan', 'calendar-day', 'calendar-week', 'streak']);
  } catch {
    moveError.value = t('plan.moveFailed');
  } finally {
    moveBusy.value = false;
  }
};

/** Лист «Изменить задачу» открыт для этой строки: `null` — закрыт. */
const editingTask = ref<PlanDayRow | null>(null);

/** Идёт сохранение правки: повторное нажатие «Сохранить» не проходит. */
const editBusy = ref(false);

/**
 * По какой-то строке сейчас идёт запрос действия: удаление или сохранение правки.
 *
 * Отметка сюда намеренно не входит: она не мешает открыть окно действия, а вот
 * повторное нажатие по кружку во время удаления повторило бы запрос. Кружки при
 * этом только блокируются: открытое окно и так перекрывает список.
 */
const actionsPending = computed(() => actionBusy.value || editBusy.value);

/** Понятная строка ошибки сохранения: показывается в самом листе правки. */
const editError = ref('');

/**
 * Открыть форму правки прямо из строки.
 *
 * Раньше это действие жило в листе действий и брало строку из `actionTask`;
 * теперь «Изменить» — отдельный кружок у строки, поэтому задача приходит
 * аргументом. Сам лист (`TaskEditSheet`) и сохранение не изменились: лист
 * действий из цепочки убран, но переход «строка → окно правки» остался прежним.
 */
const openTaskEditFrom = (task: PlanDayRow) => {
  editingTask.value = task;
  editError.value = '';
  actionTask.value = null;
  taskSheetError.value = '';
};

const closeTaskEdit = () => {
  editingTask.value = null;
  editError.value = '';
};

/**
 * Календарный день, который сервер считает датой постановки задачи.
 *
 * Раньше здесь был обходной путь: сервер отдавал `DATE` моментом времени в поясе
 * процесса, поэтому день приезжал на сутки раньше (хранится `2026-10-13`, в ответе
 * `2026-10-12T20:00:00.000Z`), и при отправке назад его приходилось сдвигать вперёд —
 * иначе якорь цикла «раз в N дней/недель» уезжал на сутки и задача с интервалом
 * больше единицы могла пропасть из плана.
 *
 * Теперь сервер отдаёт день днём (`backend/db.ts` разбирает `DATE` строкой), так что
 * сдвигать нечего: значение проходит как есть. Проверка формата осталась страховкой —
 * если однажды придёт момент времени, мы возьмём из него календарный день, а не
 * сдвинем дату на сутки.
 */
const dueDay = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

/**
 * Периодичность правки в терминах API.
 *
 * День периода не спрашиваем: у той же единицы он остаётся прежним, а при смене
 * единицы берётся из даты постановки (`due_date`) — задача лишь меняет частоту, а
 * не переезжает на другой день недели или число. Дата нужна и как якорь цикла:
 * по ней сервер считает «раз в N месяцев» (правило 33).
 */
const editRepeat = (task: PlanDayRow, unit: TaskRepeatUnit): TaskRepeat => {
  if (unit === 'once') {
    return { frequency: 'once', day_of_week: null, day_of_month: null };
  }

  if (unit === 'day') {
    return { frequency: 'daily', day_of_week: null, day_of_month: null };
  }

  const today = localToday();
  const anchor = fromISODate(dueDay(task.dueDate) ?? today);

  if (unit === 'week') {
    return {
      frequency: 'weekly',
      // День недели и число берём в UTC: день периода живёт в API целым числом
      // (0 — воскресенье), а не моментом времени, и часовой пояс браузера к нему
      // отношения не имеет.
      day_of_week: task.dayOfWeek ?? anchor.getUTCDay(),
      day_of_month: null,
    };
  }

  return {
    frequency: 'monthly',
    day_of_month: task.dayOfMonth ?? anchor.getUTCDate(),
    day_of_week: null,
  };
};

/**
 * Сохранить правку задачи: название и периодичность.
 *
 * Два пути, как просил заказчик:
 *  - сгенерированную задачу сначала удаляем (`DELETE` запоминает название в
 *    памяти об отказах, поэтому пересборка плана её не вернёт), затем создаём
 *    свою с новым текстом и частотой в том же расписании;
 *  - свою задачу обновляем на месте (`PUT`).
 *
 * Отметка дня переносится: у повторяющихся дел результат живёт в журнале
 * `task_completions` и вместе с удалённой задачей пропадает, поэтому закрытую
 * сегодня задачу закрываем заново — иначе человек потерял бы свою галочку.
 * Своей задаче на месте отметку ставить не нужно: она уже стоит.
 *
 * Ошибка не оставляет человека без объяснения, а строка до подтверждения
 * сервера скрыта локально (`planRemoved`), чтобы список не показывал две задачи.
 */
const saveTaskEdit = async (input: TaskEditInput) => {
  const task = editingTask.value;

  if (!task || editBusy.value) {
    return;
  }

  editBusy.value = true;
  editError.value = '';
  planRemoved.value = [...planRemoved.value, task.id];

  // Признак успеха: только по нему трогаем список и данные — при ошибке строка
  // остаётся на месте вместе с открытым листом, а человек правит дальше.
  let saved = false;

  try {
    if (task.generated) {
      const removed = await api.request<DeleteTaskResponse>(`/api/tasks/${task.id}`, {
        method: 'DELETE',
      });

      if (removed?.deleted) {
        const created = await api.request<{ id: number }>('/api/tasks', {
          method: 'POST',
          body: {
            schedule_id: task.scheduleId,
            title: input.title,
            estimated_minutes: task.estimatedMinutes ?? 0,
            room: task.room,
            due_date: dueDay(task.dueDate),
            ...editRepeat(task, input.frequency),
            interval_count: input.intervalCount,
          } satisfies TaskCreateInput,
        });

        // Отметка дня переезжает на новую задачу: журнал старой ушёл вместе с ней.
        if (task.done && created?.id) {
          await api.request(`/api/tasks/${created.id}`, {
            method: 'PUT',
            body: { is_completed: true },
          });
        }

        saved = true;
      }
    } else {
      await api.request(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: {
          title: input.title,
          ...editRepeat(task, input.frequency),
          interval_count: input.intervalCount,
          // Отметку трогаем, только если задача была закрыта: тогда сервер
          // подтвердит результат дня и серия не потеряет сегодняшний пункт.
          // Незакрытую задачу правка названия закрывать не должна.
          ...(task.done ? { is_completed: true } : {}),
        },
      });

      saved = true;
    }
  } catch {
    saved = false;
  } finally {
    editBusy.value = false;
  }

  if (!saved) {
    // Правка не прошла: строка возвращается на место, причина — в листе.
    planRemoved.value = planRemoved.value.filter((id) => id !== task.id);
    editError.value = t('tasks.editFailed');
    return;
  }

  // Данные уже перечитаны — прежняя строка (её id) больше не нужна в списке скрытых.
  closeTaskEdit();
  await refreshNuxtData(['today-plan', 'calendar-day', 'calendar-week', 'streak', 'achievements-progress']);
  planRemoved.value = planRemoved.value.filter((id) => id !== task.id);
};

/**
 * Удалить задачу из плана.
 *
 * Лист закрывается только после подтверждения сервера, а уведомление снизу
 * показывает, что именно ушло, и даёт вернуть задачу на место. Текст ошибки
 * хранится в `useTaskUndo`, потому что только там есть доступ к переводам.
 */
const confirmTaskDelete = async () => {
  const task = actionTask.value;

  if (!task || actionBusy.value) {
    return;
  }

  actionBusy.value = true;
  planRemoved.value = [...planRemoved.value, task.id];

  const removed = await removeTask(task.id);

  actionBusy.value = false;

  if (!removed) {
    // Удаление не прошло: строка возвращается на место, причина — в листе.
    planRemoved.value = planRemoved.value.filter((id) => id !== task.id);
    taskSheetError.value = taskError.value;
    return;
  }

  closeTaskActions();
};

/**
 * Уведомление закрылось — вернули задачу, истекли секунды или нажали крестик:
 * локальная отметка об удалении больше не нужна. При возврате план уже перечитан
 * и строка снова приходит с сервера, при отказе от возврата её просто нет — в
 * обоих случаях список показывает ответ сервера, а не нашу накладку.
 *
 * Сам возврат запускает кнопка «Вернуть» в уведомлении (`TaskUndoToast`), и это
 * правильно: она живёт в раскладке и видна на любой странице, а страница здесь
 * только убирает свою локальную отметку.
 */
watch(pendingUndo, (value, previous) => {
  if (!value && previous) {
    planRemoved.value = [];
  }
});

/** Снять локальную накладку: дальше показываем состояние сервера. */
const clearPlanMark = (id: number) => {
  const rest: Record<number, boolean> = {};

  for (const [key, value] of Object.entries(planMarks.value)) {
    const taskId = Number(key);

    if (taskId !== id) {
      rest[taskId] = value;
    }
  }

  planMarks.value = rest;
};

/** Ответил ли сервер тем же состоянием отметки, что мы отправили. */
const serverHasMark = (id: number, value: boolean): boolean =>
  Object.values(today.value?.tasks ?? {})
    .flat()
    .some((task) => task.id === id && task.is_completed === value);

/**
 * Отметка задачи в один тап — для любого открытого дня.
 *
 * Оптимистично: строка перечёркивается сразу, затем уходит `PUT /api/tasks/:id`
 * (он же считает серию и достижения). Кольцо, счётчики и минуты обновляем
 * отдельным запросом — они считаются на сервере. Если запрос не прошёл,
 * отметку откатываем и говорим об этом строкой, а не молчанием.
 *
 * Можно отмечать и прошлые, и будущие дни: человек возвращается к вчерашней
 * уборке или закрывает дело заранее. День едет в теле запроса (`completed_on`),
 * а серия считает момент нажатия, а не день дела (services/streak.ts).
 */
const togglePlanTask = async (task: { id: number; done: boolean }) => {
  if (planBusy.value.includes(task.id)) {
    return;
  }

  const next = !task.done;
  // День, открытый в календаре: отметка относится к нему, а не к «сегодня».
  const completedOn = selectedDate.value;

  planMarks.value = { ...planMarks.value, [task.id]: next };
  planBusy.value = [...planBusy.value, task.id];
  planError.value = '';

  let awarded: string[] = [];

  try {
    const response = await api.request<{ awarded?: string[] }>(`/api/tasks/${task.id}`, {
      method: 'PUT',
      body: { is_completed: next, completed_on: completedOn },
    });

    awarded = response.awarded ?? [];
  } catch {
    clearPlanMark(task.id);
    planError.value = t('plan.markFailed');
    return;
  } finally {
    planBusy.value = planBusy.value.filter((id) => id !== task.id);
  }

  try {
    // Отметка сохранена: подтягиваем план, день карточки, серию и достижения,
    // чтобы числа на экране совпали с сервером.
    await refreshNuxtData(['today-plan', 'calendar-day', 'calendar-week', 'streak', 'achievements-progress']);
  } catch {
    // Обновление не прошло — отметку ниже оставим: она уже верна.
  }

  // Накладку снимаем, только если сервер вернул тот же ответ: иначе на экране
  // осталось бы старое состояние, хотя запись уже прошла.
  if (serverHasMark(task.id, next)) {
    clearPlanMark(task.id);
  }

  await showAchievements(awarded);
};

const tasksWidgetValue = computed(
  () => today.value?.summary.total_tasks ?? checklistTasksTotal.value,
);

/**
 * Статистика на главной берётся из того же источника, что и раздел
 * «Статистика»: числа обязаны совпадать, иначе виджет врёт.
 */
const statsPeriod = ref<StatsPeriod>('week');
const { overview: statsOverview } = await useStats(statsPeriod);
const statsValue = computed(() => statsOverview.value?.last7.tasks ?? 0);
const statsNote = computed(() => formatClock(statsOverview.value?.last7.minutes ?? 0));

const habitMeta = (habit: { category: string | null; intervalCount: number; intervalUnit: string; streak: number }) =>
  [
    categoryLabel(habit.category),
    intervalLabel(habit.intervalCount, habit.intervalUnit as 'once' | 'day' | 'week' | 'month'),
    habit.streak > 0 ? t('habits.streak', { count: habit.streak }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

const toggleHabit = async (habit: { id: number }) => {
  if (habitBusy.value !== null) {
    return;
  }

  habitBusy.value = habit.id;
  try {
    const response = await api.request<{ awarded?: string[] }>(`/api/habits/${habit.id}/toggle`, {
      method: 'POST',
    });

    await refreshHabits();
    await refreshNuxtData('achievements-progress');
    await showAchievements(response.awarded);
  } finally {
    habitBusy.value = null;
  }
};

/** Совет дня: в английской локали берём английскую статью, иначе — русскую. */
const { data: tip } = await useAsyncData(
  () => `tip-of-the-day-${locale.value}`,
  async () => {
    const collection = locale.value === 'en' ? 'tipsEn' : 'tips';
    const localized = await queryCollection(collection).order('order', 'ASC').first();

    return localized ?? (await queryCollection('tips').order('order', 'ASC').first());
  },
  { watch: [locale] },
);

/**
 * Заголовок главной — про продукт, а не про экран «Сегодня».
 *
 * Раньше в `<title>` уходило название вкладки (`nav.today`), и главная страница
 * сайта представлялась поисковику как «Сегодня — TidyPlan»: по такому заголовку
 * её не ищут и не ранжируют. Экран «Сегодня» — это то, что человек видит после
 * входа, а адрес `/` — витрина сервиса, поэтому в заголовке стоит то, чем сайт
 * полезен: план уборки, челленджи и чек-листы.
 */
useSeoMeta({
  title: () => t('home.metaTitle'),
  description: () => t('home.metaDescription'),
});

const site = useSiteConfig();

/**
 * Приложение бесплатное и устанавливается на телефон, поэтому размечаем его
 * как SoftwareApplication: в выдаче это даёт строку «Бесплатно».
 */
useStructuredData(() => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${site.url}/#app`,
      name: 'TidyPlan',
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'Web',
      description: t('home.metaDescription'),
      url: site.url,
      inLanguage: 'ru-RU',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
    },
  ],
}));
</script>

<template>
  <div class="home">
    <h1 class="visually-hidden">{{ t('home.h1') }}</h1>

    <p v-if="templatesError" class="state state--error">
      {{ t('state.error') }}<br >
      <small>{{ t('state.errorHint') }}</small>
    </p>

    <!--
      Приглашение пройти анкету о доме: только вошедшему и только пока анкета
      не пройдена. По ответам сервер собирает план, поэтому до анкеты план дня
      остаётся пустым — карточка объясняет, почему, и ведёт прямо в мастер.
    -->
    <HomeSetupCard
      v-if="auth.isAuthenticated && !homeProfileDone"
      :to="localePath('/settings?setup=1')"
    />

    <!--
      Режим отпуска: вместо плана — состояние отпуска и выход из него.
      Задачи никуда не деваются и не сдвигаются: человек вернётся, и план снова
      будет на месте. Серия за дни отпуска не рвётся (см. services/streak.ts).
    -->
    <section v-if="vacationActive" class="card vacation">
      <p class="vacation__emoji" aria-hidden="true">🌴</p>
      <h2 class="vacation__title">{{ t('vacation.title') }}</h2>
      <p class="vacation__text">{{ t('vacation.text') }}</p>

      <AppButton variant="outline" :disabled="vacationBusy" @click="endVacationNow">
        {{ t('vacation.finish') }}
      </AppButton>
    </section>

    <!--
      План дня: карточка показывает выбранный в календаре день — его заголовок,
      статистику и список задач. Отмечать можно только сегодня: прошлое и будущее
      открываются на просмотр, без всплывающих панелей.
    -->
    <section v-else class="plan card">
      <div class="plan__head">
        <AppBadge variant="accent">{{ dayTitle }}</AppBadge>
      </div>

      <template v-if="auth.isAuthenticated">
        <!--
          Сводка дня: числа считает сервер (`GET /api/tasks/calendar`), поэтому они
          совпадают с «Планом на сегодня». У будущего дня «выполнено» и «факт» не
          показываем: факт там всегда нулевой, и строка выглядела бы результатом.
          Пустой день сводку не показывает вовсе — вместо неё ниже стоит понятная
          строка, а «запланировано 0 задач» читалось бы как отчёт.
        -->
        <div class="plan__body">
          <!-- Кольцо — только у сегодняшнего дня: у остальных отмечать нечего -->
          <PlanRing v-if="isToday" :done="planDone" :total="planTotal" />

          <div class="plan__aside">
            <section v-if="day && day.total_tasks > 0" class="summary" :aria-label="t('calendar.summaryTitle')">
              <p class="summary__value">{{ plannedLabel }}</p>

              <p class="summary__meta">
                <span v-if="showFact">{{ doneLabel }}</span>
                <span class="summary__minutes">{{ minutesLabel }}</span>
              </p>

              <!-- Распределение по зонам: «Кухня 3 · Ванная 2» -->
              <p v-if="zones.length" class="summary__zones">
                <span class="summary__zones-label">{{ t('calendar.zonesTitle') }}</span>
                <span v-for="zone in zones" :key="zone.zone" class="summary__zone">
                  {{ zone.zone }} {{ zone.count }}
                </span>
              </p>
            </section>

            <!--
              Подсказки «отмечайте задачи по одной» здесь больше нет: кольцо и
              счётчики сами показывают, что происходит, а текст только занимал
              место (заказчик: «и так вроде всё очевидно»).
            -->
          </div>
        </div>

        <!-- День не загрузился: причина на экране, а не пустой список -->
        <p v-if="dayFailed" class="plan__error" role="alert">{{ t('state.error') }}</p>

        <!--
          Пункты дня. Отмечать можно любой открытый день: человек возвращается к
          вчерашней уборке или закрывает дело заранее, поэтому строки
          интерактивны везде. Справа — «⋯» с правкой и удалением; отдельная
          кнопка, а не часть строки: удаление не должно случаться от промаха.
        -->
        <ul v-if="dayRows.length" class="plan__list">
          <li v-for="task in dayRows" :key="task.id">
            <TaskRow
              interactive
              :title="task.title"
              :hint="task.hint"
              :done="task.done"
              :disabled="planBusy.includes(task.id)"
              @toggle="togglePlanTask(task)"
            >
              <PlanTaskActions
                :generated="task.generated"
                :pending="actionsPending"
                @edit="openTaskEditFrom(task)"
                @delete="openTaskActions(task)"
                @move="openMove(task)"
              />
            </TaskRow>
          </li>
        </ul>

        <!--
          Строка «Добавить задачу» в конце списка: плюсик в углу экрана оказался
          неочевидным (его не замечали), а конец списка — то место, где человек
          дочитывает план и вспоминает про своё дело. Только для сегодняшнего
          дня: задача создаётся на сегодня, и на чужом дне она была бы обманом.
        -->
        <button
          v-if="dayRows.length && isToday"
          type="button"
          class="plan__add-row"
          @click="openTaskSheet"
        >
          <i class="pi pi-plus" aria-hidden="true" />
          {{ t('plan.addTask') }}
        </button>

        <!-- Сегодня пусто: добавляем задачу или проходим настройку по дому -->
        <div v-if="!dayRows.length && isToday" class="plan__empty">
          <p class="plan__empty-title">{{ t('plan.empty') }}</p>
          <p class="plan__empty-hint">{{ t('plan.emptyHint') }}</p>

          <div class="plan__empty-actions">
            <button type="button" class="plan__add" @click="openTaskSheet">
              <i class="pi pi-plus" aria-hidden="true" />
              {{ t('plan.addTask') }}
            </button>

            <NuxtLink v-if="!homeProfileDone" :to="localePath('/settings?setup=1')" class="plan__setup">
              {{ t('plan.setupLink') }}
              <i class="pi pi-chevron-right" aria-hidden="true" />
            </NuxtLink>
          </div>
        </div>

        <!-- Другой день пуст: это не ошибка, а факт — сообщаем коротко -->
        <p v-if="!dayRows.length && !isToday && !dayFailed" class="plan__empty-day">
          {{ t('calendar.emptyDay') }}
        </p>

        <!-- Ошибка отметки: строка, а не молчаливый откат -->
        <p v-if="planError" class="plan__error" role="alert">{{ planError }}</p>

        <!--
          Окно удаления: тот же лист, что и раньше, — выбор действия в нём больше
          не нужен, зато текст зависит от источника задачи. Правку этот лист уже
          не открывает: «Изменить» — отдельный кружок у строки.
        -->
        <PlanTaskActionsSheet
          :open="actionTask !== null"
          :title="actionTask?.title ?? ''"
          :generated="actionTask?.generated ?? false"
          :pending="actionBusy"
          :error="taskSheetError"
          @close="closeTaskActions"
          @confirm="confirmTaskDelete"
        />

        <!--
          Форма правки: название и периодичность. Открывается кружком «Изменить»
          у той же строки, поэтому строка не теряется между выбором действия и
          самим окном.
        -->
        <TaskEditSheet
          :open="editingTask !== null"
          :task="editingTask"
          :pending="editBusy"
          :error="editError"
          @close="closeTaskEdit"
          @save="saveTaskEdit"
        />

        <!--
          Перенос дела на другой день. Переносится вся серия: меняется день
          недели или число месяца, а периодичность остаётся прежней — поэтому в
          листе только календарь и кнопка, без выбора «один раз или навсегда».
        -->
        <AppSheet :open="moveTask !== null" @close="closeMove">
          <template #header>
            <h2 class="plan__sheet-title">{{ t('plan.moveTitle') }}</h2>
          </template>

          <p class="plan__sheet-task">{{ moveTask?.title }}</p>

          <AppDateField v-model="moveDate" :label="t('plan.moveDate')" :clearable="false" />

          <p v-if="moveError" class="plan__error" role="alert">{{ moveError }}</p>

          <AppButton
            variant="filled"
            block
            :disabled="moveBusy || !moveDate"
            class="plan__sheet-submit"
            @click="confirmMove"
          >
            {{ moveBusy ? t('state.loading') : t('plan.moveConfirm') }}
          </AppButton>
        </AppSheet>
      </template>

      <!--
        Гость: приглашение живёт внутри карточки плана, а не отдельной карточкой
        в меню или плашкой в потоке. Закрывать его нечего — это содержимое блока,
        поэтому вместо баннера здесь короткое объяснение и два выхода.
      -->
      <template v-else>
        <div class="plan__guest">
          <div class="plan__guest-body">
            <!-- Кольцо остаётся приглушённым (0 из 0): показывает, что появится здесь -->
            <div class="plan__guest-ring" aria-hidden="true">
              <PlanRing :done="0" :total="0" />
            </div>

            <div class="plan__guest-text">
              <p class="plan__guest-title">{{ t('plan.guestTitle') }}</p>
              <p class="plan__guest-hint">{{ t('plan.guestText') }}</p>
            </div>
          </div>

          <div class="plan__guest-actions">
            <AppButton variant="accent" :to="localePath('/plan')">
              {{ t('plan.guestBuild') }}
            </AppButton>
            <AppButton variant="outline" :to="localePath('/register')">
              {{ t('plan.guestRegister') }}
            </AppButton>
          </div>
        </div>
      </template>
    </section>

    <!-- Серия и недельная цель: день засчитывается за любой закрытый пункт -->
    <StreakCard v-if="auth.isAuthenticated" />

    <!-- Дом: общий план семьи и кто что делает -->
    <HouseholdCard v-if="auth.isAuthenticated" />

    <!-- Виджеты -->
    <section class="widgets">
      <article class="card card--warm widget">
        <AppBadge variant="amber">{{ t('home.weekStats') }}</AppBadge>
        <h3 class="widget__title">{{ t('home.weekStats') }}</h3>
        <p class="widget__text">{{ t('home.weekStatsHint') }}</p>
        <p class="widget__value">{{ statsValue }}</p>
        <p class="widget__caption">{{ t('home.last7') }} · {{ statsNote }}</p>
        <NuxtLink :to="localePath('/analytics')" class="widget__link">
          {{ t('home.seeProgress') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </article>

      <article class="card card--mint widget">
        <AppBadge>{{ t('home.allTasks') }}</AppBadge>
        <h3 class="widget__title">{{ t('home.taskManagement') }}</h3>
        <p class="widget__text">{{ t('home.schedule') }}</p>
        <p class="widget__value">{{ tasksWidgetValue }}</p>
        <p class="widget__caption">{{ t('home.tasks') }}</p>
        <NuxtLink :to="localePath('/checklists')" class="widget__link">
          {{ t('home.schedule') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </article>
    </section>

    <!--
      Привычки и достижения стоят рядом: на десктопе это две колонки, на телефоне
      привычный столбик. Гостю привычек не показываем, и тогда достижения
      занимают всю ширину (см. `.home__pair:has(> :only-child)`).
    -->
    <div class="home__pair">

    <!-- Привычки на сегодня: отметить можно не уходя с главной -->
    <section v-if="auth.isAuthenticated" class="card card--mint habits">
      <header class="habits__head">
        <span class="icon-box" aria-hidden="true"><i class="pi pi-refresh" /></span>
        <div class="habits__summary">
          <h2 class="card__title">{{ t('home.habitsToday') }}</h2>
          <p class="card__meta">{{ doneToday.length }}/{{ habits.length }}</p>
        </div>
        <NuxtLink :to="localePath('/habits')" class="chip-link">
          {{ t('home.allHabits') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </header>

      <p v-if="habits.length === 0" class="habits__empty">
        <NuxtLink :to="localePath('/habits')" class="habits__link">
          {{ t('home.noHabits') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </p>

      <ul v-else class="habits__list">
        <li v-for="habit in [...dueToday, ...doneToday].slice(0, 4)" :key="habit.id">
          <HabitRow
            :title="habit.title"
            :icon="habit.icon"
            :done="habit.doneToday"
            :meta="habitMeta(habit)"
            :disabled="habitBusy !== null"
            @toggle="toggleHabit(habit)"
          />
        </li>
      </ul>
    </section>

    <!-- Достижения -->
    <section class="card card--mint achievements">
      <header class="achievements__head">
        <span class="icon-box" aria-hidden="true"><i class="pi pi-trophy" /></span>
        <div class="achievements__summary">
          <h2 class="card__title">{{ t('home.achievements') }}</h2>
          <p class="card__meta">
            {{ achievementsEarned }}/{{ achievementsTotal }} {{ t('home.achievementsDone') }}
          </p>
        </div>
        <NuxtLink :to="localePath('/achievements')" class="chip-link">
          {{ t('home.seeAll') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </header>

      <ul class="achievements__list">
        <li v-for="item in showcase" :key="item.code" class="achievement">
          <span class="icon-box icon-box--surface" aria-hidden="true">
            {{ item.earned ? '🏆' : '🏅' }}
          </span>
          <div class="achievement__body">
            <strong>{{ item.name }}</strong>
            <small>{{ item.description }}</small>
            <div class="achievement__progress">
              <ProgressBar
                thin
                :value="Math.round((item.current / item.criteria_value) * 100)"
              />
              <span>{{ item.current }}/{{ item.criteria_value }}</span>
            </div>
          </div>
        </li>
      </ul>
    </section>

    </div>

    <!--
      Челленджи переехали сюда с первого экрана: главная открывается ради дел на
      сегодня, а челлендж — дополнительная программа, поэтому он стоит после
      достижений. Карточек может быть несколько: прошлый сезон часто не закрыт,
      когда начинается новый, и оба должны оставаться на виду.
    -->
    <template v-if="challengeCards.length > 0">
      <div class="section-head">
        <h2 class="section-head__title">{{ t('home.readyToStart') }}</h2>
        <NuxtLink :to="localePath('/challenges')" class="section-head__link">
          {{ t('home.allChallenges') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </div>

      <ChallengeCard
        v-for="card in challengeCards"
        :key="card.slug"
        :title="card.title"
        :description="card.description ?? undefined"
        :badge-label="card.badge"
        :progress="card.progress"
        :note="card.note"
        :cover-url="card.cover ?? undefined"
        :to="localePath(`/challenges/${card.slug}`)"
      />
    </template>

    <!-- Совет дня: первый материал из web/content/tips -->
    <NuxtLink v-if="tip" class="card card--task tip" :to="localePath(tip.path)">
      <img class="tip__image" :src="tip.cover" :alt="tip.title" loading="lazy" >
      <div class="tip__body">
        <AppBadge variant="amber">{{ t('home.tipOfTheDay') }}</AppBadge>
        <h2 class="card__title">{{ tip.title }}</h2>
        <p class="card__text">{{ tip.description }}</p>
        <span class="tip__more">
          {{ t('home.seeAll') }}
          <i class="pi pi-chevron-right" aria-hidden="true" />
        </span>
      </div>
    </NuxtLink>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/*
 * H1 главной скрыт визуально (`.visually-hidden` из decor.css) и поэтому своих
 * стилей не имеет: на экране страница начинается с календаря, а заголовок
 * остаётся в разметке для поисковика.
 */

/*
 * Карточка челленджа на главной — уже остальных блоков и по центру.
 *
 * Это «шапка» дня, а не полоса во всю ширину: на широком экране карточка с
 * обложкой растягивалась заметно сильнее, чем читается, и заказчик просил сделать
 * её меньше. Селектор попадает в корень дочернего компонента: Vue добавляет
 * родительский атрибут области видимости корневому узлу ребёнка.
 */
.home > .card {
  max-width: var(--content-reading);
  margin-inline: auto;
  width: 100%;
}

/* Режим отпуска: спокойный блок вместо списка задач */
.vacation {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  text-align: center;
}

.vacation__emoji {
  margin: 0;
  font-size: 2rem;
  line-height: 1;
}

.vacation__title {
  margin: 0;
  font-size: var(--fs-body);
  font-weight: 600;
}

.vacation__text {
  max-width: 42ch;
  margin: 0;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--r-card);
  transition:
    transform var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out);
}

/* Лёгкий подъём карточки под курсором: только там, где есть настоящий указатель */
@media (hover: hover) and (pointer: fine) {
  .card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-lift);
  }
}

@media (min-width: 768px) {
  /* Десктоп: больше воздуха и две колонки там, где раньше всё шло в столбик */
  .home {
    gap: var(--space-6);
  }

  .card {
    padding: var(--space-5);
  }
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .card:hover {
    transform: none;
    transition: none;
  }
}

.card--mint {
  background: var(--c-surface-mint);
}

.card--warm {
  background: var(--c-surface-warm);
}

/*
 * Нейтральная строка вместо карточки: челлендж сезона закрыт и до следующего
 * сезона на главной не показывается (со слов заказчика).
 */
.home__note {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.card--task {
  background: var(--c-surface-task);
}

.card__title {
  font-size: var(--fs-title);
}

.card__text,
.card__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.section-head__title {
  font-size: 1.25rem;
}

.section-head__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

.section-head__link:hover {
  color: var(--c-brand);
}

.icon-box {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  border-radius: var(--r-thumb);
  background: var(--c-bg);
  color: var(--c-brand);
  font-size: 1.25rem;
}

.icon-box--surface {
  background: var(--c-surface);
  font-size: 1.25rem;
}

.icon-box--accent {
  color: var(--c-accent);
}

/* ── План дня ───────────────────────────────────────────────────────────
 * Карточка показывает выбранный день: заголовок-дата, статистику дня и список.
 * Компактное кольцо живёт только у сегодняшнего дня, на десктопе они с
 * статистикой стоят в две колонки.
 */
.plan {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  border-radius: var(--r-card);
  background: var(--grad-warm);
}

.plan__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.plan__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  text-align: center;
}

.plan__aside {
  display: grid;
  width: 100%;
  gap: var(--space-3);
  justify-items: center;
}

.plan__hint {
  margin: 0;
  max-width: 34ch;
  color: var(--c-text-muted);
}

/* ── Сводка дня ───────────────────────────────────────────────────────── */
.summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface);
  text-align: left;
}

.summary__value {
  margin: 0;
  font-weight: 600;
}

/* «выполнено 2 задачи» и минуты — одной строкой: в карточке они рядом по смыслу */
.summary__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.summary__zones {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-1) 0 0;
  font-size: var(--fs-caption);
}

.summary__zones-label {
  color: var(--c-text-muted);
}

/* Зона — компактный чип: строка «Кухня 3 · Ванная 2» не должна расти в столбик */
.summary__zone {
  padding: 2px var(--space-2);
  border-radius: var(--r-pill);
  background: var(--c-surface-sunken);
  color: var(--c-text);
  white-space: nowrap;
}

/*
 * Строка «Добавить задачу» в конце списка: тихая, но заметная — та же высота,
 * что у строки задачи, пунктирная рамка вместо заливки, чтобы не выглядела как
 * ещё одна задача.
 */
.plan__add-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  min-height: var(--tap-min);
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px dashed var(--c-border);
  border-radius: var(--r-row);
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
}

.plan__add-row:hover {
  border-color: var(--c-brand);
  color: var(--c-brand);
}

/* Заголовок и содержимое листа переноса задачи */
.plan__sheet-title {
  margin: 0;
  font-size: var(--fs-title);
  font-weight: 600;
}

.plan__sheet-task {
  margin: 0 0 var(--space-3);
  color: var(--c-text-muted);
}

.plan__sheet-submit {
  margin-top: var(--space-4);
}

/* Пустой чужой день: короткая строка вместо блока с кнопками */
.plan__empty-day {
  margin: 0;
  padding: var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text-muted);
  text-align: center;
}

/*
 * Гость: приглашение внутри карточки плана.
 *
 * Оформление то же, что у других блоков приложения: мягкая поверхность,
 * скругление ряда и два размытых пятна по углам (тот же приём, что в пустых
 * состояниях). Кольцо приглушено: оно показывает, что здесь появится план,
 * но не выглядит как настоящий прогресс.
 */
.plan__guest {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface);
}

.plan__guest::before,
.plan__guest::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.plan__guest::before {
  top: -80px;
  right: -50px;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, var(--c-surface-mint) 0%, transparent 70%);
}

.plan__guest::after {
  bottom: -90px;
  left: -50px;
  width: 180px;
  height: 180px;
  background: radial-gradient(circle, var(--c-accent-soft) 0%, transparent 70%);
}

/* Пятна декоративные: содержимое всегда выше них */
.plan__guest-body,
.plan__guest-actions {
  position: relative;
}

.plan__guest-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}

.plan__guest-ring {
  opacity: 0.55;
}

/* Кольцо-заглушка чуть меньше настоящего: оно здесь не главное */
.plan__guest-ring :deep(.ring) {
  width: 128px;
  height: 128px;
}

.plan__guest-ring :deep(.ring__done) {
  font-size: 1.75rem;
}

.plan__guest-text {
  display: grid;
  gap: var(--space-1);
  max-width: 42ch;
}

.plan__guest-title {
  font-size: var(--fs-title);
  font-weight: 600;
  line-height: var(--lh-tight);
}

.plan__guest-hint {
  color: var(--c-text-muted);
}

.plan__guest-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
}

/* Пункты плана — интерактивные строки в столбик: по ним же и отмечаем */
.plan__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/*
 * Компактное действие у строки — «⋯» — переехало в `PlanTaskActions`: там же
 * живут раскрывающиеся кружки и тултипы, поэтому стили кнопки держатся рядом с
 * её разметкой, а не в карточке плана.
 */

/* Пустой план: короткое объяснение и два выхода — добавить задачу или настроить дом */
.plan__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--r-row);
  background: var(--c-surface);
  text-align: center;
}

.plan__empty-title {
  font-weight: 600;
}

.plan__empty-hint {
  max-width: 36ch;
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.plan__empty-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.plan__add {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: none;
  border-radius: var(--r-pill);
  background: var(--c-brand);
  color: var(--c-onbrand);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out);
}

.plan__add:hover {
  background: var(--c-brand-hover);
}

.plan__setup {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--tap-min);
  padding: 0 var(--space-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill);
  color: var(--c-brand);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

/* Отметка не сохранилась: причина остаётся на экране, а не пропадает молча */
.plan__error {
  color: var(--c-danger);
  font-size: var(--fs-caption);
}

@media (prefers-reduced-motion: reduce) {
  .plan__add {
    transition: none;
  }
}

/*
 * Десктопный план: кольцо слева, текст справа, у карточки больше воздуха.
 *
 * Эти правила обязаны идти ПОСЛЕ базовых `.plan`, `.plan__body` и `.plan__aside`:
 * у медиазапроса нет своей специфичности, поэтому «столбик» и `justify-items:
 * center`, объявленные ниже по файлу, перебивали десктопную раскладку, и план
 * всегда оставался в столбик (проверено замером `flex-direction` в браузере).
 */
@media (min-width: 768px) {
  .plan {
    padding: var(--space-6);
  }

  .plan__body {
    flex-direction: row;
    align-items: center;
    gap: var(--space-7);
    text-align: left;
  }

  .plan__aside {
    flex: 1;
    min-width: 0;
    justify-items: start;
  }
}

/* ── Виджеты ────────────────────────────────────────────────────────── */
.widgets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
}

.widget {
  gap: var(--space-1);
}

.widget__title {
  font-size: var(--fs-body);
  font-weight: 600;
}

.widget__text {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.widget__value {
  margin-top: var(--space-2);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
}

.widget__caption {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.widget__link {
  margin-top: auto;
  padding-top: var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--c-amber);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

.card--mint .widget__link {
  color: var(--c-brand);
}

/* ── Привычки ───────────────────────────────────────────────────────── */
.habits {
  gap: var(--space-4);
}

.habits__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.habits__summary {
  flex: 1;
  min-width: 0;
}

.habits__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.habits__empty {
  margin: 0;
}

.habits__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--tap-min);
  color: var(--c-brand);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
}

/* ── Достижения ─────────────────────────────────────────────────────── */
.achievements {
  gap: var(--space-4);
}

.achievements__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.achievements__summary {
  flex: 1;
  min-width: 0;
}

.achievements__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.achievement {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.achievement__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.achievement__body small {
  color: var(--c-text-muted);
}

.achievement__progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
  font-size: var(--fs-caption);
  color: var(--c-text-muted);
}

.achievement__progress :deep(.progress) {
  flex: 1;
}

.chip-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border-radius: var(--r-pill);
  background: var(--c-bg);
  color: var(--c-text);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

/* ── Совет дня ──────────────────────────────────────────────────────── */
.tip {
  gap: var(--space-3);
  padding: 0;
  overflow: hidden;
  color: var(--c-text);
  text-decoration: none;
}

.tip__more {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--c-accent);
  font-size: var(--fs-caption);
  font-weight: 600;
}

.tip__image {
  width: 100%;
  height: 160px;
  object-fit: cover;
  background: var(--c-surface-sunken);
}

.tip__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: 0 var(--space-4) var(--space-4);
}

/* ── Состояния ──────────────────────────────────────────────────────── */
.state {
  color: var(--c-text-muted);
}

.state--error {
  color: var(--c-danger);
}

/* ── Десктопные детали ──────────────────────────────────────────────────
 * На широком экране столбик из виджетов выглядел сиротливо: собираем в две
 * колонки и даём картинке совета больше места.
 */
@media (min-width: 768px) {
  .widgets {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-5);
  }

  .tip__image {
    height: 220px;
  }
}

/* ── Привычки и достижения рядом ────────────────────────────────────────
 * Две карточки одинаковой природы: короткие списки с прогрессом. В две колонки
 * они читаются лучше и не заставляют листать главную.
 */
@media (min-width: 1024px) {
  .home__pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-5);
    align-items: start;
  }

  /* Гость: привычек нет, значит достижения занимают всю ширину */
  .home__pair:has(> :only-child) {
    grid-template-columns: 1fr;
  }
}
</style>
