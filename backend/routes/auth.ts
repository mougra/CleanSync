import express, { Request, Response } from 'express';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import pool from '../db';
import { generateTokens, verifyRefreshToken, authMiddleware } from '../auth';

const router = express.Router();

const emailFrom = process.env.EMAIL_FROM || 'no-reply@localhost';
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

const getEmailTemplate = (title: string, content: string, actionText: string, actionLink: string) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #28a745; margin: 0;">✨ Clean Planner</h1>
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
          Если кнопка не работает, скопируйте эту ссылку:<br>
          <a href="${actionLink}" style="color: #007bff; word-break: break-all;">${actionLink}</a>
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #aaa; font-size: 12px;">
        © ${new Date().getFullYear()} Clean Planner. Помогаем делать мир чище.
      </div>
    </div>
  `;
};

const sendEmail = async ({ to, subject, html }: { to: string; subject: string; html: string }) => {
  const transporter = createTransporter();
  if (!transporter) {
    return false;
  }
  await transporter.sendMail({ from: emailFrom, to, subject, html });
  return true;
};

const sendPasswordResetEmail = async (to: string, resetToken: string) => {
  const resetLink = `http://localhost:5173/reset-password?token=${resetToken}`;
  return sendEmail({
    to,
    subject: 'Сброс пароля Clean Planner',
    html: getEmailTemplate(
      'Сброс пароля',
      'Вы запросили сброс пароля для своего аккаунта. Перейдите по кнопке ниже, чтобы установить новый пароль.',
      'Установить новый пароль',
      resetLink
    ),
  });
};

const sendConfirmationEmail = async (to: string, confirmToken: string) => {
  const confirmLink = `http://localhost:5173/confirm-email?token=${confirmToken}`;
  return sendEmail({
    to,
    subject: 'Подтвердите email для Clean Planner',
    html: getEmailTemplate(
      'Подтверждение почты',
      'Добро пожаловать в Clean Planner! Чтобы начать пользоваться приложением, пожалуйста, подтвердите ваш адрес электронной почты.',
      'Подтвердить email',
      confirmLink
    ),
  });
};

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
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
      'INSERT INTO users (email, password, username, avatar_url, email_confirm_token) VALUES ($1, $2, $3, $4, $5) RETURNING id, email',
      [email, hashedPassword, username, avatarUrl, emailConfirmToken],
    );

    const user = result.rows[0];

    const confirmLink = `http://localhost:5173/confirm-email?token=${emailConfirmToken}`;
    try {
      const emailSent = await sendConfirmationEmail(email, emailConfirmToken);
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

    res.status(201).json({
      message: 'Регистрация успешна. Пожалуйста, проверьте вашу почту и подтвердите email для входа в систему.',
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
      'SELECT id, email, password, is_email_confirmed FROM users WHERE email = $1',
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

    res.json({
      user: {
        id: user.id,
        email: user.email,
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

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store token
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, resetToken, expiresAt],
    );

    // Send email if SMTP is configured
    const resetLink = `http://localhost:5173/reset-password?token=${resetToken}`;
    try {
      const emailSent = await sendPasswordResetEmail(email, resetToken);
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

    // Update password
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [
      hashedPassword,
      user_id,
    ]);

    // Delete used token
    await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [
      token,
    ]);

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
      'SELECT id FROM users WHERE email = $1 AND is_email_confirmed = FALSE',
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
    const confirmLink = `http://localhost:5173/confirm-email?token=${confirmToken}`;

    try {
      const emailSent = await sendConfirmationEmail(email, confirmToken);
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
      'SELECT id, email, username, avatar_url, is_email_confirmed FROM users WHERE id = $1',
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
      'SELECT password, is_email_confirmed FROM users WHERE id = $1',
      [req.userId],
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!userResult.rows[0].is_email_confirmed) {
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

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

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

    // Update refresh token in DB
    await pool.query(
      'UPDATE refresh_tokens SET token = $1 WHERE user_id = $2',
      [newRefreshToken, decoded.userId],
    );

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

export default router;
