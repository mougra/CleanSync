import type { PoolClient } from 'pg';

/**
 * Челленджи: марафон по дням с задачами.
 *
 * Тексты «Весенней уборки» взяты из макетов docs/design/mockups
 * (дни 1-5 и 7). День 6 «Пол и поверхности» собран из блока, который на скрине
 * дня 5 идёт отдельным разделом: иначе 7 дней не дают ровно 35 задач, как
 * написано в макете. Если тема дня 6 другая — поправить здесь и пересеять.
 */

export interface ChallengeTaskSeed {
  title: string;
  hint?: string;
  room?: string;
  minutes?: number;
}

export interface ChallengeDaySeed {
  day: number;
  title: string;
  subtitle?: string;
  tasks: ChallengeTaskSeed[];
}

export interface ChallengeSeed {
  slug: string;
  title: string;
  description: string;
  season: string;
  position: number;
  days: ChallengeDaySeed[];
}

export const CHALLENGES: ChallengeSeed[] = [
  {
    slug: 'vesennyaya-uborka',
    title: 'Весенняя уборка',
    description: '7 дней по 5 небольших шагов — и дом становится свежим без генеральной уборки за один день.',
    season: 'spring',
    position: 1,
    days: [
      {
        day: 1,
        title: 'Освежаем прихожую и гостиную',
        tasks: [
          { title: 'Убрать поверхности в прихожей', hint: 'почта, ключи, обувь', room: 'Прихожая' },
          { title: 'Протереть пыль в гостиной', hint: 'полки, столы', room: 'Гостиная' },
          { title: 'Пропылесосить или подмести пол', room: 'Гостиная', minutes: 15 },
          { title: 'Протереть выключатели и ручки дверей', room: 'Гостиная' },
          { title: 'Проветрить помещение', room: 'Гостиная' },
        ],
      },
      {
        day: 2,
        title: 'Порядок на кухне',
        tasks: [
          { title: 'Очистить и протереть столешницы', room: 'Кухня', minutes: 15 },
          { title: 'Организовать один ящик или шкаф', room: 'Кухня', minutes: 15 },
          {
            title: 'Протереть технику',
            hint: 'микроволновка, ручки холодильника',
            room: 'Кухня',
          },
          { title: 'Вынести мусор', room: 'Кухня' },
          { title: 'Подмести или вымыть пол', room: 'Кухня', minutes: 15 },
        ],
      },
      {
        day: 3,
        title: 'Обновляем спальню',
        tasks: [
          { title: 'Разобрать тумбочки и комод', room: 'Спальня', minutes: 15 },
          { title: 'Аккуратно заправить кровать', room: 'Спальня' },
          { title: 'Протереть прикроватные поверхности', room: 'Спальня' },
          { title: 'Разобрать шкаф', hint: 'убрать 3 вещи на отдачу', room: 'Спальня', minutes: 20 },
          { title: 'Пропылесосить или подмести пол', room: 'Спальня', minutes: 15 },
        ],
      },
      {
        day: 4,
        title: 'Освежаем ванную',
        tasks: [
          { title: 'Протереть зеркала и поверхности', room: 'Ванная' },
          { title: 'Почистить раковину и кран', room: 'Ванная', minutes: 15 },
          {
            title: 'Разобрать средства, выбросить пустые упаковки',
            room: 'Ванная',
          },
          { title: 'Заменить полотенца и коврики', room: 'Ванная' },
          { title: 'Почистить унитаз', room: 'Ванная', minutes: 15 },
        ],
      },
      {
        day: 5,
        title: 'Разобрать и организовать',
        subtitle: 'Сразу вынести лишнее',
        tasks: [
          { title: 'Выбрать небольшую зону беспорядка', minutes: 5 },
          { title: 'Отсортировать: оставить, отдать, выбросить', minutes: 20 },
          { title: 'Аккуратно организовать нужное', minutes: 20 },
          { title: 'Протереть поверхности' },
          { title: 'Сразу вынести лишнее' },
        ],
      },
      {
        day: 6,
        title: 'Пол и поверхности',
        tasks: [
          { title: 'Пропылесосить ковры', minutes: 15 },
          { title: 'Вымыть твёрдые полы', minutes: 20 },
          { title: 'Протереть мебель и электронику', minutes: 15 },
          { title: 'Протереть ручки и выключатели' },
          { title: 'Встряхнуть коврики и подушки' },
        ],
      },
      {
        day: 7,
        title: 'Финальные штрихи',
        tasks: [
          { title: 'Проверить комнаты' },
          { title: 'Добавить уютную деталь', hint: 'растение, свеча, цветы' },
          { title: 'Быстро убрать в зонах с высокой проходимостью', minutes: 15 },
          { title: 'Протереть забытые места' },
          { title: 'Насладиться чистым домом!' },
        ],
      },
    ],
  },
  {
    slug: 'osennee-obnovlenie-doma',
    title: 'Осеннее обновление дома',
    description: 'Подготовь дом к холодам: окна, тепло, гардероб и уют за пять дней.',
    season: 'autumn',
    position: 2,
    days: [
      {
        day: 1,
        title: 'Окна и свет',
        tasks: [
          { title: 'Помыть окна', minutes: 30 },
          { title: 'Протереть подоконники' },
          { title: 'Постирать шторы', minutes: 20 },
          { title: 'Заменить перегоревшие лампочки' },
        ],
      },
      {
        day: 2,
        title: 'Тепло в доме',
        tasks: [
          { title: 'Проверить батареи', minutes: 15 },
          { title: 'Утеплить окна' },
          { title: 'Постирать пледы', minutes: 20 },
          { title: 'Достать тёплые вещи' },
        ],
      },
      {
        day: 3,
        title: 'Гардероб',
        tasks: [
          { title: 'Разобрать летние вещи', minutes: 20 },
          { title: 'Отложить лишнее на отдачу' },
          { title: 'Помыть и просушить обувь', minutes: 20 },
          { title: 'Убрать сезонное на хранение', minutes: 15 },
        ],
      },
      {
        day: 4,
        title: 'Кухня к зиме',
        tasks: [
          { title: 'Разобрать шкафы', minutes: 20 },
          { title: 'Проверить запасы и сроки', minutes: 15 },
          { title: 'Помыть холодильник', minutes: 25 },
          { title: 'Протереть технику' },
        ],
      },
      {
        day: 5,
        title: 'Уют',
        tasks: [
          { title: 'Добавить текстиль' },
          { title: 'Расставить свечи и декор' },
          { title: 'Проветрить все комнаты' },
          { title: 'Насладиться домом!' },
        ],
      },
    ],
  },
];

/** Идемпотентно: челлендж с существующим slug пропускается целиком. */
export const seedChallenges = async (
  client: PoolClient
): Promise<{ created: number; skipped: number }> => {
  let created = 0;
  let skipped = 0;

  for (const challenge of CHALLENGES) {
    const existing = await client.query('SELECT id FROM challenges WHERE slug = $1', [challenge.slug]);

    if (existing.rowCount) {
      skipped += 1;
      continue;
    }

    const tasksCount = challenge.days.reduce((sum, day) => sum + day.tasks.length, 0);

    const inserted = await client.query(
      `INSERT INTO challenges (slug, title, description, season, days_count, tasks_count, is_published, position)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
       RETURNING id`,
      [
        challenge.slug,
        challenge.title,
        challenge.description,
        challenge.season,
        challenge.days.length,
        tasksCount,
        challenge.position,
      ]
    );

    const challengeId = inserted.rows[0].id;

    for (const day of challenge.days) {
      const dayRow = await client.query(
        'INSERT INTO challenge_days (challenge_id, day_number, title, subtitle) VALUES ($1, $2, $3, $4) RETURNING id',
        [challengeId, day.day, day.title, day.subtitle ?? null]
      );

      const dayId = dayRow.rows[0].id;
      let position = 0;

      for (const task of day.tasks) {
        position += 1;
        await client.query(
          `INSERT INTO challenge_tasks (challenge_day_id, position, title, hint, room, estimated_minutes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [dayId, position, task.title, task.hint ?? null, task.room ?? null, task.minutes ?? 10]
        );
      }
    }

    created += 1;
  }

  return { created, skipped };
};
