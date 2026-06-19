import express, { Request, Response } from 'express';
import pool from '../db';

const router = express.Router();

// Get public templates (Seasonal challenges and General checklist)
router.get('/', async (req: Request, res: Response) => {
  try {
    // Fetch all template schedules
    const schedulesResult = await pool.query(
      'SELECT * FROM schedules WHERE is_template = TRUE ORDER BY is_seasonal DESC, created_at ASC'
    );
    const schedules = schedulesResult.rows;

    // Fetch tasks for these templates
    const templateIds = schedules.map(s => s.id);
    let tasks = [];
    if (templateIds.length > 0) {
      const tasksResult = await pool.query(
        'SELECT * FROM tasks WHERE schedule_id = ANY($1) ORDER BY id ASC',
        [templateIds]
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
