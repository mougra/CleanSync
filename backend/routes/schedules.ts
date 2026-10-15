import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { resolveContentLocale } from '../services/contentLocale';
import { relocalizeGeneratedContent } from '../services/generatedContent';

const router = express.Router();

/**
 * Названия и описания расписаний на языке запроса.
 *
 * Русские колонки остаются языком по умолчанию; английские подписи лежат в
 * `schedule_translations` — у шаблонов из сида и у сгенерированных расписаний
 * («Мои задачи», «План по дому»), названия которых служат ключом в коде.
 */
const SCHEDULE_COLUMNS = `s.id,
  COALESCE(st.title, s.title) AS title,
  COALESCE(st.description, s.description) AS description,
  s.created_at, s.updated_at`;

const SCHEDULE_TRANSLATION_JOIN = (placeholder: string) =>
  `LEFT JOIN schedule_translations st ON st.schedule_id = s.id AND st.locale = ${placeholder}`;

// Get all schedules for user
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const locale = resolveContentLocale(req);

    const result = await pool.query(
      `SELECT ${SCHEDULE_COLUMNS}
         FROM schedules s
         ${SCHEDULE_TRANSLATION_JOIN('$2')}
        WHERE s.user_id = $1
        ORDER BY s.created_at DESC`,
      [req.userId, locale]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Get seasonal schedules for user
router.get('/seasonal', authMiddleware, async (req: Request, res: Response) => {
  try {
    const locale = resolveContentLocale(req);

    const schedulesResult = await pool.query(
      `SELECT ${SCHEDULE_COLUMNS}
         FROM schedules s
         ${SCHEDULE_TRANSLATION_JOIN('$2')}
        WHERE s.user_id = $1 AND s.is_seasonal = TRUE
        ORDER BY s.created_at DESC`,
      [req.userId, locale]
    );

    const seasonalSchedules = await Promise.all(
      schedulesResult.rows.map(async (schedule) => {
        const tasksResult = await pool.query(
          `SELECT t.id, COALESCE(tt.title, t.title) AS title, t.frequency, t.interval_count,
                  t.day_of_week, t.day_of_month, t.due_date, t.time, t.is_completed,
                  t.created_at, t.estimated_minutes, t.room
             FROM tasks t
             LEFT JOIN task_translations tt ON tt.task_id = t.id AND tt.locale = $2
            WHERE t.schedule_id = $1
            ORDER BY t.day_of_week, t.time`,
          [schedule.id, locale]
        );
        return { ...schedule, tasks: tasksResult.rows };
      })
    );

    res.json(seasonalSchedules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch seasonal schedules' });
  }
});

// Get single schedule with tasks
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const locale = resolveContentLocale(req);

    const scheduleResult = await pool.query(
      `SELECT ${SCHEDULE_COLUMNS}
         FROM schedules s
         ${SCHEDULE_TRANSLATION_JOIN('$3')}
        WHERE s.id = $1 AND s.user_id = $2`,
      [id, req.userId, locale]
    );

    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const schedule = scheduleResult.rows[0];

    const tasksResult = await pool.query(
      `SELECT t.id, COALESCE(tt.title, t.title) AS title, t.frequency, t.interval_count,
              t.day_of_week, t.day_of_month, t.due_date, t.time, t.is_completed, t.created_at
         FROM tasks t
         LEFT JOIN task_translations tt ON tt.task_id = t.id AND tt.locale = $2
        WHERE t.schedule_id = $1
        ORDER BY t.day_of_week, t.time`,
      [id, locale]
    );

    res.json({
      ...schedule,
      tasks: tasksResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Create schedule
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    const result = await pool.query(
      'INSERT INTO schedules (user_id, title, description) VALUES ($1, $2, $3) RETURNING id, title, description, created_at, updated_at',
      [req.userId, title, description || null]
    );

    /**
     * Клиент заводит расписание «Мои задачи» сам (и ищет его потом по этому же
     * названию), поэтому перевод для него кладём сразу: иначе в английском
     * интерфейсе подпись расписания осталась бы русской до смены языка.
     */
    const locale = resolveContentLocale(req);

    if (locale !== 'ru' && result.rows[0]?.id) {
      await relocalizeGeneratedContent(req.userId!, locale);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// Update schedule
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    // Check ownership
    const ownerResult = await pool.query(
      'SELECT user_id FROM schedules WHERE id = $1',
      [id]
    );

    if (ownerResult.rows.length === 0 || String(ownerResult.rows[0].user_id) !== String(req.userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await pool.query(
      'UPDATE schedules SET title = COALESCE($1, title), description = COALESCE($2, description), updated_at = NOW() WHERE id = $3 RETURNING id, title, description, created_at, updated_at',
      [title || null, description || null, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// Delete schedule
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check ownership
    const ownerResult = await pool.query(
      'SELECT user_id FROM schedules WHERE id = $1',
      [id]
    );

    if (ownerResult.rows.length === 0 || String(ownerResult.rows[0].user_id) !== String(req.userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Delete tasks first (foreign key)
    await pool.query('DELETE FROM tasks WHERE schedule_id = $1', [id]);

    // Delete schedule
    await pool.query('DELETE FROM schedules WHERE id = $1', [id]);

    res.json({ message: 'Schedule deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

export default router;
