import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import { checkAndAwardAchievements } from '../services/achievementManager';
import {
  INTERVAL_UNITS,
  currentStreak,
  isHabitDue,
  todayIso,
} from '../services/habitSchedule';

const router = express.Router();

/** Сдвиг даты на N дней: нужен для недельной сводки. */
const shiftDays = (iso: string, delta: number): string => {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + delta);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * Последние 7 дней: сколько привычек отмечено и сколько их было в тот день.
 * «Всего» считаем по дате создания — иначе новые привычки задним числом
 * ухудшали бы прошлые дни.
 */
const buildWeek = (habits: HabitRow[], today: string) => {
  const days: Array<{ date: string; done: number; total: number }> = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = shiftDays(today, -offset);
    const existed = habits.filter((habit) => habit.created_at.slice(0, 10) <= date);
    const done = existed.filter((habit) => (habit.completions ?? []).includes(date)).length;

    days.push({ date, done, total: existed.length });
  }

  return days;
};

interface HabitRow {
  id: number;
  title: string;
  zone: string | null;
  interval_count: number;
  interval_unit: string;
  due_date: string | null;
  reminder_enabled: boolean;
  reminder_time: string | null;
  created_at: string;
  template_id: number | null;
  icon: string | null;
  category: string | null;
  completions: string[];
}

const loadHabits = async (userId: string): Promise<HabitRow[]> => {
  const result = await pool.query(
    `SELECT h.id, h.title, h.zone, h.interval_count, h.interval_unit, h.due_date,
            h.reminder_enabled, h.reminder_time::text AS reminder_time,
            h.created_at::text AS created_at, h.template_id,
            t.icon, t.category,
            COALESCE(
              (SELECT array_agg(c.completed_on::text ORDER BY c.completed_on DESC)
                 FROM habit_completions c WHERE c.user_habit_id = h.id),
              ARRAY[]::text[]
            ) AS completions
       FROM user_habits h
       LEFT JOIN habit_templates t ON t.id = h.template_id
      WHERE h.user_id = $1 AND h.archived_at IS NULL
      ORDER BY h.created_at DESC, h.id DESC`,
    [userId]
  );

  return result.rows as HabitRow[];
};

const decorate = (habit: HabitRow, today: string) => {
  const completions = habit.completions ?? [];
  const lastCompletedOn = completions[0] ?? null;
  const doneToday = completions.includes(today);

  return {
    id: habit.id,
    title: habit.title,
    zone: habit.zone,
    icon: habit.icon ?? 'pi-check-circle',
    category: habit.category,
    intervalCount: habit.interval_count,
    intervalUnit: habit.interval_unit,
    dueDate: habit.due_date,
    reminderEnabled: habit.reminder_enabled,
    reminderTime: habit.reminder_time,
    isCustom: habit.template_id === null,
    doneToday,
    isDue: isHabitDue(habit, today),
    lastCompletedOn,
    streak: currentStreak(completions, today),
  };
};

/** Категории каталога с количеством шаблонов. */
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT category, COUNT(*)::int AS total
         FROM habit_templates
        WHERE is_published = TRUE
        GROUP BY category
        ORDER BY category`
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch habit categories' });
  }
});

/** Каталог готовых привычек с поиском и фильтром по категории. */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const result = await pool.query(
      `SELECT id, slug, title, description, category, icon,
              default_interval_count AS interval_count,
              default_interval_unit AS interval_unit,
              zone
         FROM habit_templates
        WHERE is_published = TRUE
          AND ($1 = '' OR category = $1)
          AND ($2 = '' OR title ILIKE '%' || $2 || '%' OR description ILIKE '%' || $2 || '%')
        ORDER BY position, id`,
      [category, query]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch habit templates' });
  }
});

/** Мои привычки: что актуально сегодня, что уже отмечено, серии. */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const today = todayIso();
    const rows = await loadHabits(String(req.userId));
    const habits = rows.map((habit) => decorate(habit, today));

    res.json({
      today,
      habits,
      dueToday: habits.filter((habit) => habit.isDue && !habit.doneToday).length,
      week: buildWeek(rows, today),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch habits' });
  }
});

/** Добавить привычку из каталога (templateId) или создать свою. */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      templateId?: number;
      title?: string;
      zone?: string | null;
      intervalCount?: number;
      intervalUnit?: string;
      dueDate?: string | null;
      reminderEnabled?: boolean;
      reminderTime?: string | null;
    };

    let title = (body.title ?? '').trim();
    let zone = body.zone?.trim() || null;
    let intervalCount = Number(body.intervalCount ?? 1);
    let intervalUnit = body.intervalUnit ?? 'day';
    let templateId: number | null = null;

    if (!INTERVAL_UNITS.has(intervalUnit)) {
      res.status(400).json({ error: 'Invalid interval unit' });
      return;
    }

    if (body.templateId) {
      const template = await pool.query(
        `SELECT id, title, zone, default_interval_count, default_interval_unit
           FROM habit_templates WHERE id = $1 AND is_published = TRUE`,
        [body.templateId]
      );

      if (template.rows.length === 0) {
        res.status(404).json({ error: 'Habit template not found' });
        return;
      }

      templateId = template.rows[0].id;
      title = template.rows[0].title;
      zone = template.rows[0].zone;
      intervalCount = template.rows[0].default_interval_count;
      intervalUnit = template.rows[0].default_interval_unit;
    }

    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const reminderEnabled = Boolean(body.reminderEnabled);
    // Напоминание без времени бессмысленно: ставим вечер по умолчанию.
    const reminderTime = reminderEnabled ? (body.reminderTime || '19:00') : null;

    const created = await pool.query(
      `INSERT INTO user_habits
         (user_id, template_id, title, zone, interval_count, interval_unit, due_date, reminder_enabled, reminder_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        req.userId,
        templateId,
        title,
        zone,
        Number.isFinite(intervalCount) && intervalCount > 0 ? intervalCount : 1,
        intervalUnit,
        body.dueDate || null,
        reminderEnabled,
        reminderTime,
      ]
    );

    const awarded = await checkAndAwardAchievements(String(req.userId));
    const habits = await loadHabits(String(req.userId));
    const habit = habits.find((item) => item.id === created.rows[0].id);

    res.status(201).json({
      habit: habit ? decorate(habit, todayIso()) : null,
      awarded,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create habit' });
  }
});

/** Изменить привычку. */
router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;

    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid habit id' });
      return;
    }

    const owned = await pool.query(
      'SELECT id FROM user_habits WHERE id = $1 AND user_id = $2 AND archived_at IS NULL',
      [id, req.userId]
    );

    if (owned.rows.length === 0) {
      res.status(404).json({ error: 'Habit not found' });
      return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    const push = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    if (typeof body.title === 'string' && body.title.trim()) {
      push('title', body.title.trim());
    }
    if (typeof body.zone === 'string' || body.zone === null) {
      push('zone', body.zone);
    }
    if (typeof body.intervalCount === 'number' && body.intervalCount > 0) {
      push('interval_count', Math.round(body.intervalCount));
    }
    if (typeof body.intervalUnit === 'string' && INTERVAL_UNITS.has(body.intervalUnit)) {
      push('interval_unit', body.intervalUnit);
    }
    if (typeof body.dueDate === 'string' || body.dueDate === null) {
      push('due_date', body.dueDate);
    }
    if (typeof body.reminderEnabled === 'boolean') {
      push('reminder_enabled', body.reminderEnabled);
    }
    if (typeof body.reminderTime === 'string' || body.reminderTime === null) {
      push('reminder_time', body.reminderTime);
    }

    if (fields.length === 0) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }

    values.push(id);
    await pool.query(`UPDATE user_habits SET ${fields.join(', ')} WHERE id = $${values.length}`, values);

    const habits = await loadHabits(String(req.userId));
    const habit = habits.find((item) => item.id === id);

    res.json({ habit: habit ? decorate(habit, todayIso()) : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update habit' });
  }
});

/** Убрать привычку из списка (архив, история отметок сохраняется). */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const result = await pool.query(
      `UPDATE user_habits SET archived_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
        RETURNING id`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Habit not found' });
      return;
    }

    res.json({ archived: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to archive habit' });
  }
});

/** Отметить или снять отметку за сегодня. */
router.post('/:id/toggle', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const today = todayIso();

    const owned = await pool.query(
      'SELECT id FROM user_habits WHERE id = $1 AND user_id = $2 AND archived_at IS NULL',
      [id, req.userId]
    );

    if (owned.rows.length === 0) {
      res.status(404).json({ error: 'Habit not found' });
      return;
    }

    const existing = await pool.query(
      'SELECT id FROM habit_completions WHERE user_habit_id = $1 AND completed_on = $2',
      [id, today]
    );

    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM habit_completions WHERE id = $1', [existing.rows[0].id]);
    } else {
      await pool.query(
        'INSERT INTO habit_completions (user_habit_id, completed_on) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, today]
      );
    }

    const awarded = await checkAndAwardAchievements(String(req.userId));
    const habits = await loadHabits(String(req.userId));
    const habit = habits.find((item) => item.id === id);

    res.json({ habit: habit ? decorate(habit, today) : null, awarded });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle habit' });
  }
});

export default router;
