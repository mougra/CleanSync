import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import schedulesLRoutes from './routes/schedules';
import tasksRoutes from './routes/tasks';
import achievementsRoutes from './routes/achievements';
import analyticsRoutes from './routes/analytics';
import templatesRoutes from './routes/templates';
import pool from './db';

dotenv.config();

const app = express();

const ensureDatabaseSchema = async (): Promise<void> => {
  const queries = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_confirmed BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirm_token VARCHAR(255);`,
    `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;`,
    `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS is_seasonal BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE schedules DROP COLUMN IF EXISTS user_id; ALTER TABLE schedules ADD COLUMN IF NOT EXISTS user_id INT;`,
    `CREATE TABLE IF NOT EXISTS achievements (id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE NOT NULL, name VARCHAR(255) NOT NULL, description TEXT, icon VARCHAR(100), criteria_type VARCHAR(50) NOT NULL, criteria_value INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS user_achievements (id SERIAL PRIMARY KEY, user_id INT NOT NULL, achievement_id INT NOT NULL, earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE, UNIQUE(user_id, achievement_id));`,
    `INSERT INTO achievements (code, name, description, icon, criteria_type, criteria_value) VALUES ('first_step', 'First Step', 'Complete your first cleaning task!', 'pi-check-circle', 'total_completed', 1), ('dedicated', 'Dedicated', 'Complete 10 cleaning tasks!', 'pi-star', 'total_completed', 10), ('pro_cleaner', 'Pro Cleaner', 'Complete 50 cleaning tasks!', 'pi-trophy', 'total_completed', 50) ON CONFLICT (code) DO NOTHING;`
  ];

  for (const query of queries) {
    try {
      await pool.query(query);
    } catch (err) {
      console.error('Schema migration failed:', err);
    }
  }

  await seedTemplates();
};

const seedTemplates = async () => {
  const templates = [
    { title: 'Весенний челлендж', desc: 'Лёгкая весенняя уборка: проветрите комнаты, протрите поверхности...', isSeasonal: true, tasks: ['Освежите кухню', 'Ревизия в шкафах', 'Чистка санузла'] },
    { title: 'Летний челлендж', desc: 'Легкая поддержка: проветривание, вынос мусора...', isSeasonal: true, tasks: ['Проверьте окна и балкон', 'Постирайте занавески', 'Обработайте сантехнику'] },
    { title: 'Зимний челлендж', desc: 'Комфорт и порядок: уборка для уюта и безопасности...', isSeasonal: true, tasks: ['Организуйте шкафы', 'Почистите поверхности', 'Проверьте батареи'] },
    { title: 'Кухня', desc: '', isSeasonal: false, tasks: ['Разгрузите столешницу', 'Помойте посуду', 'Вымойте раковину', 'Замените полотенце', 'Вытрите фасады', 'Выбросьте мусор'] },
    { title: 'Гостиная', desc: '', isSeasonal: false, tasks: ['Сложите вещи', 'Пропылесосьте пол', 'Протрите телевизор', 'Проветрите комнату'] },
    { title: 'Ванная комната', desc: '', isSeasonal: false, tasks: ['Протрите раковину', 'Чистка унитаза', 'Протирка зеркал', 'Поменяйте полотенца'] },
    { title: 'Спальня', desc: '', isSeasonal: false, tasks: ['Заправьте кровать', 'Разберите вещи', 'Пропылесосьте пол', 'Протрите тумбочки'] },
  ];

  for (const t of templates) {
    const res = await pool.query(
      'INSERT INTO schedules (title, description, is_template, is_seasonal) VALUES ($1, $2, TRUE, $3) RETURNING id',
      [t.title, t.desc, t.isSeasonal]
    );
    const scheduleId = res.rows[0].id;
    for (const taskTitle of t.tasks) {
      await pool.query('INSERT INTO tasks (schedule_id, title) VALUES ($1, $2)', [scheduleId, taskTitle]);
    }
  }
};

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'Backend is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/schedules', schedulesLRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/templates', templatesRoutes);

const PORT = process.env.PORT || 5000;

ensureDatabaseSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to ensure database schema', err);
    process.exit(1);
  });
