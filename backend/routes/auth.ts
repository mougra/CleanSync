import express, { Request, Response } from 'express';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import pool from '../db';
import { generateAccessToken, generateTokens, verifyRefreshToken, authMiddleware } from '../auth';
import { normalizeLocale, resolveContentLocale, type ContentLocale } from '../services/contentLocale';
import { relocalizeGeneratedContent } from '../services/generatedContent';
import { EMAIL_EN } from '../content/en/emails';
import { appLink, getEmailTemplate, isEmailConfigured, sendEmail } from '../services/mailer';
import { clearAuthCookies, ensureCsrfToken, issueCsrfToken, readRefreshToken, setAuthCookies } from '../cookies';

const router = express.Router();


/**
 * Тексты писем на двух языках.
 *
 * Русский лежит здесь (он язык по умолчанию), английский — в
 * `content/en/emails.ts`. Язык письма берём из профиля (`users.locale`),
 * а если он там ещё не проставлен — из заголовка запроса: письмо читают в
 * почтовом клиенте, где cookie не видно.
 */
interface EmailCopy {
  subject: string;
  title: string;
  body: string;
  action: string;
}

const EMAIL_RU: Record<'reset' | 'confirm' | 'changed', EmailCopy> = {
  reset: {
    subject: 'Сброс пароля TidyPlan',
    title: 'Сброс пароля',
    body: 'Вы запросили сброс пароля для своего аккаунта. Перейдите по кнопке ниже, чтобы установить новый пароль.',
    action: 'Установить новый пароль',
  },
  confirm: {
    subject: 'Подтвердите email для TidyPlan',
    title: 'Подтверждение почты',
    body: 'Добро пожаловать в TidyPlan! Чтобы начать пользоваться приложением, пожалуйста, подтвердите ваш адрес электронной почты.',
    action: 'Подтвердить email',
  },
  changed: {
    subject: 'Пароль TidyPlan изменён',
    title: 'Пароль изменён',
    body: 'Пароль вашего аккаунта TidyPlan только что изменён. Если это сделали не вы, восстановите доступ к аккаунту и напишите нам.',
    action: 'Войти в TidyPlan',
  },
};

const emailCopy = (key: 'reset' | 'confirm' | 'changed', lang: ContentLocale): EmailCopy =>
  lang === 'en' ? EMAIL_EN[key] : EMAIL_RU[key];


const sendPasswordResetEmail = async (to: string, resetToken: string, lang: ContentLocale) => {
  const resetLink = appLink(`/reset-password?token=${resetToken}`);
  const copy = emailCopy('reset', lang);

  return sendEmail({
    to,
    subject: copy.subject,
    html: getEmailTemplate(copy.title, copy.body, copy.action, resetLink, lang),
  });
};

const sendConfirmationEmail = async (to: string, confirmToken: string, lang: ContentLocale) => {
  const confirmLink = appLink(`/confirm-email?token=${confirmToken}`);
  const copy = emailCopy('confirm', lang);

  return sendEmail({
    to,
    subject: copy.subject,
    html: getEmailTemplate(copy.title, copy.body, copy.action, confirmLink, lang),
  });
};

/**
 * Письмо «пароль изменён».
 *
 * Лучшая практика: владелец аккаунта узнаёт о смене пароля из письма, а не из
 * потери доступа. Отправка уведомления не должна ломать саму смену пароля —
 * пароль уже изменён и откатывать это нельзя, поэтому ошибку только логируем.
 */
const sendPasswordChangedEmail = async (to: string, lang: ContentLocale) => {
  const copy = emailCopy('changed', lang);

  try {
    await sendEmail({
      to,
      subject: copy.subject,
      html: getEmailTemplate(copy.title, copy.body, copy.action, appLink('/login'), lang),
    });
  } catch (error) {
    console.error('Failed to send password change notice:', error);
  }
};

/**
 * Bootstrap для клиента: выдаёт CSRF-cookie и возвращает её значение.
 * Клиент вызывает это до первого изменяющего запроса и повторяет токен
 * в заголовке X-CSRF-Token.
 */
router.get('/csrf', (req: Request, res: Response) => {
  const csrfToken = issueCsrfToken(res);
  res.json({ csrfToken });
});

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, acceptTerms } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Согласие на обработку персональных данных обязательно (152-ФЗ):
    // без него регистрация не проходит, а факт согласия фиксируем в базе.
    if (acceptTerms !== true) {
      return res.status(400).json({ error: 'Terms acceptance required' });
    }

    // Check if user exists
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const username = email.split('@')[0];
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff`;
    const emailConfirmToken = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcryptjs.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password, username, avatar_url, email_confirm_token, terms_accepted_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING id, email, username, avatar_url, is_email_confirmed`,
      [email, hashedPassword, username, avatarUrl, emailConfirmToken],
    );

    const user = result.rows[0];

    /**
     * Регистрация сразу входит: человек не должен вводить пароль второй раз.
     *
     * Токены кладём теми же httpOnly-cookie, что и `POST /login`, поэтому клиент
     * после ответа уже авторизован и уходит на главную. Тело ответа повторяет
     * форму логина (профиль + токены) — прежние API-клиенты читают токены
     * оттуда, приложение их не хранит.
     */
    const { accessToken, refreshToken } = generateTokens(user.id);

    await pool.query('INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)', [
      user.id,
      refreshToken,
    ]);

    setAuthCookies(res, { accessToken, refreshToken });
    ensureCsrfToken(req, res);

    // Письмо подтверждения при регистрации не отправляем: человек сначала
    // пользуется сервисом, а подтверждение почты — его отдельное действие в
    // настройках, где рядом видно, подтверждена она или нет (кнопка там зовёт
    // /auth/resend-confirmation). Так мы не тратим письма на тех, кто зашёл
    // посмотреть, и не просим шаг, который ничего не открывает: вход, план и
    // восстановление пароля доступны сразу.
    res.status(201).json({
      message: 'Регистрация успешна. Вы вошли.',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar_url: user.avatar_url,
        is_email_confirmed: user.is_email_confirmed,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const result = await pool.query(
      `SELECT id, email, password, username, avatar_url, is_email_confirmed, locale, timezone,
              digest_enabled, to_char(notification_time, 'HH24:MI') AS notification_time
         FROM users WHERE email = $1`,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcryptjs.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)',
      [user.id, refreshToken],
    );

    // Токены кладём в httpOnly-cookie. В теле ответа оставлены для прежнего SPA
    // (он ещё живёт как эталон) — новое приложение их не читает и не хранит.
    setAuthCookies(res, { accessToken, refreshToken });
    // Токен не перевыпускаем: клиент уже держит его в памяти после bootstrap.
    ensureCsrfToken(req, res);

    /*
     * Профиль отдаём целиком, а не только id с почтой: клиент кладёт этот объект
     * в стор и до следующей перезагрузки страницы рисует имя и аватар именно из
     * него. Без `username` и `avatar_url` интерфейс подставлял запасной вариант —
     * часть адреса до собаки, — и выглядело это как «имя не сохранилось», хотя
     * в базе оно было.
     */
    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar_url: user.avatar_url,
        is_email_confirmed: user.is_email_confirmed,
        locale: user.locale,
        timezone: user.timezone,
        digest_enabled: user.digest_enabled,
        notification_time: user.notification_time,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Forgot password
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Find user
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );

    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      return res
        .status(200)
        .json({ message: 'If the email exists, a reset link has been sent.' });
    }

    const userId = userResult.rows[0].id;
    const lang = resolveContentLocale(req, userResult.rows[0].locale);

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store token
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, resetToken, expiresAt],
    );

    // Send email if SMTP is configured
    const resetLink = appLink(`/reset-password?token=${resetToken}`);
    try {
      const emailSent = await sendPasswordResetEmail(email, resetToken, lang);
      if (!emailSent) {
        console.warn(
          'SMTP not configured — password reset link is logged in the backend console.',
        );
        console.log(`Password reset link: ${resetLink}`);
      }
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      console.log(`Password reset link: ${resetLink}`);
    }

    res
      .status(200)
      .json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password required' });
    }

    // Find token
    const tokenResult = await pool.query(
      'SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1',
      [token],
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const { user_id, expires_at } = tokenResult.rows[0];

    if (new Date() > expires_at) {
      return res.status(400).json({ error: 'Token expired' });
    }

    // Hash new password
    const hashedPassword = await bcryptjs.hash(newPassword, 10);

    // Update password. Переход по ссылке из письма доказывает владение ящиком,
    // поэтому заодно отмечаем почту подтверждённой, а ненужный токен стираем:
    // отдельного шага подтверждения в интерфейсе больше нет.
    await pool.query(
      'UPDATE users SET password = $1, is_email_confirmed = TRUE, email_confirm_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, user_id],
    );

    // Delete used token
    await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [
      token,
    ]);

    const resetUser = await pool.query<{ email: string; locale: string | null }>(
      'SELECT email, locale FROM users WHERE id = $1',
      [user_id],
    );

    // Восстановление по ссылке из письма считаем сменой доступа: закрываем все
    // сессии, включая чужие — иначе старый refresh-токен переживёт новый пароль.
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user_id]);

    if (resetUser.rows[0]?.email) {
      await sendPasswordChangedEmail(
        resetUser.rows[0].email,
        resolveContentLocale(req, resetUser.rows[0].locale),
      );
    }

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Confirm email
router.post('/confirm-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const result = await pool.query(
      'UPDATE users SET is_email_confirmed = TRUE, email_confirm_token = NULL WHERE email_confirm_token = $1 RETURNING id, email, username, avatar_url',
      [token],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    res.status(200).json({ message: 'Email confirmed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm email' });
  }
});

// Resend confirmation email
router.post('/resend-confirmation', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const userResult = await pool.query(
      'SELECT id, locale FROM users WHERE email = $1 AND is_email_confirmed = FALSE',
      [email],
    );
    if (userResult.rows.length === 0) {
      return res.status(200).json({
        message: 'Если почта существует, письмо подтверждения отправлено.',
      });
    }

    const confirmToken = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'UPDATE users SET email_confirm_token = $1 WHERE email = $2',
      [confirmToken, email],
    );
    const confirmLink = appLink(`/confirm-email?token=${confirmToken}`);

    try {
      const emailSent = await sendConfirmationEmail(
        email,
        confirmToken,
        resolveContentLocale(req, userResult.rows[0].locale),
      );
      if (!emailSent) {
        console.warn(
          'SMTP not configured — confirmation link logged in the backend console.',
        );
        console.log(`Confirmation link: ${confirmLink}`);
      }
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      console.log(`Confirmation link: ${confirmLink}`);
    }

    res.status(200).json({
      message: 'Если почта существует, письмо подтверждения отправлено.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to resend confirmation email' });
  }
});

// Current user
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, email, username, avatar_url, is_email_confirmed, locale, timezone, digest_enabled,
              to_char(notification_time, 'HH24:MI') AS notification_time
         FROM users WHERE id = $1`,
      [req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Update profile
router.put('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { username, avatarUrl } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }

    const result = await pool.query(
      'UPDATE users SET username = $1, avatar_url = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, email, username, avatar_url, is_email_confirmed',
      [username, avatarUrl || null, req.userId],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * Язык и часовой пояс профиля.
 *
 * Нужны там, где интерфейса рядом нет: письма, push-напоминания и генерация
 * плана по дому. Отдельный маршрут, а не `PUT /profile`, потому что язык
 * меняется из переключателя в настройках — без имени и аватара, и требовать
 * их ради смены языка было бы странно.
 */
router.put('/locale', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { locale, timezone } = req.body as { locale?: unknown; timezone?: unknown };

    const localeValue = normalizeLocale(typeof locale === 'string' ? locale : null);

    // Неизвестный язык — ошибка клиента: молча записать «ru» значило бы
    // показать человеку не тот язык, который он выбрал.
    if (locale !== undefined && !localeValue) {
      return res.status(400).json({ error: 'Unsupported locale' });
    }

    const timezoneValue =
      typeof timezone === 'string' && timezone.trim() ? timezone.trim().slice(0, 64) : null;

    const result = await pool.query(
      `UPDATE users
          SET locale = COALESCE($1, locale),
              timezone = COALESCE($2, timezone),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
    RETURNING id, email, username, avatar_url, is_email_confirmed, locale, timezone`,
      [localeValue, timezoneValue, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    /**
     * Сменился язык — приводим к нему переводы сгенерированного набора задач
     * («Мои задачи» и план по дому): их названия лежат в базе русскими (по ним
     * генератор и «Вернуть» находят задачи), а английский живёт в переводах.
     * Ошибка перевода не должна ломать саму смену языка: интерфейс уже переключён.
     */
    if (localeValue) {
      try {
        await relocalizeGeneratedContent(req.userId!, localeValue);
      } catch (error) {
        console.error('Не удалось обновить переводы сгенерированных задач:', error);
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update locale' });
  }
});

/**
 * Напоминания о плане: включить или выключить и выбрать время.
 *
 * Отдельный маршрут, а не `PUT /profile`: в настройках это один блок, и
 * посылать ради него имя с аватаром — лишний повод потерять их при
 * синхронизации. По умолчанию напоминания включены (миграция 0027), время —
 * 19:00 (миграция 0032); отписка из письма ходит через
 * `GET /api/digest/unsubscribe` — без входа.
 *
 * Поля необязательные и обновляются по отдельности: переключатель шлёт
 * `enabled`, выбор времени — `time`, и одно не должно затирать другое.
 */
router.put('/digest', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { enabled, time } = req.body as { enabled?: unknown; time?: unknown };
    const fields: string[] = [];
    const values: unknown[] = [];

    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }

      values.push(enabled);
      fields.push(`digest_enabled = $${values.length}`);
    }

    if (time !== undefined) {
      if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        return res.status(400).json({ error: 'time must be in HH:MM format' });
      }

      values.push(time);
      fields.push(`notification_time = $${values.length}::time`);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'enabled or time is required' });
    }

    values.push(req.userId);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${values.length}
    RETURNING id, email, username, avatar_url, is_email_confirmed, locale, timezone, digest_enabled,
              to_char(notification_time, 'HH24:MI') AS notification_time`,
      values,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update digest settings' });
  }
});

// Change password
router.post('/change-password', authMiddleware, async (req: Request, res: Response) => {  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: 'Current and new passwords required' });
    }

    const userResult = await pool.query(
      'SELECT password, is_email_confirmed, email, locale FROM users WHERE id = $1',
      [req.userId],
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (isEmailConfigured() && !userResult.rows[0].is_email_confirmed) {
      return res
        .status(403)
        .json({ error: 'Email должен быть подтверждён перед сменой пароля.' });
    }

    const validPassword = await bcryptjs.compare(
      currentPassword,
      userResult.rows[0].password,
    );
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcryptjs.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, req.userId],
    );

    // Остальные устройства разлогиниваем, текущую сессию оставляем: refresh-токен
    // этой сессии пришёл в cookie, его и сохраняем. Так смена пароля закрывает
    // чужие входы, но не выкидывает человека из приложения, где он и находится.
    const currentRefresh = readRefreshToken(req);
    await pool.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1 AND token IS DISTINCT FROM $2',
      [req.userId, currentRefresh],
    );

    await sendPasswordChangedEmail(
      userResult.rows[0].email,
      resolveContentLocale(req, userResult.rows[0].locale),
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * Удаление аккаунта вместе со всеми данными.
 *
 * Это право субъекта персональных данных на удаление (152-ФЗ), поэтому кнопка
 * в настройках должна работать без обращения в поддержку. Пароль спрашиваем
 * потому, что действие необратимо: связанные записи удаляются каскадом.
 */
router.delete('/account', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [
      req.userId,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcryptjs.compare(password, userResult.rows[0].password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    // Графики, задачи, привычки, челленджи, достижения и push-подписки
    // удаляются каскадом по внешним ключам.
    await pool.query('DELETE FROM users WHERE id = $1', [req.userId]);
    clearAuthCookies(res);

    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

/** Сколько старый refresh-токен ещё принимается после обмена: только гонка. */
const REFRESH_GRACE_MINUTES = 2;

// Refresh token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // refresh-токен берём из httpOnly-cookie; тело читаем для совместимости.
    const refreshToken = readRefreshToken(req);

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      generateTokens(decoded.userId);

    /**
     * Обмен атомарный: строка меняется только если в ней всё ещё лежит тот
     * токен, который пришёл. `rowCount` говорит, произошёл ли обмен на самом деле.
     *
     * Меняем **только тот токен, который пришёл**, а не все токены пользователя:
     * у человека может быть несколько живых сессий (телефон и компьютер), и
     * каждая должна меняться сама за себя.
     */
    const rotated = await pool.query(
      `UPDATE refresh_tokens
          SET prev_token = token, rotated_at = NOW(), token = $1
        WHERE user_id = $2 AND token = $3
        RETURNING id`,
      [newRefreshToken, decoded.userId, refreshToken],
    );

    if ((rotated.rowCount ?? 0) === 0) {
      /**
       * Гонка: этот токен уже обменяла другая вкладка или серверный рендер.
       *
       * Раньше здесь был 401, и человек «вылетал» из аккаунта, хотя сессия жива:
       * он просто пришёл со значением, которое только что стало прежним. В
       * течение `REFRESH_GRACE_MINUTES` старый токен ещё принимается — отдаём
       * текущий токен из базы и свежий access, ничего не ротируя. Cookie
       * браузера при этом лечится: вместо отозванного значения в неё встаёт
       * действующее.
       */
      const current = await pool.query(
        `SELECT token
           FROM refresh_tokens
          WHERE user_id = $1 AND prev_token = $2
            AND rotated_at > NOW() - make_interval(mins => $3)
          ORDER BY rotated_at DESC
          LIMIT 1`,
        [decoded.userId, refreshToken, REFRESH_GRACE_MINUTES],
      );

      if (current.rows.length === 0) {
        return res.status(401).json({ error: 'Refresh token not found' });
      }

      const currentRefreshToken = String(current.rows[0].token);
      // Тот же токен, что уже лежит в базе: новый access без новой ротации.
      const accessToken = generateAccessToken(decoded.userId);

      setAuthCookies(res, { accessToken, refreshToken: currentRefreshToken });

      /**
       * CSRF-cookie продлеваем в каждом обновлении сессии.
       *
       * Раньше её срок отсчитывался от входа и не двигался: активный человек
       * через 30 дней получал 403 на любом изменяющем запросе, а access при этом
       * обновлялся — снаружи это выглядело как «нажимаю, и ничего не
       * происходит». Теперь оба срока едут вместе.
       */
      const csrfToken = ensureCsrfToken(req, res);

      return res.json({ accessToken, refreshToken: currentRefreshToken, csrfToken, reused: true });
    }

    setAuthCookies(res, { accessToken: newAccessToken, refreshToken: newRefreshToken });

    /**
     * CSRF-токен возвращаем в теле: клиент держит его в памяти, и если cookie
     * успела истечь (или её не было), значение из ответа сразу становится
     * рабочим — без отдельного запроса за новым токеном.
     */
    const csrfToken = ensureCsrfToken(req, res);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      csrfToken,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * Выход: удаляем refresh-токен из БД (серверный отзыв) и чистим cookie.
 * Даже если токена в cookie нет — отвечаем успехом, клиенту важно очистить состояние.
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const refreshToken = readRefreshToken(req);

    if (refreshToken) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    }

    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

export default router;
