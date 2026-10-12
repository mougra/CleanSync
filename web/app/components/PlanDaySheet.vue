<script setup lang="ts">
/**
 * Шторка дня: план выбранного дня из календаря и сводка по нему.
 *
 * Зачем она нужна: календарь стал навигацией по дням, а плана на другие дни,
 * кроме сегодняшнего, на главной раньше не было вовсе. Здесь видно, что было
 * или будет в конкретный день, — но отметки работают только для сегодня.
 *
 * Три правила заказчика держатся в одном месте, в `canMark`: прошлые и будущие
 * дни — только просмотр (строки неинтерактивны, сверху пометка), отмечать можно
 * исключительно сегодняшний день. Данные берутся из `GET /api/tasks/calendar`
 * для одной даты, а не из кэша «сегодня», иначе числа дней перепутались бы.
 *
 * Сводка дня — это статистика поверх списка: сколько задач запланировано и
 * закрыто, минуты по плану и по факту. «Факт» показывается только для
 * today/прошедших дней: у будущего дня он всегда ноль, и строка «выполнено 0»
 * там была бы шумом, а не информацией. Распределение по зонам считается здесь
 * же из списка задач — сервер для этого ничего отдельного не отдаёт.
 */
import type { CalendarDay, CalendarResponse, CalendarTask } from '~/types/task';

const { t, locale } = useI18n();
const api = useApi();

const { open, date, closeSheet } = useDaySheet();

/**
 * Сегодняшний день считаем по UTC — так же, как сервер в `tasksDueOn`.
 *
 * Если сравнивать с локальной датой, в отрицательных часовых поясах вечером
 * «сегодня» на экране и «сегодня» на сервере разошлись бы, и шторка разрешила
 * бы отметку дня, который сервер считает прошедшим.
 */
const todayUTC = () => new Date().toISOString().slice(0, 10);

const isToday = computed(() => date.value === todayUTC());

/** Отмечать можно только сегодня: прошлое и будущее — только просмотр. */
const canMark = computed(() => isToday.value);

const { data, error } = await useAsyncData(
  'calendar-day',
  async () => {
    // Лист закрыт — запрос не нужен: лишнее обращение к API на каждой странице.
    if (!open.value) {
      return null;
    }

    try {
      return await api.request<CalendarResponse>(
        `/api/tasks/calendar?from=${date.value}&to=${date.value}`,
      );
    } catch {
      return null;
    }
  },
  { watch: [open, date] },
);

const day = computed<CalendarDay | null>(() => data.value?.days?.[0] ?? null);

/** Понятная строка ошибки вместо пустого списка: сеть могла и отказать. */
const loadFailed = computed(() => Boolean(error.value));

/** Заголовок: «Сегодня», «Вчера», «Завтра» или «Пн, 13 октября». */
const title = computed(() => {
  const target = date.value;

  if (target === todayUTC()) {
    return t('calendar.today');
  }

  if (target === toISODate(addDays(fromISODate(todayUTC()), -1))) {
    return t('calendar.yesterday');
  }

  if (target === toISODate(addDays(fromISODate(todayUTC()), 1))) {
    return t('calendar.tomorrow');
  }

  return new Intl.DateTimeFormat(locale.value, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(fromISODate(target));
});

/**
 * Локальные отметки: их видно сразу, ещё до ответа сервера.
 *
 * Накладываются поверх ответа и снимаются, когда сервер вернул то же состояние,
 * — ровно как в карточке «План на сегодня» на главной.
 */
const marks = ref<Record<number, boolean>>({});
const busy = ref<number[]>([]);
const markError = ref('');

const clearMark = (id: number) => {
  const rest: Record<number, boolean> = {};

  for (const [key, value] of Object.entries(marks.value)) {
    if (Number(key) !== id) {
      rest[Number(key)] = value;
    }
  }

  marks.value = rest;
};

const serverHasMark = (id: number, value: boolean): boolean =>
  (day.value?.tasks ?? []).some((task) => task.id === id && task.is_completed === value);

const tasks = computed(() =>
  (day.value?.tasks ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    hint: taskHint(task),
    done: marks.value[task.id] ?? task.is_completed,
  })),
);

/** Периодичность из пары «частота + интервал»: «раз в неделю», «раз в 3 месяца». */
const frequencyLabel = (task: CalendarTask): string | null => {
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

  const unit =
    locale.value === 'ru'
      ? pluralRu(count, forms[0]!, forms[1]!, forms[2]!)
      : pluralEn(count, forms[0]!, forms[2]!);

  return t('plan.repeatN', { count, unit });
};

/**
 * Краткая подпись строки: зона, минуты и периодичность.
 *
 * Без источника (названия расписания) и длинных подсказок: в шторке список
 * должен помещаться целиком, поэтому лишнее отброшено сознательно.
 */
const taskHint = (task: CalendarTask): string =>
  [
    task.room,
    frequencyLabel(task),
    task.estimated_minutes ? t('plan.minutes', { minutes: task.estimated_minutes }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

/** Местные формы для чисел сводки: у русского их три, у английского две. */
const plural = (count: number, forms: [string, string, string]): string =>
  locale.value === 'ru'
    ? pluralRu(count, forms[0], forms[1], forms[2])
    : pluralEn(count, forms[0], forms[2]);

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
 * Будущий день: отметок ещё не было по определению, поэтому «выполнено» и «факт»
 * не показываем вовсе — иначе строка «выполнено 0» выглядела бы как результат.
 */
const showFact = computed(() => date.value <= todayUTC());

/** «план 45 мин · осталось 30 мин»: остаток показываем, только когда он ненулевой. */
const minutesLabel = computed(() => {
  const total = day.value?.total_minutes ?? 0;
  const parts = [t('calendar.planMinutes', { minutes: total })];

  if (showFact.value) {
    const done = day.value?.completed_minutes ?? 0;
    parts.push(
      done > 0
        ? t('calendar.factMinutes', { minutes: done })
        : t('calendar.leftMinutes', { minutes: total }),
    );
  }

  return parts.join(' · ');
});

/**
 * Распределение по зонам: «Кухня 3 · Ванная 2».
 *
 * Считается на клиенте из списка задач дня: сервер отдаёт зону у каждой задачи,
 * отдельного поля для разбивки нет и не нужно. Задачи без зоны собираются в
 * «Без зоны», чтобы счётчик задач в строке совпадал с длиной списка.
 */
const zones = computed(() => {
  const counts = new Map<string, number>();

  for (const task of day.value?.tasks ?? []) {
    const zone = task.room?.trim() || t('calendar.noRoom');
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([zone, count]) => ({ zone, count }))
    .sort((left, right) => right.count - left.count || left.zone.localeCompare(right.zone));
});

/** Зоны показываем всегда, когда есть задачи: даже одна зона видна в примере макета. */
const showZones = computed(() => zones.value.length > 0);

/**
 * Отметка задачи в один тап — и только для сегодняшнего дня.
 *
 * Проверка стоит прямо здесь, а не только в шаблоне: строки других дней
 * неинтерактивны, но правило обязано жить и на уровне действия.
 */
const toggle = async (task: { id: number; done: boolean }) => {
  if (!canMark.value || busy.value.includes(task.id)) {
    return;
  }

  const next = !task.done;

  marks.value = { ...marks.value, [task.id]: next };
  busy.value = [...busy.value, task.id];
  markError.value = '';

  try {
    // Изменяющий запрос идёт через `useApi`: он подставляет `X-CSRF-Token`.
    await api.request(`/api/tasks/${task.id}`, {
      method: 'PUT',
      body: { is_completed: next },
    });
  } catch {
    clearMark(task.id);
    markError.value = t('plan.markFailed');
    return;
  } finally {
    busy.value = busy.value.filter((id) => id !== task.id);
  }

  // Обновляем числа дня, серию, достижения и план на главной: отметка в шторке
  // и в карточке «План на сегодня» — это одна и та же запись.
  await refreshNuxtData(['calendar-day', 'today-plan', 'streak', 'achievements-progress']);

  if (serverHasMark(task.id, next)) {
    clearMark(task.id);
  }
};

// Смена дня: накладки и ошибка прошлого дня не должны переезжать в новый.
watch(date, () => {
  marks.value = {};
  markError.value = '';
});
</script>

<template>
  <AppSheet :open="open" @close="closeSheet">
    <template #header>
      <div class="day">
        <span class="day__icon" aria-hidden="true"><i class="pi pi-calendar" /></span>
        <div class="day__heading">
          <h2 class="day__title">{{ title }}</h2>
          <p class="day__meta">
            <template v-if="day && day.total_tasks > 0">
              {{ t('calendar.planMinutes', { minutes: day.total_minutes }) }}
            </template>
            <template v-else>{{ t('calendar.nothing') }}</template>
          </p>
        </div>
      </div>
    </template>

    <div class="day__body">
      <p v-if="loadFailed" class="day__error" role="alert">{{ t('state.error') }}</p>

      <template v-else-if="day && day.tasks.length > 0">
        <!--
          Сводка дня: план и факт. Для будущего дня «выполнено» не показываем —
          там факт всегда нулевой, и строка выглядела бы результатом.
        -->
        <section class="summary" :aria-label="t('calendar.summaryTitle')">
          <p class="summary__value">{{ plannedLabel }}</p>

          <p v-if="showFact" class="summary__done">{{ doneLabel }}</p>

          <p class="summary__minutes">{{ minutesLabel }}</p>

          <!-- Распределение по зонам: «Кухня 3 · Ванная 2» -->
          <p v-if="showZones" class="summary__zones">
            <span class="summary__zones-label">{{ t('calendar.zonesTitle') }}</span>
            <span v-for="zone in zones" :key="zone.zone" class="summary__zone">
              {{ zone.zone }} {{ zone.count }}
            </span>
          </p>
        </section>

        <!-- Прошлое и будущее — только просмотр: об этом говорим прямо -->
        <p v-if="!canMark" class="day__view-only">
          <i class="pi pi-eye" aria-hidden="true" />
          {{ t('calendar.viewOnly') }}
        </p>

        <p v-else class="day__view-only day__view-only--today">
          <i class="pi pi-check-circle" aria-hidden="true" />
          {{ t('calendar.markOnlyToday') }}
        </p>

        <ul class="day__list">
          <li v-for="task in tasks" :key="task.id">
            <!-- Сегодня — та же интерактивная строка, что и в плане на главной -->
            <TaskRow
              v-if="canMark"
              interactive
              :title="task.title"
              :hint="task.hint"
              :done="task.done"
              :disabled="busy.includes(task.id)"
              @toggle="toggle(task)"
            />

            <!-- Другой день: строка без кнопки и без отметки, только просмотр -->
            <TaskRow
              v-else
              :title="task.title"
              :hint="task.hint"
              :done="task.done"
            />
          </li>
        </ul>
      </template>

      <p v-else class="day__empty">{{ t('calendar.emptyDay') }}</p>

      <p v-if="markError" class="day__error" role="alert">{{ markError }}</p>
    </div>
  </AppSheet>
</template>

<style scoped>
.day {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.day__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: var(--r-chip);
  background: var(--c-surface);
  color: var(--c-brand);
}

.day__heading {
  min-width: 0;
}

.day__title {
  font-size: var(--fs-title);
  text-transform: capitalize;
}

.day__meta {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.day__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ── Сводка дня ───────────────────────────────────────────────────────── */
.summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface);
}

.summary__value {
  margin: 0;
  font-weight: 600;
}

.summary__done,
.summary__minutes {
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

.day__view-only {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--r-chip);
  background: var(--c-surface-sunken);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.day__view-only--today {
  background: var(--c-surface-mint);
  color: var(--c-brand);
}

.day__empty {
  padding: var(--space-5) 0;
  color: var(--c-text-muted);
  text-align: center;
}

.day__error {
  margin: 0;
  color: var(--c-danger);
  font-size: var(--fs-caption);
}

.day__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
