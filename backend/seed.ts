import dotenv from 'dotenv';
import pool from './db';
import { seedChallenges, validateChallengeSeeds, validateChallengeTranslations } from './seed-challenges';
import { HABIT_TEMPLATES, seedHabitTemplates } from './seed-habits';
import { ACHIEVEMENT_EN, validateAchievementTranslations } from './content/en/achievements';
import { validateHabitTranslations } from './content/en/habits';
import { TEMPLATE_EN, validateTemplateTranslations } from './content/en/templates';
import { validateCatalogTranslations } from './content/en/taskCatalog';
import { validateTaskSetTranslations } from './content/en/taskSets';
import {
  getTaskCatalog,
  taskCatalogSize,
  taskCountByLevel,
  validateTaskCatalog,
} from './services/taskCatalog';
import { getBaseTasks, getExtraTasks, setStats, validateTaskSets } from './services/taskSets';
import { upsertTranslation } from './services/translations';

dotenv.config();

/**
 * Идемпотентный сид: справочник достижений и стартовые шаблоны.
 *
 * Запускается вручную (`npm run seed`), а не при старте сервера: раньше сид
 * выполнялся на каждом буте и плодил дубликаты шаблонов.
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
  /**
   * Каталог задач «Настройки по дому» живёт в коде (services/taskCatalog.ts):
   * из него генератор собирает план, в БД попадают уже конкретные задачи
   * пользователя. Сид его не заливает, а проверяет — дубли названий, пустые
   * поля и неизвестные теги ломают генератор незаметно, поэтому падаем здесь.
   */
  const catalogProblems = validateTaskCatalog();

  if (catalogProblems.length > 0) {
    throw new Error(`Каталог задач некорректен:\n  - ${catalogProblems.join('\n  - ')}`);
  }

  const byLevel = taskCountByLevel();
  console.log(
    `Каталог задач: ${taskCatalogSize()} (лёгких ${byLevel.light}, обычных ${byLevel.normal}, глубоких ${byLevel.deep})`
  );

  /**
   * Переводы каталога проверяем здесь же: из каталога собирается план по дому,
   * и задача без английского названия вылезет русской в англоязычном плане.
   * Ключ — русское название: у записи каталога другого стабильного ключа нет.
   */
  const catalogTranslationProblems = validateCatalogTranslations(
    getTaskCatalog().map((task) => task.task),
  );

  if (catalogTranslationProblems.length > 0) {
    throw new Error(
      `Переводы каталога задач некорректны:\n  - ${catalogTranslationProblems.join('\n  - ')}`,
    );
  }

  /**
   * Курируемые наборы (база для всех + расширения по анкете) проверяются здесь
   * же: в план идут именно они, а библиотека каталога остаётся источником
   * страниц зон. Дубль названия ломает идемпотентность набора (ключ — название),
   * минуты сверх потолка — дневной бюджет, неизвестный контекст — тихо
   * выключенное расширение.
   */
  const setProblems = validateTaskSets();

  if (setProblems.length > 0) {
    throw new Error(`Наборы задач некорректны:\n  - ${setProblems.join('\n  - ')}`);
  }

  const setTitles = [...getBaseTasks(), ...getExtraTasks()].map((task) => task.task);
  const setTranslationProblems = validateTaskSetTranslations(setTitles);

  if (setTranslationProblems.length > 0) {
    throw new Error(
      `Переводы задач наборов некорректны:\n  - ${setTranslationProblems.join('\n  - ')}`,
    );
  }

  const baseStats = setStats(getBaseTasks());
  console.log(
    `Базовый набор: ${baseStats.totalTasks} задач, ${baseStats.totalMinutes} мин, ` +
      `средняя ${baseStats.averagePerDay} мин/день; расширений ${getExtraTasks().length}`,
  );

  /**
   * Сезонные челленджи проверяем до записи: главная выбирает челлендж по сезону,
   * и пропущенный сезон выглядит как «челленджа нет», а не как ошибка наполнения.
   */
  const challengeProblems = validateChallengeSeeds();

  if (challengeProblems.length > 0) {
    throw new Error(`Наполнение челленджей некорректно:\n  - ${challengeProblems.join('\n  - ')}`);
  }

  const challengeTranslationProblems = validateChallengeTranslations();

  if (challengeTranslationProblems.length > 0) {
    throw new Error(
      `Переводы челленджей некорректны:\n  - ${challengeTranslationProblems.join('\n  - ')}`,
    );
  }

  /**
   * Английские переводы достижений проверяем до записи: справочник достижений
   * показывается и в интерфейсе, и в тосте о получении, поэтому название без
   * перевода вылезет русским посреди английского экрана.
   */
  const achievementTranslationProblems = validateAchievementTranslations(
    ACHIEVEMENTS.map((a) => a.code),
  );

  if (achievementTranslationProblems.length > 0) {
    throw new Error(
      `Переводы достижений некорректны:\n  - ${achievementTranslationProblems.join('\n  - ')}`,
    );
  }

  /**
   * Переводы шаблонов и привычек проверяем так же до записи. У шаблонов нет
   * стабильного ключа — сверяем наборы названий целиком, чтобы переименованный
   * пункт не остался с прежним (и уже неверным) переводом.
   */
  const templateTranslationProblems = validateTemplateTranslations(TEMPLATES);

  if (templateTranslationProblems.length > 0) {
    throw new Error(
      `Переводы шаблонов некорректны:\n  - ${templateTranslationProblems.join('\n  - ')}`,
    );
  }

  const habitTranslationProblems = validateHabitTranslations(
    HABIT_TEMPLATES.map((template) => template.slug),
  );

  if (habitTranslationProblems.length > 0) {
    throw new Error(
      `Переводы привычек некорректны:\n  - ${habitTranslationProblems.join('\n  - ')}`,
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const a of ACHIEVEMENTS) {
      const saved = await client.query<{ id: number }>(
        `INSERT INTO achievements (code, name, description, icon, criteria_type, criteria_value)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           icon = EXCLUDED.icon,
           criteria_type = EXCLUDED.criteria_type,
           criteria_value = EXCLUDED.criteria_value
         RETURNING id`,
        [a.code, a.name, a.description, a.icon, a.criteriaType, a.criteriaValue]
      );

      const achievementId = saved.rows[0]?.id;
      const translation = ACHIEVEMENT_EN[a.code];

      if (achievementId && translation) {
        await upsertTranslation(client, {
          table: 'achievement_translations',
          keyColumn: 'achievement_id',
          key: achievementId,
          locale: 'en',
          fields: { name: translation.name, description: translation.description },
        });
      }
    }
    console.log(`Достижения: ${ACHIEVEMENTS.length} (обновлены/созданы, с переводом)`);

    let created = 0;
    let skipped = 0;

    /**
     * Шаблоны не пересоздаём (идемпотентность), но перевод пишем всегда — и для
     * уже существующего расписания тоже: иначе английскими стали бы только
     * шаблоны, добавленные после этой правки, а весь прежний набор остался бы
     * русским. Пункты берём из базы: у существующего расписания их id уже есть,
     * а у нового они только что вставлены.
     */
    for (const t of TEMPLATES) {
      const existing = await client.query<{ id: number }>(
        'SELECT id FROM schedules WHERE is_template = TRUE AND title = $1 LIMIT 1',
        [t.title]
      );

      let scheduleId = existing.rows[0]?.id;

      if (scheduleId) {
        skipped += 1;
      } else {
        const inserted = await client.query<{ id: number }>(
          'INSERT INTO schedules (title, description, is_template, is_seasonal) VALUES ($1, $2, TRUE, $3) RETURNING id',
          [t.title, t.description, t.isSeasonal]
        );

        scheduleId = inserted.rows[0]?.id;

        for (const taskTitle of t.tasks) {
          await client.query('INSERT INTO tasks (schedule_id, title) VALUES ($1, $2)', [
            scheduleId,
            taskTitle,
          ]);
        }

        created += 1;
      }

      const translation = TEMPLATE_EN[t.title];

      if (!scheduleId || !translation) {
        continue;
      }

      await upsertTranslation(client, {
        table: 'schedule_translations',
        keyColumn: 'schedule_id',
        key: scheduleId,
        locale: 'en',
        fields: { title: translation.title, description: translation.description },
      });

      const templateTasks = await client.query<{ id: number; title: string }>(
        'SELECT id, title FROM tasks WHERE schedule_id = $1',
        [scheduleId]
      );

      for (const task of templateTasks.rows) {
        const taskTitleEn = translation.tasks[task.title];

        if (!taskTitleEn) {
          continue;
        }

        await upsertTranslation(client, {
          table: 'task_translations',
          keyColumn: 'task_id',
          key: task.id,
          locale: 'en',
          fields: { title: taskTitleEn },
        });
      }
    }

    const challenges = await seedChallenges(client);
    console.log(`Челленджи: создано ${challenges.created}, обновлено ${challenges.updated}`);

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
