<script setup lang="ts">
/**
 * Дома и участники — экран по макету docs/design/mockups/дома и участники.jpg.
 *
 * Сверху вниз: заголовок со стрелкой назад, карточка дома с подписью о роли,
 * участники с ролями и статистикой, зоны, общий план и закреплённая кнопка
 * «Добавить участника». Домов может быть несколько: переключатель появляется,
 * когда их больше одного, а кнопка-контур добавляет ещё один.
 *
 * Роли простые: владелец («главный») раскидывает задачи и управляет составом,
 * участник видит всё, берёт задачи себе и отмечает выполненное. Приглашение —
 * по коду или ссылке вида /household?code=XXXX.
 */
const { t, locale } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const auth = useAuthStore();

const {
  households,
  selected,
  selectedHouseholdId,
  members,
  plan,
  zones,
  isOwner,
  createHousehold,
  joinHousehold,
  renameHousehold,
  leaveHousehold,
  removeMember,
  createList,
  addTask,
  updateTask,
  deleteTask,
  toggleTask,
  nudge,
} = await useHousehold();

const busy = ref(false);
const notice = ref('');
const failure = ref(false);

const showCreateForm = ref(false);
const showJoinForm = ref(false);
const newName = ref('');
const joinCode = ref(String(route.query.code ?? '').toUpperCase());
const listTitle = ref('');

const renameHouseholdId = ref<number | null>(null);
const renameValue = ref('');

const inviteHouseholdId = ref<number | null>(null);
const actionsMemberId = ref<number | null>(null);

const draft = reactive<Record<number, string>>({});

/** Дом, к которому относится открытая шторка. */
const inviteEntry = computed(
  () => households.value.find((entry) => entry.household.id === inviteHouseholdId.value) ?? null,
);

const actionsMember = computed(
  () => members.value.find((member) => member.id === actionsMemberId.value) ?? null,
);

const inviteLink = computed(() => {
  if (!inviteEntry.value) {
    return '';
  }

  const host = window.location.origin;

  return `${host}${localePath('/household')}?code=${inviteEntry.value.household.inviteCode}`;
});

const displayName = (member: { username: string | null; email: string }) =>
  member.username || member.email.split('@')[0] || member.email;

const initials = (member: { username: string | null; email: string }) =>
  displayName(member).slice(0, 1).toUpperCase();

const memberName = (id: number | null) => {
  if (id === null) {
    return '';
  }

  const member = members.value.find((item) => item.id === id);

  return member ? displayName(member) : '';
};

const roleLabel = (member: { role: 'owner' | 'member' }) =>
  member.role === 'owner' ? t('household.roleAdmin') : t('household.roleParticipant');

/** Общая обёртка: гасим «залипшие» кнопки и показываем понятный текст ошибки. */
const run = async (action: () => Promise<unknown>, successMessage = '') => {
  busy.value = true;
  notice.value = '';
  failure.value = false;

  try {
    await action();
    notice.value = successMessage;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    failure.value = true;
    notice.value = status === 429 ? t('household.nudgeTooOften') : t('state.error');
  } finally {
    busy.value = false;
  }
};

const onCreate = () =>
  run(async () => {
    await createHousehold(newName.value.trim());
    newName.value = '';
    showCreateForm.value = false;
  });

const onJoin = () =>
  run(async () => {
    await joinHousehold(joinCode.value.trim().toUpperCase());
    joinCode.value = '';
    showJoinForm.value = false;
  });

const openRename = (householdId: number, name: string) => {
  renameHouseholdId.value = householdId;
  renameValue.value = name;
};

const onRename = () => {
  const householdId = renameHouseholdId.value;

  if (householdId === null) {
    return;
  }

  return run(async () => {
    await renameHousehold(renameValue.value.trim(), householdId);
    renameHouseholdId.value = null;
  });
};

const onOpenInvite = (householdId: number) => {
  inviteHouseholdId.value = householdId;
};

const onCopyInvite = async () => {
  try {
    await navigator.clipboard.writeText(inviteLink.value);
    notice.value = t('household.copied');
    failure.value = false;
  } catch {
    failure.value = true;
    notice.value = t('household.copyFailed');
  }
};

const onAddTask = (scheduleId: number) => {
  const title = (draft[scheduleId] ?? '').trim();

  if (!title) {
    return;
  }

  return run(async () => {
    await addTask(scheduleId, { title });
    draft[scheduleId] = '';
  });
};

const onAddList = () => {
  const householdId = selected.value?.household.id;

  if (householdId === undefined || !listTitle.value.trim()) {
    return;
  }

  return run(async () => {
    await createList(listTitle.value.trim(), householdId);
    listTitle.value = '';
  });
};

/** Назначение ответственного: владелец — любому, участник — себе. */
const onAssign = (taskId: number, assigneeId: number | null) =>
  run(() => updateTask(taskId, { assigneeId }));

/** Отметка выполнения идёт общим маршрутом задач: он же считает серию. */
const onToggle = (taskId: number, isCompleted: boolean) =>
  run(() => toggleTask(taskId, isCompleted));

const onDeleteTask = (taskId: number) => run(() => deleteTask(taskId));

const onNudge = (userId: number, householdId: number) =>
  run(async () => {
    await nudge(userId, householdId);
    actionsMemberId.value = null;
  }, t('household.nudgeSent'));

const onRemoveMember = (userId: number, name: string, householdId: number) => {
  if (!window.confirm(t('household.removeConfirm', { name }))) {
    return;
  }

  return run(async () => {
    await removeMember(userId, householdId);
    actionsMemberId.value = null;
  });
};

const onLeave = (householdId: number) => {
  if (!window.confirm(t('household.leaveConfirm'))) {
    return;
  }

  return run(async () => {
    await leaveHousehold(householdId);
  });
};

/**
 * Приглашение по ссылке: `?code=XXXX` автоматически вступает в дом.
 * `?home=ID` открывает конкретный дом — так приходит ссылка с главной.
 * Ошибку показываем общей подсказкой: код мог быть уже использован.
 */
onMounted(() => {
  const homeId = Number(route.query.home);
  const code = String(route.query.code ?? '').trim().toUpperCase();

  if (Number.isInteger(homeId) && homeId > 0) {
    selectedHouseholdId.value = homeId;
  }

  if (code) {
    run(() => joinHousehold(code));
  }
});

useSeoMeta({ title: () => t('household.title'), robots: 'noindex, nofollow' });
</script>

<template>
  <div class="house">
    <header class="house__head">
      <NuxtLink :to="localePath('/')" class="house__back" :aria-label="t('error.home')">
        <i class="pi pi-arrow-left" aria-hidden="true" />
      </NuxtLink>
      <h1 class="house__title">{{ t('household.title') }}</h1>
    </header>

    <p v-if="!auth.isAuthenticated" class="house__hint">
      {{ t('household.needAuth') }}
      <NuxtLink :to="localePath('/login')">{{ t('auth.login') }}</NuxtLink>
    </p>

    <template v-else>
      <!-- Переключатель: появляется, когда домов больше одного -->
      <label v-if="households.length > 1" class="switch">
        <span class="switch__label">{{ t('household.name') }}</span>
        <select v-model="selectedHouseholdId" class="switch__select">
          <option v-for="entry in households" :key="entry.household.id" :value="entry.household.id">
            {{ entry.household.name }}
          </option>
        </select>
      </label>

      <!-- Карточки домов -->
      <article v-for="entry in households" :key="entry.household.id" class="card home-card">
        <span class="home-card__icon" aria-hidden="true"><i class="pi pi-home" /></span>

        <div class="home-card__text">
          <p class="home-card__name">{{ entry.household.name }}</p>
          <p class="home-card__role">
            {{ entry.role === 'owner' ? t('household.subtitleOwner') : t('household.subtitleMember') }}
          </p>
        </div>

        <button
          v-if="entry.role === 'owner'"
          type="button"
          class="icon-btn"
          :aria-label="t('household.rename')"
          @click="openRename(entry.household.id, entry.household.name)"
        >
          <i class="pi pi-pencil" aria-hidden="true" />
        </button>
      </article>

      <!-- Участники выбранного дома -->
      <template v-if="selected">
        <section class="house__section">
          <header class="house__section-head">
            <h2 class="house__section-title">{{ t('household.membersTitle') }}</h2>
            <span class="count">{{ selected.members.length }}</span>
          </header>

          <ul class="people">
            <li v-for="member in selected.members" :key="member.id" class="person">
              <span class="person__avatar">
                <img
                  v-if="member.avatar_url"
                  class="person__image"
                  :src="member.avatar_url"
                  alt=""
                  width="48"
                  height="48"
                >
                <span v-else class="person__initials">{{ initials(member) }}</span>
              </span>

              <div class="person__text">
                <p class="person__name">{{ displayName(member) }}</p>
                <p class="person__role">{{ roleLabel(member) }}</p>
              </div>

              <button
                v-if="isOwner && member.id !== auth.user?.id"
                type="button"
                class="icon-btn icon-btn--mint"
                :aria-label="t('household.remove')"
                @click="actionsMemberId = member.id"
              >
                <i class="pi pi-pencil" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>

        <!-- Кто что делает: сегодня, за неделю, в работе -->
        <section class="card">
          <h2 class="card__title">{{ t('household.members') }}</h2>

          <ul class="activity">
            <li v-for="member in selected.members" :key="member.id" class="activity__row">
              <span class="activity__name">{{ displayName(member) }}</span>
              <span class="activity__stats">
                {{ t('household.memberToday') }}: <strong>{{ member.today_done }}</strong> ·
                {{ t('household.memberWeek') }}: <strong>{{ member.week_done }}</strong> ·
                {{ t('household.memberOpen') }}: <strong>{{ member.open_assigned }}</strong>
              </span>
            </li>
          </ul>
        </section>

        <!-- Зоны -->
        <section v-if="zones.length" class="card">
          <h2 class="card__title">{{ t('household.zones') }}</h2>

          <ul class="zones">
            <li v-for="zone in zones" :key="zone.room" class="zone">
              <span class="zone__name">{{ zone.room }}</span>
              <span class="zone__count">{{ zone.done }} / {{ zone.total }}</span>
            </li>
          </ul>
        </section>

        <!-- Общий план -->
        <section v-for="list in plan" :key="list.id" class="card">
          <h2 class="card__title">{{ list.title }}</h2>

          <ul v-if="list.tasks.length" class="tasks">
            <li v-for="task in list.tasks" :key="task.id" class="task" :class="{ 'task--done': task.is_completed }">
              <label class="task__check">
                <input
                  type="checkbox"
                  :checked="task.is_completed"
                  :disabled="busy"
                  @change="onToggle(task.id, !task.is_completed)"
                >
                <span class="task__title">{{ task.title }}</span>
              </label>

              <p class="task__meta">
                <span v-if="task.room" class="task__chip">{{ task.room }}</span>
                <span v-if="task.estimated_minutes" class="task__chip">
                  {{ formatMinutes(task.estimated_minutes, locale) }}
                </span>
                <span v-if="task.assignee_id" class="task__chip task__chip--who">
                  {{ memberName(task.assignee_id) }}
                </span>
                <span v-if="task.completed_by" class="task__chip task__chip--done">
                  {{ t('household.doneBy') }} {{ memberName(task.completed_by) }}
                </span>
              </p>

              <div class="task__actions">
                <select
                  v-if="isOwner"
                  class="task__assign"
                  :value="task.assignee_id ?? ''"
                  :disabled="busy"
                  @change="onAssign(task.id, ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)"
                >
                  <option value="">{{ t('household.unassigned') }}</option>
                  <option v-for="member in members" :key="member.id" :value="member.id">
                    {{ displayName(member) }}
                  </option>
                </select>

                <AppButton
                  v-else-if="!task.assignee_id"
                  variant="outline"
                  :disabled="busy"
                  @click="onAssign(task.id, auth.user?.id ?? null)"
                >
                  {{ t('household.take') }}
                </AppButton>

                <button
                  type="button"
                  class="icon-btn"
                  :aria-label="t('checklists.delete')"
                  :disabled="busy"
                  @click="onDeleteTask(task.id)"
                >
                  <i class="pi pi-trash" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ul>

          <p v-else class="card__text">{{ t('household.noTasks') }}</p>

          <div class="add">
            <input
              v-model="draft[list.id]"
              class="field__input"
              type="text"
              :placeholder="t('household.taskPlaceholder')"
              @keyup.enter="onAddTask(list.id)"
            >
            <AppButton
              variant="outline"
              block
              :disabled="busy || !(draft[list.id] ?? '').trim()"
              @click="onAddTask(list.id)"
            >
              {{ t('household.addTask') }}
            </AppButton>
          </div>
        </section>

        <!-- Новый список общего плана -->
        <section class="card">
          <h2 class="card__title">{{ t('household.newList') }}</h2>
          <div class="add">
            <input
              v-model="listTitle"
              class="field__input"
              type="text"
              :placeholder="t('household.listPlaceholder')"
              @keyup.enter="onAddList"
            >
            <AppButton
              variant="outline"
              block
              :disabled="busy || !listTitle.trim()"
              @click="onAddList"
            >
              {{ t('household.addList') }}
            </AppButton>
          </div>
        </section>

        <!-- Управление домом: переименовать, выйти -->
        <section class="card">
          <h2 class="card__title">{{ t('household.rename') }}</h2>

          <div class="home-actions">
            <AppButton
              v-if="isOwner"
              variant="outline"
              :disabled="busy"
              @click="openRename(selected.household.id, selected.household.name)"
            >
              {{ t('household.rename') }}
            </AppButton>

            <AppButton variant="outline" :disabled="busy" @click="onLeave(selected.household.id)">
              {{ t('household.leave') }}
            </AppButton>
          </div>

          <p class="card__text">
            {{ isOwner ? t('household.leaveOwnerHint') : t('household.leaveHint') }}
          </p>
        </section>
      </template>

      <!-- Создать или присоединиться по коду -->
      <section v-if="showCreateForm || !households.length" class="card">
        <h2 class="card__title">{{ t('household.createTitle') }}</h2>
        <p class="card__text">{{ t('household.createHint') }}</p>

        <label class="field">
          <span class="field__label">{{ t('household.name') }}</span>
          <input v-model="newName" class="field__input" type="text" :placeholder="t('household.namePlaceholder')" >
        </label>

        <AppButton variant="filled" block :disabled="busy || !newName.trim()" @click="onCreate">
          {{ t('household.create') }}
        </AppButton>
      </section>

      <section v-if="showJoinForm || !households.length" class="card">
        <h2 class="card__title">{{ t('household.joinTitle') }}</h2>
        <p class="card__text">{{ t('household.joinHint') }}</p>

        <label class="field">
          <span class="field__label">{{ t('household.code') }}</span>
          <input v-model="joinCode" class="field__input field__input--code" type="text" maxlength="8" >
        </label>

        <AppButton variant="outline" block :disabled="busy || !joinCode.trim()" @click="onJoin">
          {{ t('household.join') }}
        </AppButton>
      </section>

      <!-- Добавить ещё один дом: кнопка-контур из макета -->
      <AppButton
        v-if="households.length && !showCreateForm"
        variant="outline"
        block
        :disabled="busy"
        @click="showCreateForm = true"
      >
        <i class="pi pi-plus-circle" aria-hidden="true" />
        {{ t('household.addAnother') }}
      </AppButton>

      <p v-if="notice" class="house__notice" :class="{ 'house__notice--error': failure }">{{ notice }}</p>

      <!-- Закреплённая кнопка «Добавить участника» -->
      <div v-if="households.length" class="action-bar">
        <AppButton
          variant="filled"
          block
          :disabled="busy"
          @click="onOpenInvite(selected?.household.id ?? households[0]!.household.id)"
        >
          <i class="pi pi-user-plus" aria-hidden="true" />
          {{ t('household.addMember') }}
        </AppButton>
      </div>
    </template>

    <!-- Карандаш владельца: переименование дома -->
    <AppSheet :open="renameHouseholdId !== null" @close="renameHouseholdId = null">
      <template #header>
        <h2 class="sheet__title">{{ t('household.renameTitle') }}</h2>
      </template>

      <label class="field">
        <span class="field__label">{{ t('household.name') }}</span>
        <input v-model="renameValue" class="field__input" type="text" :placeholder="t('household.namePlaceholder')" >
      </label>

      <AppButton variant="filled" block :disabled="busy || !renameValue.trim()" @click="onRename">
        {{ t('state.save') }}
      </AppButton>
    </AppSheet>

    <!-- Карандаш у участника: напомнить или убрать из дома -->
    <AppSheet :open="actionsMember !== null" @close="actionsMemberId = null">
      <template #header>
        <h2 class="sheet__title">{{ actionsMember ? displayName(actionsMember) : '' }}</h2>
      </template>

      <div class="sheet-actions">
        <AppButton
          variant="outline"
          block
          :disabled="busy"
          @click="actionsMember && onNudge(actionsMember.id, selected?.household.id ?? 0)"
        >
          {{ t('household.nudge') }}
        </AppButton>

        <AppButton
          variant="outline"
          block
          :disabled="busy"
          @click="actionsMember && onRemoveMember(actionsMember.id, displayName(actionsMember), selected?.household.id ?? 0)"
        >
          {{ t('household.remove') }}
        </AppButton>
      </div>
    </AppSheet>

    <!-- Шторка приглашения: код, ссылка и копирование -->
    <AppSheet :open="inviteEntry !== null" @close="inviteHouseholdId = null">
      <template #header>
        <h2 class="sheet__title">{{ t('household.inviteSheetTitle') }}</h2>
      </template>

      <p class="sheet__text">{{ t('household.inviteSheetHint') }}</p>

      <div class="invite">
        <p class="invite__label">{{ t('household.invite') }}</p>
        <p class="invite__code">{{ inviteEntry?.household.inviteCode }}</p>
      </div>

      <p class="invite__label">{{ t('household.inviteLink') }}</p>
      <p class="invite__link">{{ inviteLink }}</p>

      <AppButton variant="filled" block :disabled="busy" @click="onCopyInvite">
        {{ t('household.copyLink') }}
      </AppButton>
    </AppSheet>
  </div>
</template>

<style scoped>
.house {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-bottom: var(--space-5);
}

.house__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.house__back {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  border-radius: var(--r-pill);
  color: var(--c-text);
  text-decoration: none;
}

.house__back:hover {
  background: var(--c-surface-sunken);
}

.house__title {
  font-size: var(--fs-display);
}

.house__hint {
  color: var(--c-text-muted);
}

.house__hint a {
  color: var(--c-brand);
}

/* Переключатель домов */
.switch {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.switch__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.switch__select {
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
}

/* Карточка дома */
.home-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.home-card__icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  border-radius: var(--r-thumb);
  background: var(--c-surface-mint);
  color: var(--c-brand);
  font-size: 1.5rem;
}

.home-card__text {
  flex: 1;
  min-width: 0;
}

.home-card__name {
  font-size: var(--fs-title);
  font-weight: 700;
}

.home-card__role {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

/* Круглая кнопка-иконка (карандаш, корзина) */
.icon-btn {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  flex: 0 0 var(--tap-min);
  border: none;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--c-text);
  font-size: 1.125rem;
  cursor: pointer;
}

.icon-btn:hover:not(:disabled) {
  background: var(--c-surface-sunken);
}

.icon-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.icon-btn--mint {
  background: var(--c-surface-mint);
  color: var(--c-text);
}

.icon-btn--mint:hover:not(:disabled) {
  background: var(--c-surface-sunken);
}

/* Участники */
.house__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.house__section-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.house__section-title {
  font-size: var(--fs-display);
}

.count {
  display: grid;
  place-items: center;
  min-width: 36px;
  height: 36px;
  padding: 0 var(--space-2);
  border-radius: var(--r-pill);
  background: var(--c-surface-mint);
  color: var(--c-text);
  font-size: var(--fs-caption);
  font-weight: 700;
}

.people {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.person {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--r-card);
  background: var(--c-surface);
  box-shadow: var(--shadow-card);
}

.person__avatar {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  overflow: hidden;
  border-radius: var(--r-pill);
  background: var(--c-surface-mint);
  color: var(--c-brand);
  font-weight: 700;
}

.person__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.person__text {
  flex: 1;
  min-width: 0;
}

.person__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person__role {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

/* Кто что делает */
.activity {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.activity__row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.activity__name {
  font-weight: 600;
}

.activity__stats {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

/* Зоны */
.zones {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.zone {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  background: var(--c-surface-warm);
  font-size: var(--fs-caption);
}

.zone__count {
  color: var(--c-text-muted);
}

/* Задачи общего плана */
.tasks {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.task {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--c-border);
}

.task:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.task__check {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  cursor: pointer;
}

.task__check input {
  width: 20px;
  height: 20px;
  accent-color: var(--c-brand);
}

.task--done .task__title {
  color: var(--c-text-muted);
  text-decoration: line-through;
}

.task__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.task__chip {
  padding: 2px var(--space-2);
  border-radius: 999px;
  background: var(--c-surface-warm);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.task__chip--who {
  background: var(--c-brand-soft);
  color: var(--c-brand);
}

.task__chip--done {
  background: var(--c-surface-mint);
  color: var(--c-text);
}

.task__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.task__assign {
  min-height: var(--tap-min);
  padding: 0 var(--space-2);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  font-size: var(--fs-caption);
}

.add {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.field__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.field__input {
  min-height: var(--tap-min);
  padding: 0 var(--space-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-row);
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  width: 100%;
}

.field__input--code {
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.home-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

/* Шторки */
.sheet__title {
  font-size: var(--fs-title);
}

.sheet__text {
  margin-bottom: var(--space-3);
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.sheet-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.invite {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface-mint);
}

.invite__label {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.invite__code {
  font-size: var(--fs-title);
  font-weight: 700;
  letter-spacing: 0.12em;
}

.invite__link {
  margin-bottom: var(--space-4);
  overflow-wrap: anywhere;
  color: var(--c-brand);
  font-size: var(--fs-caption);
}

.house__notice {
  padding: var(--space-3);
  border-radius: var(--r-row);
  background: var(--c-surface-mint);
  font-size: var(--fs-caption);
}

.house__notice--error {
  background: var(--c-surface-warm);
  color: var(--c-danger);
}

/* Закреплённая кнопка «Добавить участника» над нижней навигацией */
.action-bar {
  position: fixed;
  right: var(--space-4);
  bottom: calc(88px + var(--space-2) + env(safe-area-inset-bottom));
  left: var(--space-4);
  z-index: 15;
  max-width: calc(var(--content-max) - var(--space-4) * 2);
  margin: 0 auto;
}

@media (min-width: 768px) {
  .action-bar {
    position: static;
    max-width: none;
    margin: 0;
  }
}
</style>
