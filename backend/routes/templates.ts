import express, { Request, Response } from 'express';
import pool from '../db';
import { resolveContentLocale } from '../services/contentLocale';

const router = express.Router();

// Get public templates (Seasonal challenges and General checklist)
router.get('/', async (req: Request, res: Response) => {
  try {
    const locale = resolveContentLocale(req);

    // Названия и описания шаблонов отдаём на языке запроса: русские колонки —
    // язык по умолчанию, английский лежит в таблицах переводов, и `COALESCE`
    // оставляет русскую строку там, где перевода ещё нет.
    const schedulesResult = await pool.query(
      `SELECT s.id,
              COALESCE(st.title, s.title) AS title,
              COALESCE(st.description, s.description) AS description,
              s.is_seasonal
         FROM schedules s
         LEFT JOIN schedule_translations st
                ON st.schedule_id = s.id AND st.locale = $1
        WHERE s.is_template = TRUE
        ORDER BY s.is_seasonal DESC, s.created_at ASC`,
      [locale]
    );
    const schedules = schedulesResult.rows;

    // Fetch tasks for these templates
    const templateIds = schedules.map(s => s.id);
    let tasks = [];
    if (templateIds.length > 0) {
      const tasksResult = await pool.query(
        `SELECT t.id, t.schedule_id,
                COALESCE(tt.title, t.title) AS title,
                t.is_completed
           FROM tasks t
           LEFT JOIN task_translations tt
                  ON tt.task_id = t.id AND tt.locale = $2
          WHERE t.schedule_id = ANY($1)
          ORDER BY t.id ASC`,
        [templateIds, locale]
      );
      tasks = tasksResult.rows;
    }

    // Organize data into seasonal challenges and general checklist
    const seasonal = schedules
      .filter(s => s.is_seasonal)
      .map(s => ({
        title: s.title,
        desc: s.description,
        steps: tasks.filter(t => t.schedule_id === s.id).map(t => t.title)
      }));

    const checklist = schedules
      .filter(s => !s.is_seasonal)
      .map(s => ({
        title: s.title,
        items: tasks.filter(t => t.schedule_id === s.id).map(t => ({
          id: t.id,
          text: t.title,
          done: t.is_completed
        }))
      }));

    res.json({
      seasonal,
      checklist
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

export default router;
