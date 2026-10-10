<script setup lang="ts">
/**
 * Дом: семья, зоны и общий план.
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
  household,
  members,
  plan,
  zones,
  isOwner,
  hasHousehold,
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

const newName = ref('');
const joinCode = ref(String(route.query.code ?? '').toUpperCase());
const listTitle = ref('');
const renameValue = ref('');
const renaming = ref(false);

const draft = reactive<Record<number, { title: string; room: string; minutes: number; assigneeId: string }>>({});

const draftFor = (scheduleId: number) => {
  if (!draft[scheduleId]) {
    draft[scheduleId] = { title: '', room: '', minutes: 15, assigneeId: '' };
  }

  return draft[scheduleId];
};

const inviteLink = computed(() =>
  household.value ? `${window.location.origin}${localePath('/household')}?code=${household.value.inviteCode}` : '',
);

const displayName = (member: { username: string | null; email: string }) =>
  member.username || member.email.split('@')[0] || member.email;

const memberName = (id: number | null) => {
  if (id === null) {
    return '';
  }

  const member = members.value.find((item) => item.id === id);

  return member ? displayName(member) : '';
};

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
  });

const onJoin = () =>
  run(async () => {
    await joinHousehold(joinCode.value.trim().toUpperCase());
    joinCode.value = '';
  });

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

const onRename = () =>
  run(async () => {
    await renameHousehold(renameValue.value.trim());
    renaming.value = false;
  });

const onAddList = () =>
  run(async () => {
    await createList(listTitle.value.trim());
    listTitle.value = '';
  });

const onAddTask = (scheduleId: number) => {
  const form = draftFor(scheduleId);

  if (!form.title.trim()) {
    return;
  }

  return run(async () => {
    await addTask(scheduleId, {
      title: form.title.trim(),
      room: form.room.trim() || undefined,
      minutes: form.minutes,
      assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
    });
    draft[scheduleId] = { title: '', room: '', minutes: 15, assigneeId: '' };
  });
};

const onAssign = (taskId: number, value: string) =>
  run(() => updateTask(taskId, { assigneeId: value ? Number(value) : null }));

const onNudge = (userId: number) => run(() => nudge(userId), t('household.nudgeSent'));

const onRemoveMember = (userId: number, name: string) => {
  if (!window.confirm(t('household.removeConfirm', { name }))) {
    return;
  }

  return run(() => removeMember(userId));
};

const onLeave = () => {
  if (!window.confirm(t('household.leaveConfirm'))) {
    return;
  }

  return run(() => leaveHousehold());
};

watch(
  household,
  (value) => {
    if (value) {
      renameValue.value = value.name;
    }
  },
  { immediate: true },
);

useSeoMeta({ title: () => t('household.title'), robots: 'noindex, nofollow' });
</script>

<template>
  <div class="house">
    <h1 class="house__title">{{ t('household.title') }}</h1>

    <p v-if="!auth.isAuthenticated" class="house__hint">
      {{ t('household.needAuth') }}
      <NuxtLink :to="localePath('/login')">{{ t('auth.login') }}</NuxtLink>
    </p>

    <template v-else>
      <!-- Дома ещё нет: создать или присоединиться по коду -->
      <template v-if="!hasHousehold">
        <section class="card">
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

        <section class="card">
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
      </template>

      <!-- Дом есть -->
      <template v-else>
        <section class="card house__head">
          <div class="house__head-top">
            <div>
              <h2 class="card__title">{{ household?.name }}</h2>
              <AppBadge :label="isOwner ? t('household.roleOwner') : t('household.roleMember')" />
            </div>

            <AppButton v-if="isOwner && !renaming" variant="outline" @click="renaming = true">
              {{ t('household.rename') }}
            </AppButton>
          </div>

          <div v-if="renaming" class="house__rename">
            <input v-model="renameValue" class="field__input" type="text" >
            <AppButton variant="filled" :disabled="busy" @click="onRename">
              {{ t('state.save') }}
            </AppButton>
          </div>

          <div class="invite">
            <p class="invite__label">{{ t('household.invite') }}</p>
            <p class="invite__code">{{ household?.inviteCode }}</p>
            <AppButton variant="outline" @click="onCopyInvite">{{ t('household.copyLink') }}</AppButton>
          </div>
        </section>

        <!-- Кто что делает -->
        <section class="card">
          <h2 class="card__title">{{ t('household.members') }}</h2>

          <ul class="members">
            <li v-for="member in members" :key="member.id" class="member">
              <div class="member__info">
                <p class="member__name">
                  {{ displayName(member) }}
                  <AppBadge v-if="member.role === 'owner'" :label="t('household.roleOwner')" />
                </p>
                <p class="member__stats">
                  {{ t('household.memberToday') }}: <strong>{{ member.today_done }}</strong> ·
                  {{ t('household.memberWeek') }}: <strong>{{ member.week_done }}</strong> ·
                  {{ t('household.memberOpen') }}: <strong>{{ member.open_assigned }}</strong>
                </p>
              </div>

              <div class="member__actions">
                <AppButton
                  v-if="member.id !== auth.user?.id"
                  variant="outline"
                  :disabled="busy"
                  @click="onNudge(member.id)"
                >
                  {{ t('household.nudge') }}
                </AppButton>

                <AppButton
                  v-if="isOwner && member.role !== 'owner'"
                  variant="outline"
                  :disabled="busy"
                  @click="onRemoveMember(member.id, displayName(member))"
                >
                  {{ t('household.remove') }}
                </AppButton>
              </div>
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
                  @change="toggleTask(task.id, !task.is_completed)"
                >
                <span class="task__title">{{ task.title }}</span>
              </label>

              <p class="task__meta">
                <span v-if="task.room" class="task__chip">{{ task.room }}</span>
                <span v-if="task.estimated_minutes" class="task__chip">{{ formatMinutes(task.estimated_minutes, locale) }}</span>
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
                  @change="onAssign(task.id, ($event.target as HTMLSelectElement).value)"
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
                  @click="onAssign(task.id, String(auth.user?.id))"
                >
                  {{ t('household.take') }}
                </AppButton>

                <AppButton variant="outline" :disabled="busy" @click="deleteTask(task.id)">
                  <i class="pi pi-trash" aria-hidden="true" />
                </AppButton>
              </div>
            </li>
          </ul>

          <p v-else class="card__text">{{ t('household.noTasks') }}</p>

          <div class="add">
            <input
              v-model="draftFor(list.id).title"
              class="field__input"
              type="text"
              :placeholder="t('household.taskPlaceholder')"
              @keyup.enter="onAddTask(list.id)"
            >
            <div class="add__row">
              <input v-model="draftFor(list.id).room" class="field__input" type="text" :placeholder="t('household.roomPlaceholder')" >
              <input v-model.number="draftFor(list.id).minutes" class="field__input field__input--num" type="number" min="0" max="600" step="5" >
              <select v-if="isOwner" v-model="draftFor(list.id).assigneeId" class="task__assign">
                <option value="">{{ t('household.unassigned') }}</option>
                <option v-for="member in members" :key="member.id" :value="member.id">
                  {{ displayName(member) }}
                </option>
              </select>
            </div>
            <AppButton
              variant="outline"
              block
              :disabled="busy || !draftFor(list.id).title.trim()"
              @click="onAddTask(list.id)"
            >
              {{ t('household.addTask') }}
            </AppButton>
          </div>
        </section>

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
            <AppButton variant="outline" block :disabled="busy || !listTitle.trim()" @click="onAddList">
              {{ t('household.addList') }}
            </AppButton>
          </div>
        </section>

        <section class="card card--danger">
          <h2 class="card__title">{{ t('household.leaveTitle') }}</h2>
          <p class="card__text">
            {{ isOwner ? t('household.leaveOwnerHint') : t('household.leaveHint') }}
          </p>
          <AppButton variant="outline" block :disabled="busy" @click="onLeave">
            {{ t('household.leave') }}
          </AppButton>
        </section>
      </template>

      <p v-if="notice" class="house__notice" :class="{ 'house__notice--error': failure }">{{ notice }}</p>
    </template>
  </div>
</template>

<style scoped>
.house {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-bottom: var(--space-5);
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

.house__head-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.house__rename {
  display: flex;
  gap: var(--space-2);
}

.invite {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
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

.members {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.member {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.member__name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
}

.member__stats {
  color: var(--c-text-muted);
  font-size: var(--fs-caption);
}

.member__actions {
  display: flex;
  gap: var(--space-1);
}

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

.add__row {
  display: flex;
  gap: var(--space-2);
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

.field__input--num {
  max-width: 90px;
}

.field__input--code {
  letter-spacing: 0.2em;
  text-transform: uppercase;
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
</style>
