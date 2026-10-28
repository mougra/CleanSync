import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { appToday } from '../services/appTime';
import { DEFAULT_TASKS_SCHEDULE_TITLE } from '../services/defaultTasks';
import { resolveContentLocale } from '../services/contentLocale';

/**
 * Готовые наборы задач.
 *
 * Раньше «взять шаблон» создавало отдельный личный чек-лист (`schedules` с
 * `source_template_id`), и его пункты жили своей жизнью: в план на сегодня они не
 * попадали, а раздел назывался «Чек-листы». Решение заказчика (28 октября 2026):
 * раздел становится «Мои задачи», готовые наборы — второй вкладкой, а «взять
 * набор» добавляет пункты **разово** в общий список: на сегодня, с частотой
 * «один раз». Никаких новых списков больше не создаётся.
 *
 * Шаблоны остаются публичными и переведёнными: они же служат контентом.
 */

const router = express.Router();

/** Публичные шаблоны чек-листов с количеством пунктов. */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const locale = resolveContentLocale(req);

    const result = await pool.query(
      `SELECT s.id,
              COALESCE(st.title, s.title) AS title,
              COALESCE(st.description, s.description) AS description,
              COUNT(t.id)::int AS items_count
         FROM schedules s
         LEFT JOIN schedule_translations st
                ON st.schedule_id = s.id AND st.locale = $1
         LEFT JOIN tasks t ON t.schedule_id = s.id
        WHERE s.is_template = TRUE AND s.is_seasonal = FALSE
        GROUP BY s.id, st.title, st.description
        ORDER BY s.id`,
      [locale]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch checklist templates' });
  }
});

/**
 * Мои прежние чек-листы.
 *
 * После миграции 0024 личные списки теряют `source_template_id` и становятся
 * обычными расписаниями: их пункты видны в «Моих задачах». Маршрут оставлен,
 * чтобы старый клиент не падал, и всегда отвечает пустым списком.
 */
router.get('/', authMiddleware, (_req: Request, res: Response) => {
  res.json([]);
});

/**
 * Добавить набор разово в «Мои задачи».
 *
 * Пункты копируются как разовые дела на сегодня (`frequency = 'once'`,
 * `due_date = сегодня`): человек берёт набор, чтобы сделать его сейчас, а не
 * заводит ещё один список. Повторный вызов добавляет ещё раз — это осознанное
 * «добавить», а не «открыть существующее».
 *
 * Расписание «Мои задачи» создаётся при необходимости под advisory-lock: два
 * одновременных нажатия иначе завели бы два расписания с одним названием.
 */
router.post('/from-template/:templateId', authMiddleware, async (req: Request, res: Response) => {
  const templateId = Number(req.params.templateId);

  if (!Number.isInteger(templateId)) {
    res.status(400).json({ error: 'Invalid template id' });
    return;
  }

  const client = await pool.connect();

  try {
    const locale = resolveContentLocale(req);

    const template = await client.query<{ id: number }>(
      'SELECT id FROM schedules WHERE id = $1 AND is_template = TRUE',
      [templateId]
    );

    if (template.rows.length === 0) {
      res.status(404).json({ error: 'Checklist template not found' });
      return;
    }

    const items = await client.query<{
      title: string;
      room: string | null;
      estimated_minutes: number | null;
    }>(
      `SELECT COALESCE(tt.title, t.title) AS title, t.room, t.estimated_minutes
         FROM tasks t
         LEFT JOIN task_translations tt ON tt.task_id = t.id AND tt.locale = $2
        WHERE t.schedule_id = $1
        ORDER BY t.id`,
      [templateId, locale]
    );

    await client.query('BEGIN');

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), $2::int)', [
      DEFAULT_TASKS_SCHEDULE_TITLE,
      req.userId,
    ]);

    const existing = await client.query<{ id: number }>(
      'SELECT id FROM schedules WHERE user_id = $1 AND title = $2 ORDER BY id LIMIT 1',
      [req.userId, DEFAULT_TASKS_SCHEDULE_TITLE]
    );

    let scheduleId = existing.rows[0]?.id;

    if (scheduleId === undefined) {
      const created = await client.query<{ id: number }>(
        `INSERT INTO schedules (user_id, title, description)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [req.userId, DEFAULT_TASKS_SCHEDULE_TITLE, 'Постоянные и разовые дела']
      );

      scheduleId = created.rows[0].id;
    }

    const today = appToday();

    for (const item of items.rows) {
      await client.query(
        `INSERT INTO tasks
           (schedule_id, title, room, estimated_minutes, frequency, interval_count, due_date)
         VALUES ($1, $2, $3, $4, 'once', 1, $5::date)`,
        [scheduleId, item.title, item.room, item.estimated_minutes ?? 0, today]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({ scheduleId, added: items.rows.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(err);
    res.status(500).json({ error: 'Failed to copy checklist template' });
  } finally {
    client.release();
  }
});

/** Один список с пунктами: старый адрес, оставлен ради совместимости. */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.title, s.description, s.created_at
         FROM schedules s
        WHERE s.id = $1 AND s.user_id = $2 AND s.is_template = FALSE`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Checklist not found' });
      return;
    }

    const items = await pool.query(
      `SELECT id, title AS text, room, estimated_minutes, is_completed AS done
         FROM tasks WHERE schedule_id = $1 ORDER BY id`,
      [req.params.id]
    );

    res.json({ checklist: { ...result.rows[0], items: items.rows } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch checklist' });
  }
});

/** Удалить список вместе с пунктами (старый адрес). */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM schedules WHERE id = $1 AND user_id = $2 AND is_template = FALSE RETURNING id',
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Checklist not found' });
      return;
    }

    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete checklist' });
  }
});

export default router;
