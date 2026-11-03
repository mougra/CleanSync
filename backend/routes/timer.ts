import express, { Request, Response } from 'express';
import { authMiddleware } from '../auth';
import {
  finishActive,
  getActiveSession,
  pauseSession,
  resumeSession,
  sessionView,
  startSession,
} from '../services/focus';

const router = express.Router();

/**
 * Таймер уборки: старт, пауза, продолжение, завершение.
 *
 * Одна сессия на человека — это гарантирует частичный уникальный индекс в базе.
 * Все ответы отдают одну и ту же форму сессии, поэтому клиенту не нужно
 * различать «старт» и «продолжение»: он просто кладёт ответ в состояние.
 */

router.get('/active', authMiddleware, async (req: Request, res: Response) => {
  try {
    const active = await getActiveSession(String(req.userId));

    res.json({ session: active ? sessionView(active) : null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to read the timer' });
  }
});

router.post('/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body as { taskId?: unknown };
    const parsed = taskId === undefined || taskId === null ? null : Number(taskId);

    if (parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)) {
      return res.status(400).json({ error: 'taskId must be a positive integer' });
    }

    const session = await startSession(String(req.userId), parsed);

    res.status(201).json({ session: sessionView(session) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to start the timer' });
  }
});

router.post('/pause', authMiddleware, async (req: Request, res: Response) => {
  try {
    const session = await pauseSession(String(req.userId));

    if (!session) {
      return res.status(404).json({ error: 'No active timer' });
    }

    res.json({ session: sessionView(session) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to pause the timer' });
  }
});

router.post('/resume', authMiddleware, async (req: Request, res: Response) => {
  try {
    const session = await resumeSession(String(req.userId));

    if (!session) {
      return res.status(404).json({ error: 'No active timer' });
    }

    res.json({ session: sessionView(session) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to resume the timer' });
  }
});

/**
 * Завершение: возвращает, сколько минут записано.
 *
 * `minutes` нужен интерфейсу для короткой строки «записано 12 мин»; то же число
 * попадёт в сводку дня после перечитывания календаря.
 */
router.post('/finish', authMiddleware, async (req: Request, res: Response) => {
  try {
    const finished = await finishActive(String(req.userId));

    if (!finished) {
      return res.status(404).json({ error: 'No active timer' });
    }

    const view = sessionView(finished);

    res.json({ session: view, minutes: Math.max(0, Math.round(view.seconds / 60)) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to finish the timer' });
  }
});

export default router;
