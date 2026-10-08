import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';

/**
 * Чек-листы: публичные шаблоны и личные списки пользователя.
 *
 * Пункт чек-листа — это обычная задача (`tasks`), поэтому отметки,
 * добавление и удаление пунктов идут через уже существующий `/api/tasks`
 * с проверкой владельца. Здесь только то, что специфично для чек-листов:
 * список шаблонов, копирование шаблона себе и прогресс.
 *
 * Личный чек-лист — это `schedules` с заполненным `source_template_id`.
 * Расписания без него остаются фичей «свои задачи».
 */

const router = express.Router();

interface ChecklistRow {
  id: number;
  title: string;
  description: string | null;
  source_template_id: number | null;
  created_at: string;
  total: number;
  done: number;
}

const loadChecklist = async (id: number, userId: string | number) => {
  const checklist = await pool.query<ChecklistRow>(
    `SELECT s.id, s.title, s.description, s.source_template_id, s.created_at,
            COUNT(t.id)::int AS total,
            COUNT(t.id) FILTER (WHERE t.is_completed)::int AS done
       FROM schedules s
       LEFT JOIN tasks t ON t.schedule_id = s.id
      WHERE s.id = $1 AND s.user_id = $2
      GROUP BY s.id`,
    [id, userId]
  );

  if (checklist.rows.length === 0) {
    return null;
  }

  const items = await pool.query(
    `SELECT id, title AS text, room, estimated_minutes, is_completed AS done
       FROM tasks WHERE schedule_id = $1 ORDER BY id`,
    [id]
  );

  return { ...checklist.rows[0], items: items.rows };
};

/** Публичные шаблоны чек-листов с количеством пунктов. */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.title, s.description, COUNT(t.id)::int AS items_count
         FROM schedules s
         LEFT JOIN tasks t ON t.schedule_id = s.id
        WHERE s.is_template = TRUE AND s.is_seasonal = FALSE
        GROUP BY s.id
        ORDER BY s.id`
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch checklist templates' });
  }
});

/** Мои чек-листы с прогрессом. */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query<ChecklistRow>(
      `SELECT s.id, s.title, s.description, s.source_template_id, s.created_at,
              COUNT(t.id)::int AS total,
              COUNT(t.id) FILTER (WHERE t.is_completed)::int AS done
         FROM schedules s
         LEFT JOIN tasks t ON t.schedule_id = s.id
        WHERE s.user_id = $1 AND s.is_template = FALSE AND s.source_template_id IS NOT NULL
        GROUP BY s.id
        ORDER BY s.created_at DESC`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch checklists' });
  }
});

/** Добавить шаблон себе. Повторный вызов возвращает уже созданный чек-лист. */
router.post('/from-template/:templateId', authMiddleware, async (req: Request, res: Response) => {
  const templateId = Number(req.params.templateId);

  if (!Number.isInteger(templateId)) {
    res.status(400).json({ error: 'Invalid template id' });
    return;
  }

  const client = await pool.connect();

  try {
    const template = await client.query(
      'SELECT id, title, description FROM schedules WHERE id = $1 AND is_template = TRUE',
      [templateId]
    );

    if (template.rows.length === 0) {
      res.status(404).json({ error: 'Checklist template not found' });
      return;
    }

    const existing = await client.query(
      'SELECT id FROM schedules WHERE user_id = $1 AND source_template_id = $2',
      [req.userId, templateId]
    );

    if (existing.rows.length > 0) {
      res.json({ checklist: await loadChecklist(existing.rows[0].id, req.userId!), created: false });
      return;
    }

    await client.query('BEGIN');

    const created = await client.query(
      `INSERT INTO schedules (user_id, title, description, source_template_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.userId, template.rows[0].title, template.rows[0].description, templateId]
    );

    // Копируем пункты шаблона, отметки начинаются с нуля.
    await client.query(
      `INSERT INTO tasks (schedule_id, title, room, estimated_minutes)
       SELECT $1, t.title, t.room, t.estimated_minutes
         FROM tasks t WHERE t.schedule_id = $2 ORDER BY t.id`,
      [created.rows[0].id, templateId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      checklist: await loadChecklist(created.rows[0].id, req.userId!),
      created: true,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error(err);
    res.status(500).json({ error: 'Failed to copy checklist template' });
  } finally {
    client.release();
  }
});

/** Один чек-лист с пунктами. */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const checklist = await loadChecklist(Number(req.params.id), req.userId!);

    if (!checklist) {
      res.status(404).json({ error: 'Checklist not found' });
      return;
    }

    res.json({ checklist });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch checklist' });
  }
});

/** Удалить чек-лист вместе с пунктами. */
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
