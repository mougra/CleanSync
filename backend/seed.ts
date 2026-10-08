import dotenv from 'dotenv';
import pool from './db';
import { seedChallenges } from './seed-challenges';

dotenv.config();

/**
 * Идемпотентный сид: справочник достижений и стартовые шаблоны.
 *
 * Запускается вручную (`npm run db:seed`), а не при старте сервера: раньше сид
 * выполнялся на каждом буте и плодил дубликаты шаблонов (docs/PLAN.md §4.2).
 *
 * Повторный запуск безопасен: достижения обновляются по коду, шаблоны
 * проверяются по названию и не дублируются.
 */

interface AchievementSeed {
  code: string;
  name: string;
  description: string;
  icon: string;
  criteriaType: string;
  criteriaValue: number;
}

interface TemplateSeed {
  title: string;
  description: string;
  isSeasonal: boolean;
  tasks: string[];
}

const ACHIEVEMENTS: AchievementSeed[] = [
  {
    code: 'first_step',
    name: 'Первый шаг',
    description: 'Выполните первую задачу по уборке',
    icon: 'pi-check-circle',
    criteriaType: 'total_completed',
    criteriaValue: 1,
  },
  {
    code: 'dedicated',
    name: 'Настойчивость',
    description: 'Выполните 10 задач по уборке',
    icon: 'pi-star',
    criteriaType: 'total_completed',
    criteriaValue: 10,
  },
  {
    code: 'pro_cleaner',
    name: 'Профессионал',
    description: 'Выполните 50 задач по уборке',
    icon: 'pi-trophy',
    criteriaType: 'total_completed',
    criteriaValue: 50,
  },
];

const TEMPLATES: TemplateSeed[] = [
  {
    title: 'Весенний челлендж',
    description: 'Лёгкая весенняя уборка: проветрите комнаты, протрите поверхности...',
    isSeasonal: true,
    tasks: ['Освежите кухню', 'Ревизия в шкафах', 'Чистка санузла'],
  },
  {
    title: 'Летний челлендж',
    description: 'Легкая поддержка: проветривание, вынос мусора...',
    isSeasonal: true,
    tasks: ['Проверьте окна и балкон', 'Постирайте занавески', 'Обработайте сантехнику'],
  },
  {
    title: 'Зимний челлендж',
    description: 'Комфорт и порядок: уборка для уюта и безопасности...',
    isSeasonal: true,
    tasks: ['Организуйте шкафы', 'Почистите поверхности', 'Проверьте батареи'],
  },
  {
    title: 'Кухня',
    description: '',
    isSeasonal: false,
    tasks: [
      'Разгрузите столешницу',
      'Помойте посуду',
      'Вымойте раковину',
      'Замените полотенце',
      'Вытрите фасады',
      'Выбросьте мусор',
    ],
  },
  {
    title: 'Гостиная',
    description: '',
    isSeasonal: false,
    tasks: ['Сложите вещи', 'Пропылесосьте пол', 'Протрите телевизор', 'Проветрите комнату'],
  },
  {
    title: 'Ванная комната',
    description: '',
    isSeasonal: false,
    tasks: ['Протрите раковину', 'Чистка унитаза', 'Протирка зеркал', 'Поменяйте полотенца'],
  },
  {
    title: 'Спальня',
    description: '',
    isSeasonal: false,
    tasks: ['Заправьте кровать', 'Разберите вещи', 'Пропылесосьте пол', 'Протрите тумбочки'],
  },
];

const seed = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const a of ACHIEVEMENTS) {
      await client.query(
        `INSERT INTO achievements (code, name, description, icon, criteria_type, criteria_value)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           icon = EXCLUDED.icon,
           criteria_type = EXCLUDED.criteria_type,
           criteria_value = EXCLUDED.criteria_value`,
        [a.code, a.name, a.description, a.icon, a.criteriaType, a.criteriaValue]
      );
    }
    console.log(`Достижения: ${ACHIEVEMENTS.length} (обновлены/созданы)`);

    let created = 0;
    let skipped = 0;

    for (const t of TEMPLATES) {
      const existing = await client.query(
        'SELECT id FROM schedules WHERE is_template = TRUE AND title = $1 LIMIT 1',
        [t.title]
      );

      if (existing.rowCount) {
        skipped += 1;
        continue;
      }

      const inserted = await client.query(
        'INSERT INTO schedules (title, description, is_template, is_seasonal) VALUES ($1, $2, TRUE, $3) RETURNING id',
        [t.title, t.description, t.isSeasonal]
      );
      const scheduleId = inserted.rows[0].id;

      for (const taskTitle of t.tasks) {
        await client.query('INSERT INTO tasks (schedule_id, title) VALUES ($1, $2)', [scheduleId, taskTitle]);
      }
      created += 1;
    }

    const challenges = await seedChallenges(client);
    console.log(`Челленджи: создано ${challenges.created}, уже существовало ${challenges.skipped}`);

    await client.query('COMMIT');
    console.log(`Шаблоны: создано ${created}, уже существовало ${skipped}`);
  } catch (err) {    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

seed()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error('Сид не выполнен:', err instanceof Error ? err.message : err);
    console.error('Проверь, что PostgreSQL запущен и применены миграции: npm run migrate:up');
    await pool.end();
    process.exitCode = 1;
  });
