import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { isPushConfigured, pushPublicKey, sendPushToUser } from '../services/push';

const router = express.Router();

/** Публичный ключ для подписки: нужен браузеру, секрета в нём нет. */
router.get('/key', (req: Request, res: Response) => {
  res.json({ publicKey: pushPublicKey(), enabled: isPushConfigured() });
});

/** Сохранить подписку браузера. Повторная подписка с того же устройства обновляет ключи. */
router.post('/subscribe', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { endpoint, keys } = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: 'Endpoint and keys are required' });
      return;
    }

    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              p256dh = EXCLUDED.p256dh,
              auth = EXCLUDED.auth,
              user_agent = EXCLUDED.user_agent,
              failed_count = 0`,
      [req.userId, endpoint, keys.p256dh, keys.auth, req.headers['user-agent'] ?? null]
    );

    res.status(201).json({ subscribed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

/** Отписаться: обычно при выключении напоминаний в настройках. */
router.post('/unsubscribe', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body as { endpoint?: string };

    if (endpoint) {
      await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [
        endpoint,
        req.userId,
      ]);
    } else {
      // Без endpoint — снимаем все подписки пользователя.
      await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.userId]);
    }

    res.json({ subscribed: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

/** Сколько устройств подписано — показываем в настройках. */
router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS devices FROM push_subscriptions WHERE user_id = $1',
      [req.userId]
    );

    res.json({ enabled: isPushConfigured(), devices: result.rows[0]?.devices ?? 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read subscription status' });
  }
});

/** Проверочное уведомление: нажать и убедиться, что push доходит. */
router.post('/test', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!isPushConfigured()) {
      res.status(503).json({ error: 'Push is not configured on the server' });
      return;
    }

    const delivered = await sendPushToUser(req.userId!, {
      title: 'Уведомления включены',
      body: 'Так будут приходить напоминания о привычках.',
      url: '/habits',
      tag: 'push-test',
    });

    if (delivered === 0) {
      res.status(404).json({ error: 'No active subscriptions' });
      return;
    }

    res.json({ delivered });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

export default router;
