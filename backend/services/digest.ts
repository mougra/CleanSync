import crypto from 'crypto';
import pool from '../db';
import { appLink, sendEmail } from './mailer';
import { dayPlanForDate, type DayPlanItem } from './dayPlan';
import { getStreakState } from './streak';
import { normalizeLocale, type ContentLocale } from './contentLocale';
import { APP_TIME_ZONE } from './appTime';

/**
 * Недельное письмо «план на неделю».
 *
 * Зачем оно нужно. Приложение живёт в браузере, и вернуться в него нечем: push
 * работает только в установленном PWA и только с разрешением, а без письма
 * человек вспоминает о сервисе, когда сам захочет убираться. Письмо в воскресенье
 * вечером — единственный канал, который не зависит ни от установки, ни от
 * браузера.
 *
 * Почему «сервисное», а не рекламное: в письме только собственный план человека
 * и его серия, никаких предложений. Поэтому согласие по умолчанию включено
 * (миграция 0027), а отписка — в один клик и без входа в аккаунт. Если письмо
 * когда-нибудь станет маркетинговым, согласие придётся собирать отдельно.
 *
 * Один проход = один часовой пояс. Планировщик крутится часто, а условие
 * «воскресенье 18:00 по времени человека» и `digest_last_sent_at` не дают
 * отправить два письма за неделю.
 */

/** Час местного времени, в который уходит письмо. */
const DIGEST_HOUR = 18;

/** Не отправляем письмо чаще, чем раз в шесть дней (неделя с запасом на сдвиг пояса). */
const MIN_DAYS_BETWEEN = 6;

/** Письмо уходит только тем, у кого на завтра есть незакрытые дела. */
const MAX_ITEMS = 6;

interface DigestUser {
  id: string;
  email: string;
  username: string | null;
  locale: string | null;
  tomorrow: string;
}

interface DigestCopy {
  subject: (count: number) => string;
  greeting: (name: string) => string;
  intro: (date: string, count: number, minutes: number) => string;
  streak: (days: number) => string;
  outro: string;
  action: string;
  unsubscribe: string;
  listTitle: string;
}

const COPY: Record<ContentLocale, DigestCopy> = {
  ru: {
    subject: (count) => (count > 0 ? `План на неделю: ${count} дел на завтра` : 'План на неделю'),
    greeting: (name) => `Привет${name ? `, ${name}` : ''}!`,
    intro: (date, count, minutes) =>
      `Завтра, ${date}, по плану ${count} ${plural(count, 'дело', 'дела', 'дел')} — примерно ${minutes} ${plural(minutes, 'минута', 'минуты', 'минут')}.`,
    streak: (days) => `Ваша серия: ${days} ${plural(days, 'день', 'дня', 'дней')} подряд.`,
    outro: 'Отметьте сделанное — план на сегодня уже ждёт.',
    action: 'Открыть план',
    unsubscribe: 'Отписаться от письма',
    listTitle: 'На завтра',
  },
  en: {
    subject: (count) => (count > 0 ? `Your week: ${count} tasks for tomorrow` : 'Your week'),
    greeting: (name) => `Hi${name ? `, ${name}` : ''}!`,
    intro: (date, count, minutes) =>
      `Tomorrow, ${date}, you have ${count} ${count === 1 ? 'task' : 'tasks'} — about ${minutes} minutes.`,
    streak: (days) => `Your streak: ${days} days in a row.`,
    outro: 'Tick off what you did — today’s plan is waiting.',
    action: 'Open the plan',
    unsubscribe: 'Unsubscribe from this email',
    listTitle: 'For tomorrow',
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

/**
 * Секрет подписи отписки.
 *
 * Отдельная переменная, но с запасным вариантом на `ACCESS_TOKEN_SECRET`: иначе
 * в окружении без `DIGEST_SECRET` ссылка отписки была бы неподписанной и любой
 * мог бы отключить письма чужому человеку, перебирая id.
 */
const digestSecret = (): string =>
  process.env.DIGEST_SECRET || process.env.ACCESS_TOKEN_SECRET || 'tidyplan-digest-dev';

/** Подпись отписки: не хранится в базе, проверяется пересчётом. */
export const digestUnsubscribeToken = (userId: string): string =>
  crypto.createHmac('sha256', digestSecret()).update(`digest:${userId}`).digest('hex').slice(0, 32);

export const digestUnsubscribeUrl = (userId: string): string =>
  `${appLink('/api/digest/unsubscribe')}?u=${encodeURIComponent(userId)}&t=${digestUnsubscribeToken(userId)}`;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Дата «завтра» по-человечески: 9 ноября / 9 November. */
const humanDate = (iso: string, lang: ContentLocale): string =>
  new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

export const renderDigestHtml = ({
  copy,
  lang,
  name,
  date,
  items,
  minutes,
  streak,
  unsubscribe,
}: {
  copy: DigestCopy;
  lang: ContentLocale;
  name: string;
  date: string;
  items: DayPlanItem[];
  minutes: number;
  streak: number | null;
  unsubscribe: string;
}) => {
  const list = items
    .slice(0, MAX_ITEMS)
    .map(
      (item) => `
      <tr>
        <td style="padding: 6px 0; color: #22302c; font-size: 15px; line-height: 1.4;">
          ${escapeHtml(item.title)}${item.room ? `<span style="color: #8a8a8a;"> · ${escapeHtml(item.room)}</span>` : ''}
        </td>
        <td style="padding: 6px 0; color: #8a8a8a; font-size: 14px; text-align: right; white-space: nowrap;">
          ${item.minutes > 0 ? `${item.minutes} ${lang === 'en' ? 'min' : 'мин'}` : ''}
        </td>
      </tr>`,
    )
    .join('');

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #2a584d; border-radius: 12px 12px 0 0; padding: 22px 24px;">
        <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 600;">TidyPlan</p>
        <p style="margin: 4px 0 0; color: #d5e0d0; font-size: 13px;">${escapeHtml(copy.listTitle)}</p>
      </div>
      <div style="background-color: #fef9f6; border-radius: 0 0 12px 12px; padding: 24px;">
        <p style="margin: 0 0 12px; color: #22302c; font-size: 16px;">${escapeHtml(copy.greeting(name))}</p>
        <p style="margin: 0 0 16px; color: #22302c; font-size: 15px; line-height: 1.5;">
          ${escapeHtml(copy.intro(date, items.length, minutes))}
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 0 0 16px;">
          ${list}
        </table>
        ${streak && streak > 1 ? `<p style="margin: 0 0 16px; color: #c8893f; font-size: 14px;">${escapeHtml(copy.streak(streak))}</p>` : ''}
        <p style="margin: 0 0 20px; color: #8a8a8a; font-size: 14px; line-height: 1.5;">${escapeHtml(copy.outro)}</p>
        <a href="${appLink('/')}" style="display: inline-block; background-color: #d8664e; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 999px; font-weight: 600;">${escapeHtml(copy.action)}</a>
      </div>
      <p style="text-align: center; margin: 18px 0 0; color: #aaa; font-size: 12px; line-height: 1.6;">
        © ${new Date().getFullYear()} TidyPlan.
        <a href="${unsubscribe}" style="color: #aaa; text-decoration: underline;">${escapeHtml(copy.unsubscribe)}</a>
      </p>
    </div>
  `;
};

/**
 * Один проход планировщика.
 *
 * Возвращает число отправленных писем — по нему в логе видно, что письмо живое,
 * а не «планировщик запущен и молчит».
 */
export const runDigestPass = async (): Promise<number> => {
  const result = await pool.query<DigestUser>(
    `SELECT u.id, u.email, COALESCE(NULLIF(u.username, ''), '') AS username, u.locale,
            to_char(((now() AT TIME ZONE COALESCE(u.timezone, $1)) + interval '1 day')::date, 'YYYY-MM-DD') AS tomorrow
       FROM users u
      WHERE u.digest_enabled = TRUE
        AND u.email IS NOT NULL
        AND (u.digest_last_sent_at IS NULL OR u.digest_last_sent_at < now() - ($2 || ' days')::interval)
        AND EXTRACT(ISODOW FROM (now() AT TIME ZONE COALESCE(u.timezone, $1))) = 7
        AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(u.timezone, $1))) = $3`,
    [APP_TIME_ZONE, String(MIN_DAYS_BETWEEN), DIGEST_HOUR],
  );

  let sent = 0;

  for (const user of result.rows) {
    const lang = normalizeLocale(user.locale) ?? 'ru';
    const copy = COPY[lang];

    let plan: Awaited<ReturnType<typeof dayPlanForDate>>;

    try {
      plan = await dayPlanForDate(user.id, user.tomorrow, lang);
    } catch (error) {
      console.error(`Дайджест: не удалось собрать план для ${user.id}`, error);
      continue;
    }

    // Пустой план — не повод для письма: человек увидит «0 дел» и отпишется.
    if (plan.items.length === 0) {
      continue;
    }

    const streak = await getStreakState(user.id)
      .then((state) => state.current)
      .catch(() => null);

    const unsubscribe = digestUnsubscribeUrl(user.id);
    const html = renderDigestHtml({
      copy,
      lang,
      name: user.username ?? '',
      date: humanDate(user.tomorrow, lang),
      items: plan.items,
      minutes: plan.remainingMinutes,
      streak,
      unsubscribe,
    });

    try {
      const delivered = await sendEmail({
        to: user.email,
        subject: copy.subject(plan.items.length),
        html,
        headers: {
          // Один клик в почтовом клиенте; ссылка в подвале — для остальных.
          'List-Unsubscribe': `<${unsubscribe}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (!delivered) {
        // SMTP не настроен: молчим, чтобы не помечать письмо отправленным.
        return sent;
      }

      await pool.query('UPDATE users SET digest_last_sent_at = now() WHERE id = $1', [user.id]);
      sent += 1;
    } catch (error) {
      console.error(`Дайджест: письмо для ${user.id} не ушло`, error);
    }
  }

  if (sent > 0) {
    console.log(`Дайджест отправлен: ${sent}`);
  }

  return sent;
};

/**
 * Планировщик: раз в пятнадцать минут.
 *
 * Чаще нет смысла (окно — час), реже можно пропустить окно при перезапуске.
 * Живёт в процессе сервера, как и напоминания: отдельного воркера нет.
 */
export const startDigestScheduler = (): NodeJS.Timeout | null => {
  const intervalMs = 15 * 60 * 1000;

  const timer = setInterval(() => {
    runDigestPass().catch((error) => console.error('Планировщик дайджеста:', error));
  }, intervalMs);

  timer.unref?.();

  console.log('Планировщик дайджеста запущен (каждые 15 минут)');
  return timer;
};
