import express, { Request, Response } from 'express';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import pool from '../db';
import { generateTokens, verifyRefreshToken, authMiddleware } from '../auth';
import { normalizeLocale, resolveContentLocale, type ContentLocale } from '../services/contentLocale';
import { EMAIL_EN } from '../content/en/emails';
import { relocalizeGeneratedContent } from '../services/generatedContent';
import { clearAuthCookies, ensureCsrfToken, issueCsrfToken, readRefreshToken, setAuthCookies } from '../cookies';

const router = express.Router();

const emailFrom = process.env.EMAIL_FROM || 'no-reply@localhost';

/**
 * Адрес для ответов (`Reply-To`).
 *
 * Письма уходят от `noreply@домен`, у которого нет и не должно быть ящика: ответ
 * на такое письмо вернулся бы отправителю ошибкой. Поэтому в `Reply-To` кладём
 * живой адрес поддержки — пользователь нажимает «Ответить» и попадает к человеку,
 * а формальный отправитель остаётся `noreply@`.
 */
const emailReplyTo = process.env.EMAIL_REPLY_TO || '';
const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

const createTransporter = () => {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    return null;
  }
  return nodemailer.createTransport(smtpConfig);
};

/**
 * Настроена ли отправка писем.
 *
 * Пока SMTP нет, подтвердить почту физически невозможно: письмо некуда отправить,
 * а ссылка подтверждения попадает только в лог сервера. Поэтому требовать
 * подтверждение в этом режиме нельзя — иначе пользователь, который зарегистрировался
 * и вошёл, не сможет сменить пароль и останется в тупике (см. change-password).
 * Как только SMTP появится в окружении, проверка включается сама, без правок кода.
 */
const isEmailConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS,
  );

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

const getEmailTemplate = (
  title: string,
  content: string,
  actionText: string,
  actionLink: string,
  lang: ContentLocale,
) => {
  const footer =
    lang === 'en'
      ? `© ${new Date().getFullYear()} TidyPlan. ${EMAIL_EN.footer}${
          emailReplyTo ? `<br>${EMAIL_EN.replyNote}` : ''
        }`
      : `© ${new Date().getFullYear()} TidyPlan. Помогаем делать мир чище.${
          emailReplyTo ? '<br>На это письмо можно ответить — оно придёт в поддержку.' : ''
        }`;
  const fallback =
    lang === 'en' ? EMAIL_EN.fallbackNote : 'Если кнопка не работает, скопируйте эту ссылку:';

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #28a745; margin: 0;">✨ TidyPlan</h1>
      </div>
      <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <h2 style="color: #333; text-align: center; margin-top: 0;">${title}</h2>
        <p style="color: #666; font-size: 16px; line-height: 1.5; text-align: center;">
          ${content}
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${actionLink}" style="background-color: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;">
            ${actionText}
          </a>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          ${fallback}<br>
          <a href="${actionLink}" style="color: #007bff; word-break: break-all;">${actionLink}</a>
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #aaa; font-size: 12px;">
        ${footer}
      </div>
    </div>
  `;
};

const sendEmail = async ({ to, subject, html }: { to: string; subject: string; html: string }) => {
  const transporter = createTransporter();
  if (!transporter) {
    return false;
  }
  await transporter.sendMail({
    from: emailFrom,
    to,
    subject,
    html,
    // Пустая строка в replyTo ломает заголовок, поэтому передаём только когда задан.
    replyTo: emailReplyTo || undefined,
  });
  return true;
};

/**
 * Публичный адрес приложения для ссылок в письмах.
 * Раньше здесь был жёстко зашит прежний SPA на порту 5173 — письма вели
 * на несуществующий адрес. Теперь это настройка окружения.
 */
const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const appLink = (path: string) => `${appBaseUrl}${path}`;

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
       RETURNING id, email`,
      [email, hashedPassword, username, avatarUrl, emailConfirmToken],
    );

    const user = result.rows[0];

    // Письмо подтверждения при регистрации не отправляем: человек сначала
    // пользуется сервисом, а подтверждение почты — его отдельное действие в
    // настройках, где рядом видно, подтверждена она или нет (кнопка там зовёт
    // /auth/resend-confirmation). Так мы не тратим письма на тех, кто зашёл
    // посмотреть, и не просим шаг, который ничего не открывает: вход, план и
    // восстановление пароля доступны сразу.
    res.status(201).json({
      message: 'Регистрация успешна. Можно входить.',
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
      'SELECT id, email, password, username, avatar_url, is_email_confirmed FROM users WHERE email = $1',
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
      'SELECT id, email, username, avatar_url, is_email_confirmed, locale, timezone FROM users WHERE id = $1',
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

// Change password
router.post('/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
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

    // Check if token exists in DB
    const tokenExists = await pool.query(
      'SELECT id FROM refresh_tokens WHERE user_id = $1 AND token = $2',
      [decoded.userId, refreshToken],
    );

    if (tokenExists.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token not found' });
    }

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      generateTokens(decoded.userId);

    /**
     * Меняем **только тот токен, который пришёл**, а не все токены пользователя.
     *
     * Раньше здесь стояло `WHERE user_id = $2`, и обновление на телефоне
     * перезаписывало строку, по которой жил компьютер: второе устройство
     * переставало обновляться и «выбивало» из аккаунта. У пользователя может быть
     * несколько живых сессий (`refresh_tokens` — обычная таблица, вход добавляет
     * строку), и каждая должна меняться сама за себя.
     */
    const updated = await pool.query(
      'UPDATE refresh_tokens SET token = $1 WHERE user_id = $2 AND token = $3',
      [newRefreshToken, decoded.userId, refreshToken],
    );

    if ((updated.rowCount ?? 0) === 0) {
      return res.status(401).json({ error: 'Refresh token not found' });
    }

    setAuthCookies(res, { accessToken: newAccessToken, refreshToken: newRefreshToken });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
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
