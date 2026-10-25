import express, { Request, Response } from 'express';
import { authMiddleware } from '../auth';
import { requestClock } from '../services/appTime';
import { endVacation, getStreakState, setWeeklyGoal, startVacation } from '../services/streak';

const router = express.Router();

/**
 * Часы запроса: день человека и смещение его пояса.
 *
 * Серия считается по дням, и «сегодня» в ней обязано совпадать с тем, что человек
 * видит на экране. Поэтому день приходит из заголовков
 * (`X-Client-Date` / `X-Client-Offset`), а без них берётся день приложения.
 */
const clockOf = (req: Request) =>
  requestClock(req.headers['x-client-date'], req.headers['x-client-offset']);

/** Состояние серии: текущая, лучшая, заморозки и недельная цель. */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json(await getStreakState(String(req.userId), clockOf(req)));
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
    res.json(await getStreakState(String(req.userId), clockOf(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update weekly goal' });
  }
});

/**
 * Режим отпуска: включить и выключить.
 *
 * Пока он включён, главная показывает вместо задач состояние отпуска, а серия за
 * пропущенные дни не рвётся (services/streak.ts): дни отпуска — «мост» между
 * активными днями. Задачи при этом никуда не деваются и не сдвигаются: человек
 * вернётся — план снова будет на месте, с сегодняшнего дня.
 *
 * Оба действия возвращают свежее состояние серии: интерфейсу не нужно делать
 * второй запрос, чтобы показать или скрыть блок отпуска.
 */
router.post('/vacation', authMiddleware, async (req: Request, res: Response) => {
  try {
    await startVacation(String(req.userId), clockOf(req));
    res.json(await getStreakState(String(req.userId), clockOf(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start vacation' });
  }
});

router.delete('/vacation', authMiddleware, async (req: Request, res: Response) => {
  try {
    await endVacation(String(req.userId), clockOf(req));
    res.json(await getStreakState(String(req.userId), clockOf(req)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to end vacation' });
  }
});

export default router;
