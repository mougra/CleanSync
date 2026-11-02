import crypto from 'crypto';
import express, { Request, Response } from 'express';
import pool from '../db';
import { digestUnsubscribeToken } from '../services/digest';

const router = express.Router();

/**
 * Отписка от недельного письма — без входа в аккаунт.
 *
 * Ссылка из письма — единственное место, где нет ни cookie, ни CSRF-токена:
 * человек читает почту в другом клиенте. Поэтому вход здесь не требуется, а
 * подлинность запроса доказывает HMAC-подпись: id без подписи позволил бы
 * отключить письма любому, кто перебирает номера.
 *
 * Отвечаем страницей, а не JSON: по ссылке приходит человек, а не программа.
 * Нажимать ничего не нужно — GET уже всё сделал, и это осознанно: письмо
 * помечается в почтовом клиенте как «отписать в один клик».
 */

const PAGE_STYLE =
  'font-family: Segoe UI, Tahoma, sans-serif; max-width: 520px; margin: 60px auto; padding: 32px;' +
  'border-radius: 20px; background: #fef9f6; color: #22302c; line-height: 1.5;';

const page = (title: string, body: string, language: 'ru' | 'en'): string => `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title} — TidyPlan</title>
</head>
<body style="margin: 0; background: #ffffff;">
  <div style="${PAGE_STYLE}">
    <p style="margin: 0 0 16px; font-weight: 700; color: #2a584d;">TidyPlan</p>
    <h1 style="margin: 0 0 12px; font-size: 24px;">${title}</h1>
    <p style="margin: 0 0 20px; color: #8a8a8a;">${body}</p>
    <a href="/" style="color: #d8664e;">${language === 'en' ? 'Back to TidyPlan' : 'Вернуться в TidyPlan'}</a>
  </div>
</body>
</html>`;

const timingSafeEqualStrings = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
};

router.get('/unsubscribe', async (req: Request, res: Response) => {
  const userId = String(req.query.u ?? '');
  const token = String(req.query.t ?? '');

  const invalid = () =>
    res
      .status(400)
      .type('html')
      .send(
        page(
          'Ссылка не сработала',
          'Похоже, ссылка повреждена или устарела. Отписаться можно в настройках: «Уведомления».',
          'ru',
        ),
      );

  if (!/^\d+$/.test(userId) || !/^[a-f0-9]{32}$/.test(token)) {
    return invalid();
  }

  if (!timingSafeEqualStrings(token, digestUnsubscribeToken(userId))) {
    return invalid();
  }

  try {
    const result = await pool.query<{ locale: string | null }>(
      'UPDATE users SET digest_enabled = FALSE WHERE id = $1 RETURNING locale',
      [userId],
    );

    if (result.rows.length === 0) {
      return invalid();
    }

    const language = result.rows[0].locale === 'en' ? 'en' : 'ru';

    return res
      .type('html')
      .send(
        language === 'en'
          ? page(
              'You are unsubscribed',
              'We will not send the weekly plan any more. You can bring it back in Settings → Notifications.',
              'en',
            )
          : page(
              'Готово, писем больше не будет',
              'Недельное письмо с планом отключено. Вернуть его можно в настройках, в разделе «Уведомления».',
              'ru',
            ),
      );
  } catch (error) {
    console.error('Отписка от дайджеста:', error);
    return res
      .status(500)
      .type('html')
      .send(page('Что-то пошло не так', 'Попробуйте открыть ссылку ещё раз через минуту.', 'ru'));
  }
});

export default router;
