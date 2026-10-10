import express, { Request, Response } from 'express';
import { authMiddleware } from '../auth';
import { getStreakState, setWeeklyGoal } from '../services/streak';

const router = express.Router();

/** Состояние серии: текущая, лучшая, заморозки и недельная цель. */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json(await getStreakState(String(req.userId)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch streak' });
  }
});

/** Недельная цель: сколько дней с уборкой человек хочет закрывать за неделю. */
router.patch('/goal', authMiddleware, async (req: Request, res: Response) => {
  try {
    const weeklyDays = Number(req.body?.weeklyDays);

    if (!Number.isInteger(weeklyDays) || weeklyDays < 1 || weeklyDays > 7) {
      res.status(400).json({ error: 'weeklyDays must be between 1 and 7' });
      return;
    }

    await setWeeklyGoal(String(req.userId), weeklyDays);
    res.json(await getStreakState(String(req.userId)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update weekly goal' });
  }
});

export default router;
