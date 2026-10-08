import type { PoolClient } from 'pg';

/**
 * Челленджи: марафон по дням с задачами.
 *
 * Темы дней взяты из макетов docs/design/mockups (дни 1-7 «Весенней уборки»).
 * Наполнение переработано: в каждом дне 3 «разовые» задачи по 25-45 минут
 * и 1-2 задачи регулярного ухода (10-25 минут) с меткой частоты — так видно,
 * что часть дел повторяется, а не делается один раз в год.
 *
 * ВАЖНО: сид идемпотентный по slug, поэтому при изменении текстов нужно
 * удалить челлендж и запустить `npm run seed` заново. Пока нет админки
 * контента — это ручной шаг.
 */

export type TaskFrequency = 'once' | 'daily' | 'every2days' | 'weekly';

export interface ChallengeTaskSeed {
  title: string;
  hint?: string;
  room?: string;
  minutes: number;
  frequency?: TaskFrequency;
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
  /** Обложка карточки: файл из web/public/photos (источники — docs/design/photos.md). */
  cover: string;
  days: ChallengeDaySeed[];
}

/** Регулярные дела, которые возвращаются в разные дни. */
const recurring = {
  quickKitchen: {
    title: 'Быстрая уборка кухни за 15 минут',
    hint: 'столешница, раковина, крошки',
    room: 'Кухня',
    minutes: 15,
    frequency: 'daily' as TaskFrequency,
  },
  switches: {
    title: 'Протереть выключатели, ручки дверей и пульты',
    room: 'По всему дому',
    minutes: 10,
    frequency: 'every2days' as TaskFrequency,
  },
  trash: {
    title: 'Вынести мусор и протереть ведро',
    room: 'Кухня',
    minutes: 10,
    frequency: 'every2days' as TaskFrequency,
  },
  floors: {
    title: 'Пропылесосить или подмести пол',
    room: 'По всему дому',
    minutes: 25,
    frequency: 'weekly' as TaskFrequency,
  },
};

export const CHALLENGES: ChallengeSeed[] = [
  {
    slug: 'vesennyaya-uborka',
    title: 'Весенняя уборка',
    description:
      'Семь дней по 1,5–2 часа: разовые дела по зонам плюс короткий регулярный уход. Дом свежеет без генеральной уборки за один день.',
    season: 'spring',
    position: 1,
    cover: '/photos/spring-cleaning.jpg',
    days: [
      {
        day: 1,
        title: 'Освежаем прихожую и гостиную',
        tasks: [
          { title: 'Разобрать прихожую', hint: 'почта, ключи, обувь, сумки', room: 'Прихожая', minutes: 25 },
          { title: 'Протереть пыль в гостиной', hint: 'полки, столы, подоконники', room: 'Гостиная', minutes: 30 },
          { title: 'Помыть зеркала и стеклянные поверхности', room: 'Гостиная', minutes: 25 },
          recurring.switches,
          recurring.floors,
        ],
      },
      {
        day: 2,
        title: 'Порядок на кухне',
        tasks: [
          { title: 'Освободить и вымыть столешницы', room: 'Кухня', minutes: 30 },
          { title: 'Разобрать один шкаф или ящик', hint: 'просроченное — в мусор', room: 'Кухня', minutes: 40 },
          {
            title: 'Протереть технику',
            hint: 'микроволновка, холодильник, вытяжка',
            room: 'Кухня',
            minutes: 35,
            frequency: 'weekly',
          },
          recurring.trash,
          recurring.quickKitchen,
        ],
      },
      {
        day: 3,
        title: 'Обновляем спальню',
        tasks: [
          { title: 'Разобрать тумбочки и комод', room: 'Спальня', minutes: 35 },
          { title: 'Разобрать шкаф', hint: 'убрать 3 вещи на отдачу', room: 'Спальня', minutes: 45 },
          { title: 'Сменить постельное бельё', room: 'Спальня', minutes: 25, frequency: 'weekly' },
          recurring.floors,
          recurring.switches,
        ],
      },
      {
        day: 4,
        title: 'Освежаем ванную',
        tasks: [
          { title: 'Отмыть плитку и душевую', room: 'Ванная', minutes: 40 },
          {
            title: 'Почистить раковину, кран и полки',
            room: 'Ванная',
            minutes: 25,
            frequency: 'every2days',
          },
          { title: 'Почистить унитаз', room: 'Ванная', minutes: 20, frequency: 'weekly' },
          { title: 'Разобрать средства и заменить полотенца', room: 'Ванная', minutes: 25 },
          recurring.trash,
        ],
      },
      {
        day: 5,
        title: 'Разобрать и организовать',
        subtitle: 'Сразу вынести лишнее',
        tasks: [
          {
            title: 'Отсортировать вещи в выбранной зоне',
            hint: 'оставить, отдать, выбросить',
            minutes: 45,
          },
          { title: 'Организовать удобное хранение', minutes: 40 },
          { title: 'Протереть поверхности в разобранной зоне', minutes: 30 },
          recurring.switches,
          recurring.quickKitchen,
        ],
      },
      {
        day: 6,
        title: 'Пол и поверхности',
        tasks: [
          { title: 'Пропылесосить ковры', room: 'По всему дому', minutes: 30, frequency: 'weekly' },
          { title: 'Вымыть твёрдые полы', room: 'По всему дому', minutes: 40, frequency: 'weekly' },
          {
            title: 'Протереть мебель и электронику',
            room: 'Гостиная',
            minutes: 35,
            frequency: 'every2days',
          },
          {
            title: 'Встряхнуть коврики и подушки',
            room: 'По всему дому',
            minutes: 15,
            frequency: 'weekly',
          },
          recurring.trash,
        ],
      },
      {
        day: 7,
        title: 'Финальные штрихи',
        tasks: [
          { title: 'Проверить комнаты и собрать забытое', minutes: 25 },
          {
            title: 'Протереть забытые места',
            hint: 'плинтусы, подоконники, светильники',
            minutes: 40,
          },
          { title: 'Добавить уютную деталь', hint: 'растение, свеча, цветы', minutes: 40 },
          recurring.switches,
          recurring.quickKitchen,
        ],
      },
    ],
  },
  {
    slug: 'osennee-obnovlenie-doma',
    title: 'Осеннее обновление дома',
    description: 'Подготовь дом к холодам: окна, тепло, гардероб и уют за пять дней по 1,5 часа.',
    season: 'autumn',
    position: 2,
    cover: '/photos/autumn-home.jpg',
    days: [
      {
        day: 1,
        title: 'Окна и свет',
        tasks: [
          { title: 'Помыть окна', minutes: 45 },
          { title: 'Протереть подоконники и откосы', minutes: 25 },
          { title: 'Постирать и повесить шторы', minutes: 30, frequency: 'weekly' },
          { title: 'Заменить перегоревшие лампочки', minutes: 20 },
        ],
      },
      {
        day: 2,
        title: 'Тепло в доме',
        tasks: [
          { title: 'Проверить батареи и развоздушить', minutes: 30 },
          { title: 'Утеплить окна и двери', minutes: 40 },
          { title: 'Постирать пледы и покрывала', minutes: 30, frequency: 'weekly' },
          { title: 'Достать тёплые вещи', minutes: 25 },
        ],
      },
      {
        day: 3,
        title: 'Гардероб',
        tasks: [
          { title: 'Разобрать летние вещи', minutes: 40 },
          { title: 'Отложить лишнее на отдачу', minutes: 30 },
          { title: 'Помыть и просушить обувь', minutes: 35 },
          { title: 'Убрать сезонное на хранение', minutes: 30 },
        ],
      },
      {
        day: 4,
        title: 'Кухня к зиме',
        tasks: [
          { title: 'Разобрать шкафы и проверить сроки', minutes: 40 },
          { title: 'Помыть холодильник внутри', minutes: 40, frequency: 'weekly' },
          { title: 'Протереть технику', minutes: 25, frequency: 'every2days' },
          { title: 'Вынести мусор и протереть ведро', minutes: 10, frequency: 'every2days' },
        ],
      },
      {
        day: 5,
        title: 'Уют',
        tasks: [
          { title: 'Добавить текстиль и свет', minutes: 35 },
          { title: 'Расставить декор и свечи', minutes: 25 },
          { title: 'Проветрить все комнаты', minutes: 20, frequency: 'daily' },
          { title: 'Насладиться домом!', minutes: 20 },
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
      `INSERT INTO challenges (slug, title, description, season, days_count, tasks_count, is_published, position, cover_url)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)
       RETURNING id`,
      [
        challenge.slug,
        challenge.title,
        challenge.description,
        challenge.season,
        challenge.days.length,
        tasksCount,
        challenge.position,
        challenge.cover,
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
          `INSERT INTO challenge_tasks (challenge_day_id, position, title, hint, room, estimated_minutes, frequency)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            dayId,
            position,
            task.title,
            task.hint ?? null,
            task.room ?? null,
            task.minutes,
            task.frequency ?? 'once',
          ]
        );
      }
    }

    created += 1;
  }

  return { created, skipped };
};
