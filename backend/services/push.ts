import webpush from 'web-push';
import pool from '../db';
import { isHabitDue, todayIso } from './habitSchedule';

/**
 * Web Push для напоминаний о привычках.
 *
 * VAPID-ключи живут в окружении: без них push просто выключен, сервер
 * продолжает работать (важно для локальной разработки и тестов).
 * Ключи генерируются один раз: `npx web-push generate-vapid-keys`.
 */

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface SubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
const privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
const subject = process.env.VAPID_SUBJECT ?? 'mailto:noreply@example.com';

const configured = Boolean(publicKey && privateKey);

if (configured) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
  console.warn(
    'VAPID-ключи не заданы — напоминания выключены. Сгенерируйте их: npx web-push generate-vapid-keys'
  );
}

export const pushPublicKey = (): string => publicKey;
export const isPushConfigured = (): boolean => configured;

/** Подписки пользователя; мёртвые (404/410) удаляем сразу. */
const sendToSubscriptions = async (
  subscriptions: SubscriptionRow[],
  payload: PushPayload
): Promise<number> => {
  let delivered = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload)
      );

      delivered += 1;
      await pool.query(
        'UPDATE push_subscriptions SET last_success_at = CURRENT_TIMESTAMP, failed_count = 0 WHERE id = $1',
        [subscription.id]
      );
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;

      if (status === 404 || status === 410) {
        // Браузер отозвал подписку — держать её бессмысленно.
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [subscription.id]);
        continue;
      }

      console.error('Не удалось отправить push:', status ?? (error as Error).message);
      await pool.query(
        `UPDATE push_subscriptions
            SET last_error_at = CURRENT_TIMESTAMP, failed_count = failed_count + 1
          WHERE id = $1`,
        [subscription.id]
      );
    }
  }

  return delivered;
};

export const sendPushToUser = async (userId: number | string, payload: PushPayload) => {
  if (!configured) {
    return 0;
  }

  const result = await pool.query<SubscriptionRow>(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );

  return sendToSubscriptions(result.rows, payload);
};

/**
 * Один проход планировщика: напоминания, время которых пришло.
 *
 * Берём привычки, где напоминание включено, сегодня ещё не отмечено и время
 * уже наступило, а само дело актуально по периоду. `last_reminded_on` не даёт
 * отправить одно и то же напоминание дважды за день.
 */
export const runReminderPass = async (): Promise<number> => {
  if (!configured) {
    return 0;
  }

  const today = todayIso();

  const due = await pool.query<{
    id: number;
    user_id: number;
    title: string;
    zone: string | null;
    interval_count: number;
    interval_unit: string;
    due_date: string | null;
    created_at: string;
    completions: string[];
  }>(
    `SELECT h.id, h.user_id, h.title, h.zone, h.interval_count, h.interval_unit,
            h.due_date::text AS due_date, h.created_at::text AS created_at,
            COALESCE(
              (SELECT array_agg(c.completed_on::text ORDER BY c.completed_on DESC)
                 FROM habit_completions c WHERE c.user_habit_id = h.id),
              ARRAY[]::text[]
            ) AS completions
       FROM user_habits h
      WHERE h.reminder_enabled = TRUE
        AND h.archived_at IS NULL
        AND h.reminder_time IS NOT NULL
        AND h.reminder_time <= LOCALTIME
        AND (h.last_reminded_on IS NULL OR h.last_reminded_on < CURRENT_DATE)
        AND NOT EXISTS (
          SELECT 1 FROM habit_completions c
           WHERE c.user_habit_id = h.id AND c.completed_on = CURRENT_DATE
        )`
  );

  let sent = 0;

  for (const habit of due.rows) {
    if (!isHabitDue(habit, today)) {
      continue;
    }

    const delivered = await sendPushToUser(habit.user_id, {
      title: 'Пора отметить привычку',
      body: habit.zone ? `${habit.title} · ${habit.zone}` : habit.title,
      url: '/habits',
      tag: `habit-${habit.id}`,
    });

    // Отмечаем попытку независимо от результата: без подписки спамить незачем.
    if (delivered > 0) {
      sent += delivered;
    }

    await pool.query('UPDATE user_habits SET last_reminded_on = CURRENT_DATE WHERE id = $1', [
      habit.id,
    ]);
  }

  if (sent > 0) {
    console.log(`Напоминания отправлены: ${sent}`);
  }

  return sent;
};

/** Планировщик: проверяем раз в пять минут, останавливается вместе с процессом. */
export const startReminderScheduler = (): NodeJS.Timeout | null => {
  if (!configured) {
    return null;
  }

  const intervalMs = 5 * 60 * 1000;

  const timer = setInterval(() => {
    runReminderPass().catch((error) => console.error('Планировщик напоминаний:', error));
  }, intervalMs);

  // Не держим процесс живым только из-за таймера.
  timer.unref?.();

  console.log('Планировщик напоминаний запущен (каждые 5 минут)');
  return timer;
};
