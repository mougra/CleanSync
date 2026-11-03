import pool from '../db';
import { dayPlanForDate } from './dayPlan';
import { getStreakState } from './streak';
import { normalizeLocale, type ContentLocale } from './contentLocale';
import { APP_TIME_ZONE } from './appTime';
import { isPushConfigured, sendPushToUser } from './push';

/**
 * Напоминания о плане — системными уведомлениями, а не письмами.
 *
 * Два повода:
 *  - **недельный дайджест** (воскресенье, 18:00 по часовому поясу человека):
 *    «завтра 3 дела · примерно 20 минут» — план на неделю одним уведомлением;
 *  - **мягкий дневной пинг** (19:00): «сегодня 3 дела — начнём?», только если
 *    план на сегодня не пуст и человек сегодня ещё ничего не закрыл.
 *
 * Почему push, а не почта. Письмо человек читает раз в день в лучшем случае, а
 * уведомление приходит туда, где он уже находится. Письма остаются только для
 * действий с аккаунтом (сброс пароля, подтверждение почты).
 *
 * Оба напоминания включаются одним переключателем в настройках
 * (`users.digest_enabled`): это одна и та же мысль «вспомни про план». Больше
 * одного уведомления в день не бывает — недельное и дневное приходят в разные
 * часы, а дневное ещё и молчит, если дело уже сделано.
 */

/** Час недельного дайджеста: воскресенье вечером, когда планируют неделю. */
const WEEKLY_HOUR = 18;

/** Час мягкого пинга: после работы, но до позднего вечера. */
const NUDGE_HOUR = 19;

type MarkColumn = 'digest_last_sent_at' | 'nudge_last_sent_at';

interface Candidate {
  id: string;
  locale: string | null;
  today: string;
  tomorrow: string;
}

interface ReminderCopy {
  digestTitle: string;
  digestBody: (count: number, minutes: number) => string;
  nudgeTitle: string;
  nudgeBody: (count: number, minutes: number) => string;
  streak: (days: number) => string;
}

const COPY: Record<ContentLocale, ReminderCopy> = {
  ru: {
    digestTitle: 'План на неделю',
    digestBody: (count, minutes) =>
      `Завтра ${count} ${plural(count, 'дело', 'дела', 'дел')} · примерно ${minutes} ${plural(minutes, 'минута', 'минуты', 'минут')}`,
    nudgeTitle: 'Немного порядка?',
    nudgeBody: (count, minutes) =>
      `Сегодня ${count} ${plural(count, 'дело', 'дела', 'дел')} на ${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')} — начнём?`,
    streak: (days) => `серия ${days} ${plural(days, 'день', 'дня', 'дней')}`,
  },
  en: {
    digestTitle: 'Your week ahead',
    digestBody: (count, minutes) =>
      `Tomorrow: ${count} ${count === 1 ? 'task' : 'tasks'} · about ${minutes} min`,
    nudgeTitle: 'A little tidy-up?',
    nudgeBody: (count, minutes) =>
      `Today: ${count} ${count === 1 ? 'task' : 'tasks'} in ${minutes} min — shall we start?`,
    streak: (days) => `streak of ${days} days`,
  },
};

/** Русское склонение: 1 дело, 2 дела, 5 дел. */
const plural = (count: number, one: string, few: string, many: string): string => {
  const tail = count % 100;
  const last = count % 10;

  if (tail > 10 && tail < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
};

/** Уведомление недельного дайджеста: собирается отдельно, поэтому тестируется. */
export const buildDigestPayload = (
  lang: ContentLocale,
  count: number,
  minutes: number,
  streak: number | null,
) => {
  const copy = COPY[lang];
  const tail = streak && streak > 1 ? ` · ${copy.streak(streak)}` : '';

  return {
    title: copy.digestTitle,
    body: `${copy.digestBody(count, minutes)}${tail}`,
    url: '/',
    tag: 'plan-week',
  };
};

/** Уведомление мягкого дневного пинга. */
export const buildNudgePayload = (lang: ContentLocale, count: number, minutes: number) => {
  const copy = COPY[lang];

  return {
    title: copy.nudgeTitle,
    body: copy.nudgeBody(count, minutes),
    url: '/',
    tag: 'plan-nudge',
  };
};

/**
 * Кандидаты на напоминание: у кого сейчас нужный час в его поясе и кому ещё не
 * отправляли сегодня.
 *
 * Часовой пояс — `users.timezone`, без него пояс приложения. Время считается в
 * SQL: планировщик крутится каждые 15 минут, и окно в час даёт четыре шанса
 * попасть точно, а отметка об отправке не даёт отправить дважды.
 */
const candidates = async (hour: number, markColumn: MarkColumn): Promise<Candidate[]> => {
  const result = await pool.query<Candidate>(
    `SELECT u.id, u.locale,
            to_char((now() AT TIME ZONE COALESCE(u.timezone, $1))::date, 'YYYY-MM-DD') AS today,
            to_char(((now() AT TIME ZONE COALESCE(u.timezone, $1)) + interval '1 day')::date, 'YYYY-MM-DD') AS tomorrow
       FROM users u
      WHERE u.digest_enabled = TRUE
        AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(u.timezone, $1))) = $2
        AND (
          u.${markColumn} IS NULL
          OR u.${markColumn}::date < (now() AT TIME ZONE COALESCE(u.timezone, $1))::date
        )`,
    [APP_TIME_ZONE, hour],
  );

  return result.rows;
};

/**
 * Отправляет уведомление и помечает отправку только если что-то доставлено.
 *
 * `markColumn` — имя колонки из белого списка (см. `MarkColumn`), поэтому
 * подстановка в SQL безопасна: другого значения сюда попасть не может.
 */
const notify = async (
  userId: string,
  payload: { title: string; body: string; url: string; tag: string },
  markColumn: MarkColumn,
): Promise<boolean> => {
  const delivered = await sendPushToUser(userId, payload);

  if (delivered === 0) {
    // Подписки нет (или браузер её отозвал) — не помечаем: человек, включивший
    // уведомления позже, должен получить ближайшее, а не пропустить его.
    return false;
  }

  await pool.query(`UPDATE users SET ${markColumn} = now() WHERE id = $1`, [userId]);

  return true;
};

/**
 * Недельный дайджест: воскресенье, 18:00 по местному времени.
 *
 * Содержание — завтрашний план, он и нужен в воскресенье вечером. Пустой план —
 * не повод для уведомления.
 */
export const runWeeklyDigest = async (): Promise<number> => {
  if (!isPushConfigured()) {
    return 0;
  }

  const rows = await candidates(WEEKLY_HOUR, 'digest_last_sent_at');
  let sent = 0;

  for (const user of rows) {
    const lang = normalizeLocale(user.locale) ?? 'ru';

    const plan = await dayPlanForDate(user.id, user.tomorrow, lang).catch(() => null);

    if (!plan || plan.items.length === 0) {
      continue;
    }

    const streak = await getStreakState(user.id)
      .then((state) => state.current)
      .catch(() => null);

    const delivered = await notify(
      user.id,
      buildDigestPayload(lang, plan.items.length, plan.remainingMinutes, streak),
      'digest_last_sent_at',
    );

    if (delivered) sent += 1;
  }

  if (sent > 0) {
    console.log(`Дайджест отправлен: ${sent}`);
  }

  return sent;
};

/**
 * Мягкий дневной пинг: 19:00 по местному времени.
 *
 * Молчит, если на сегодня нет плана или всё уже закрыто — напоминание о сделанном
 * раздражает, а не возвращает.
 */
export const runDailyNudge = async (): Promise<number> => {
  if (!isPushConfigured()) {
    return 0;
  }

  const rows = await candidates(NUDGE_HOUR, 'nudge_last_sent_at');
  let sent = 0;

  for (const user of rows) {
    const lang = normalizeLocale(user.locale) ?? 'ru';

    const plan = await dayPlanForDate(user.id, user.today, lang).catch(() => null);

    if (!plan || plan.items.length === 0) {
      continue;
    }

    const delivered = await notify(
      user.id,
      buildNudgePayload(lang, plan.items.length, plan.remainingMinutes),
      'nudge_last_sent_at',
    );

    if (delivered) sent += 1;
  }

  if (sent > 0) {
    console.log(`Дневные напоминания отправлены: ${sent}`);
  }

  return sent;
};

/**
 * Планировщик: раз в пятнадцать минут проверяем оба повода.
 *
 * Чаще нет смысла (окна — по часу), реже можно пропустить окно при перезапуске.
 * Живёт в процессе сервера, как и напоминания о привычках: отдельного воркера нет.
 */
export const startPlanReminderScheduler = (): NodeJS.Timeout => {
  const tick = () => {
    runWeeklyDigest().catch((error) => console.error('Дайджест:', error));
    runDailyNudge().catch((error) => console.error('Дневное напоминание:', error));
  };

  const timer = setInterval(tick, 15 * 60 * 1000);

  timer.unref?.();

  console.log('Планировщик напоминаний о плане запущен (каждые 15 минут)');
  return timer;
};
