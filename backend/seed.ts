import dotenv from 'dotenv';
import pool from './db';
import { seedChallenges } from './seed-challenges';
import { seedHabitTemplates } from './seed-habits';

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
  // ── Задачи ──────────────────────────────────────────────────────────
  { code: 'first_step', name: 'Первый шаг', description: 'Выполните первую задачу по уборке', icon: 'pi-check-circle', criteriaType: 'total_completed', criteriaValue: 1 },
  { code: 'getting_started', name: 'Взялся за дело', description: 'Выполните 5 задач', icon: 'pi-play', criteriaType: 'total_completed', criteriaValue: 5 },
  { code: 'dedicated', name: 'Настойчивость', description: 'Выполните 10 задач по уборке', icon: 'pi-star', criteriaType: 'total_completed', criteriaValue: 10 },
  { code: 'quarter_century', name: 'Двадцать пять', description: 'Выполните 25 задач', icon: 'pi-chart-line', criteriaType: 'total_completed', criteriaValue: 25 },
  { code: 'pro_cleaner', name: 'Профессионал', description: 'Выполните 50 задач по уборке', icon: 'pi-trophy', criteriaType: 'total_completed', criteriaValue: 50 },
  { code: 'centurion', name: 'Сотня', description: 'Выполните 100 задач', icon: 'pi-crown', criteriaType: 'total_completed', criteriaValue: 100 },

  // ── Челленджи ───────────────────────────────────────────────────────
  { code: 'challenge_started', name: 'Любитель испытаний', description: 'Начните первое испытание', icon: 'pi-flag', criteriaType: 'challenges_started', criteriaValue: 1 },
  { code: 'challenge_three', name: 'Три испытания', description: 'Начните три испытания', icon: 'pi-flag-fill', criteriaType: 'challenges_started', criteriaValue: 3 },
  { code: 'challenge_finished', name: 'Финишёр', description: 'Завершите испытание до конца', icon: 'pi-verified', criteriaType: 'challenges_finished', criteriaValue: 1 },
  { code: 'challenge_finished_three', name: 'Марафонец', description: 'Завершите три испытания', icon: 'pi-trophy', criteriaType: 'challenges_finished', criteriaValue: 3 },
  { code: 'day_complete', name: 'Чек-лист завершён', description: 'Выполните все задачи одного дня', icon: 'pi-list-check', criteriaType: 'challenge_days_done', criteriaValue: 1 },
  { code: 'week_of_days', name: 'Целая неделя', description: 'Закройте семь дней челленджей', icon: 'pi-calendar', criteriaType: 'challenge_days_done', criteriaValue: 7 },

  // ── Привычки ────────────────────────────────────────────────────────
  { code: 'habit_added', name: 'Первая привычка', description: 'Добавьте привычку из каталога', icon: 'pi-plus-circle', criteriaType: 'habits_added', criteriaValue: 1 },
  { code: 'habit_three', name: 'Три привычки', description: 'Ведите три привычки одновременно', icon: 'pi-list', criteriaType: 'habits_added', criteriaValue: 3 },
  { code: 'habit_five', name: 'Пять привычек', description: 'Ведите пять привычек одновременно', icon: 'pi-th-large', criteriaType: 'habits_added', criteriaValue: 5 },
  { code: 'custom_habit', name: 'Своя привычка', description: 'Создайте привычку с нуля', icon: 'pi-pencil', criteriaType: 'custom_habits', criteriaValue: 1 },
  { code: 'custom_habit_three', name: 'Автор привычек', description: 'Создайте три свои привычки', icon: 'pi-file-edit', criteriaType: 'custom_habits', criteriaValue: 3 },
  { code: 'habit_first_check', name: 'Отмечено!', description: 'Отметьте привычку впервые', icon: 'pi-check', criteriaType: 'habit_checkins', criteriaValue: 1 },
  { code: 'habit_check_ten', name: 'Десять отметок', description: 'Отметьте привычки десять раз', icon: 'pi-check-square', criteriaType: 'habit_checkins', criteriaValue: 10 },
  { code: 'habit_check_fifty', name: 'Пятьдесят отметок', description: 'Отметьте привычки пятьдесят раз', icon: 'pi-verified', criteriaType: 'habit_checkins', criteriaValue: 50 },
  { code: 'habit_streak_three', name: 'Три дня подряд', description: 'Держите привычку три дня подряд', icon: 'pi-bolt', criteriaType: 'habit_streak', criteriaValue: 3 },
  { code: 'habit_streak_week', name: 'Неделя без пропусков', description: 'Держите привычку семь дней подряд', icon: 'pi-fire', criteriaType: 'habit_streak', criteriaValue: 7 },
  { code: 'habit_streak_month', name: 'Месяц привычки', description: 'Держите привычку тридцать дней подряд', icon: 'pi-crown', criteriaType: 'habit_streak', criteriaValue: 30 },
  { code: 'habit_variety', name: 'Разносторонний', description: 'Заведите привычки из трёх категорий', icon: 'pi-share-alt', criteriaType: 'habit_categories', criteriaValue: 3 },
  { code: 'habit_variety_five', name: 'Пять сфер', description: 'Заведите привычки из пяти категорий', icon: 'pi-globe', criteriaType: 'habit_categories', criteriaValue: 5 },
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
  {
    title: 'Прихожая',
    description: 'Зона, которая принимает весь поток вещей из внешнего мира.',
    isSeasonal: false,
    tasks: [
      'Разберите обувь по парам',
      'Повесьте верхнюю одежду',
      'Протрите дверь и ручки',
      'Разложите почту и пакеты',
      'Протрите плинтусы и пол',
    ],
  },
  {
    title: 'Балкон и хранение',
    description: 'Место, куда складывают «потом» — и забывают на год.',
    isSeasonal: false,
    tasks: [
      'Уберите то, что не по сезону',
      'Проверьте коробки и подпишите их',
      'Отложите лишнее на отдачу',
      'Подметите и протрите пол',
      'Протрите рамы и подоконник',
    ],
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

    const habitTemplates = await seedHabitTemplates(client);
    console.log(
      `Шаблоны привычек: создано ${habitTemplates.created}, уже существовало ${habitTemplates.skipped}`
    );

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
