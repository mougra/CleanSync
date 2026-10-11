import type { PoolClient } from 'pg';
import type { Season } from './services/seasons';

/**
 * Челленджи: марафон по дням с задачами.
 *
 * Челлендж — отдельная сущность, а не «ещё один список задач»: его задачи не
 * попадают в `GET /api/tasks/today` и в счётчики «Мои задачи» / «План по дому»
 * (backend/routes/tasks.ts читает только свои `schedules`/`tasks`). Прогресс
 * живёт в `user_challenges` + `user_task_progress`, отметка задачи работает
 * сразу, без кнопки «начать» (backend/routes/challenges.ts).
 *
 * Четыре сезонных челленджа по календарным сезонам: у каждого свой набор дел
 * и своя длина (5–6 дней по 3–4 задачи). Длина дней и сами задачи — про сезон,
 * а не про конкретную дату: челлендж открывается целиком, когда пришёл его сезон
 * (`GET /api/challenges/current`), и закрывается пользователем вручную.
 *
 * Формулировки задач короткие и конкретные — по образцу каталога
 * `services/taskCatalog.ts`, часть текстов переиспользована оттуда.
 *
 * Сид идемпотентный по slug и обновляет содержимое на месте: повторный запуск
 * `npm run seed` дописывает недостающие дни и задачи, обновляет тексты и
 * убирает лишнее. Идентификаторы дней и задач при этом сохраняются, поэтому
 * уже отмеченный прогресс пользователей не теряется (важно: прогресс ссылается
 * на challenge_tasks.id, и пересоздание задач стёрло бы историю).
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
  season: Season;
  position: number;
  /** Обложка карточки: файл из web/public/photos (источники — docs/design/photos.md). */
  cover: string;
  days: ChallengeDaySeed[];
}

/** Регулярные дела, которые возвращаются в разные дни и не привязаны к сезону. */
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
  airing: {
    title: 'Проветрить все комнаты по 10 минут',
    room: 'По всему дому',
    minutes: 10,
    frequency: 'daily' as TaskFrequency,
  },
};

export const CHALLENGES: ChallengeSeed[] = [
  {
    slug: 'vesennyaya-uborka',
    title: 'Весенняя уборка',
    description:
      'Шесть дней по 1,5–2 часа: дом после зимы — окна, шкафы, балкон и кухня. Разовые дела по зонам плюс короткий регулярный уход.',
    season: 'spring',
    position: 1,
    cover: '/photos/spring-cleaning.jpg',
    days: [
      {
        day: 1,
        title: 'Окна и свет',
        subtitle: 'Главное дело весны — вернуть дневной свет',
        tasks: [
          { title: 'Помыть окна', hint: 'стёкла, рамы, откосы', room: 'Окна', minutes: 45 },
          { title: 'Постирать и повесить шторы', room: 'Окна', minutes: 30, frequency: 'weekly' },
          { title: 'Протереть подоконники и светильники', room: 'Окна', minutes: 20 },
          recurring.switches,
        ],
      },
      {
        day: 2,
        title: 'Проветрить и вымыть после зимы',
        subtitle: 'Зимняя пыль и застоявшийся воздух',
        tasks: [
          { title: 'Проветрить все комнаты по 15 минут', room: 'По всему дому', minutes: 20 },
          { title: 'Протереть радиаторы и плинтусы', hint: 'пыль от отопления', room: 'По всему дому', minutes: 30 },
          { title: 'Вымыть твёрдые полы', room: 'По всему дому', minutes: 40, frequency: 'weekly' },
          recurring.airing,
        ],
      },
      {
        day: 3,
        title: 'Шкаф и гардероб',
        subtitle: 'Зимнее — на хранение, лишнее — на отдачу',
        tasks: [
          { title: 'Разобрать шкаф с одеждой по сезону', room: 'Спальня', minutes: 45 },
          { title: 'Убрать 10 вещей на отдачу', room: 'Спальня', minutes: 25 },
          { title: 'Помыть и убрать зимнюю обувь', room: 'Прихожая', minutes: 30 },
          recurring.switches,
        ],
      },
      {
        day: 4,
        title: 'Кухня и балкон',
        subtitle: 'Два места, где зима оставляет больше всего следов',
        tasks: [
          { title: 'Разобрать и вымыть полки в шкафах', room: 'Кухня', minutes: 40 },
          { title: 'Вымыть балкон и протереть перила', room: 'Балкон', minutes: 35 },
          { title: 'Протереть сушилку и балконную мебель', room: 'Балкон', minutes: 20 },
          recurring.quickKitchen,
        ],
      },
      {
        day: 5,
        title: 'Ванная и прихожая',
        tasks: [
          { title: 'Отмыть плитку и душевую', room: 'Ванная', minutes: 40 },
          { title: 'Разобрать средства и заменить полотенца', room: 'Ванная', minutes: 25 },
          { title: 'Разобрать обувной шкаф в прихожей', room: 'Прихожая', minutes: 30 },
          recurring.trash,
        ],
      },
      {
        day: 6,
        title: 'Финальные штрихи',
        subtitle: 'Пройти по дому и собрать забытое',
        tasks: [
          { title: 'Протереть забытые места', hint: 'двери, выключатели, зеркала', room: 'По всему дому', minutes: 30 },
          { title: 'Проверить комнаты и убрать лишнее', room: 'По всему дому', minutes: 25 },
          { title: 'Добавить уютную деталь', hint: 'растение, цветы, свеча', room: 'Гостиная', minutes: 20 },
          recurring.floors,
        ],
      },
    ],
  },
  {
    slug: 'letnyaya-svezhest',
    title: 'Летняя свежесть',
    description:
      'Пять дней по 1–1,5 часа: прохлада и свежесть в жару — холодильник, кухонные шкафы, техника и проветривание.',
    season: 'summer',
    position: 2,
    cover: '/photos/kitchen-white.jpg',
    days: [
      {
        day: 1,
        title: 'Холодильник и морозилка',
        subtitle: 'Самое важное летом — холод и чистота',
        tasks: [
          { title: 'Разобрать холодильник и выбросить просрочку', room: 'Кухня', minutes: 40 },
          { title: 'Вымыть полки и ящики морозилки', room: 'Кухня', minutes: 30 },
          { title: 'Вымыть холодильник снаружи и сзади', room: 'Кухня', minutes: 25 },
          recurring.trash,
        ],
      },
      {
        day: 2,
        title: 'Кухонные шкафы',
        tasks: [
          { title: 'Разобрать шкаф с крупами и специями', room: 'Кухня', minutes: 35 },
          { title: 'Протереть кухонные шкафчики внутри', room: 'Кухня', minutes: 30 },
          { title: 'Вымыть вытяжку и фартук', room: 'Кухня', minutes: 30 },
          recurring.quickKitchen,
        ],
      },
      {
        day: 3,
        title: 'Пыль за техникой',
        subtitle: 'Летом пыль и шерсть особенно заметны',
        tasks: [
          { title: 'Отодвинуть и пропылесосить за техникой', hint: 'плита, холодильник, стиральная машина', room: 'Кухня', minutes: 35 },
          { title: 'Протереть технику и провода', room: 'По всему дому', minutes: 25 },
          { title: 'Пропылесосить ковры и мягкую мебель', room: 'По всему дому', minutes: 35 },
          recurring.floors,
        ],
      },
      {
        day: 4,
        title: 'Проветривание и кондиционер',
        tasks: [
          { title: 'Помыть фильтры кондиционера', hint: 'или решётки вентиляции', room: 'По всему дому', minutes: 25 },
          { title: 'Проветрить комнаты в прохладные часы', room: 'По всему дому', minutes: 15 },
          { title: 'Постирать и заменить полотенца', room: 'Ванная', minutes: 20, frequency: 'weekly' },
          recurring.switches,
        ],
      },
      {
        day: 5,
        title: 'Балкон и текстиль',
        tasks: [
          { title: 'Вымыть пол и перила на балконе', room: 'Балкон', minutes: 30 },
          { title: 'Постирать шторы и покрывала', room: 'По всему дому', minutes: 35, frequency: 'weekly' },
          { title: 'Убрать зимний текстиль на хранение', room: 'По всему дому', minutes: 25 },
          recurring.airing,
        ],
      },
    ],
  },
  {
    slug: 'osennee-obnovlenie-doma',
    title: 'Осеннее обновление дома',
    description:
      'Шесть дней по 1,5 часа: подготовка дома к холодам — утепление, сезонная одежда, кухня, балкон и окна к зиме.',
    season: 'autumn',
    position: 3,
    cover: '/photos/autumn-home.jpg',
    days: [
      {
        day: 1,
        title: 'Окна и текстиль',
        tasks: [
          { title: 'Помыть окна перед холодами', room: 'Окна', minutes: 45 },
          { title: 'Постирать и повесить шторы', room: 'Окна', minutes: 30, frequency: 'weekly' },
          { title: 'Проветрить и просушить комнаты', room: 'По всему дому', minutes: 20 },
          recurring.switches,
        ],
      },
      {
        day: 2,
        title: 'Гардероб',
        subtitle: 'Тёплое — в шкаф, летнее — на хранение',
        tasks: [
          { title: 'Разобрать шкаф с одеждой по сезону', room: 'Спальня', minutes: 45 },
          { title: 'Достать тёплые вещи и убрать летние', room: 'Спальня', minutes: 30 },
          { title: 'Убрать 10 вещей на отдачу', room: 'Спальня', minutes: 25 },
          recurring.floors,
        ],
      },
      {
        day: 3,
        title: 'Кухня и заготовки',
        tasks: [
          { title: 'Разобрать шкафы и проверить сроки', room: 'Кухня', minutes: 35 },
          { title: 'Помыть холодильник внутри', room: 'Кухня', minutes: 30, frequency: 'weekly' },
          { title: 'Протереть банки и полки под заготовки', room: 'Кухня', minutes: 25 },
          recurring.quickKitchen,
        ],
      },
      {
        day: 4,
        title: 'Балкон и сушка',
        subtitle: 'После дождей всё нужно просушить',
        tasks: [
          { title: 'Разобрать балкон и просушить вещи', room: 'Балкон', minutes: 40 },
          { title: 'Вымыть пол и перила на балконе', room: 'Балкон', minutes: 30 },
          { title: 'Вынести лишнее и убрать мусор', room: 'По всему дому', minutes: 25 },
          recurring.trash,
        ],
      },
      {
        day: 5,
        title: 'Утепление и тепло',
        tasks: [
          { title: 'Проверить батареи и развоздушить', room: 'По всему дому', minutes: 30 },
          { title: 'Утеплить окна и двери', room: 'Окна', minutes: 40 },
          { title: 'Проверить чердак, щели и пороги', hint: 'через них уходит тепло', room: 'По всему дому', minutes: 30 },
          recurring.airing,
        ],
      },
      {
        day: 6,
        title: 'Окна к зиме',
        subtitle: 'Финальная проверка перед холодами',
        tasks: [
          { title: 'Проверить фурнитуру и уплотнители окон', room: 'Окна', minutes: 30 },
          { title: 'Протереть подоконники и откосы', room: 'Окна', minutes: 25 },
          { title: 'Заменить перегоревшие лампочки', room: 'По всему дому', minutes: 20 },
          recurring.switches,
        ],
      },
    ],
  },
  {
    slug: 'zimniy-komfort',
    title: 'Зимний комфорт',
    description:
      'Пять дней по часу: уют и безопасность зимой — реагенты в прихожей, сушка обуви, пыль от отопления и новогодний разбор.',
    season: 'winter',
    position: 4,
    cover: '/photos/laundry.jpg',
    days: [
      {
        day: 1,
        title: 'Прихожая после реагентов',
        subtitle: 'Соль и грязь с улицы не должны расходиться по дому',
        tasks: [
          { title: 'Вымыть пол в прихожей от реагентов', room: 'Прихожая', minutes: 25, frequency: 'every2days' },
          { title: 'Постелить и прополоскать коврик у двери', room: 'Прихожая', minutes: 15, frequency: 'weekly' },
          { title: 'Протереть двери, ручки и плинтусы', room: 'Прихожая', minutes: 20 },
          recurring.switches,
        ],
      },
      {
        day: 2,
        title: 'Сушка обуви',
        tasks: [
          { title: 'Просушить зимнюю обувь', hint: 'без батареи — при комнатной температуре', room: 'Прихожая', minutes: 20 },
          { title: 'Почистить и обработать обувь', hint: 'пропитка от влаги и соли', room: 'Прихожая', minutes: 30 },
          { title: 'Разложить обувь по парам и убрать лишнее', room: 'Прихожая', minutes: 15 },
          recurring.trash,
        ],
      },
      {
        day: 3,
        title: 'Уборка от пыли отопления',
        subtitle: 'От батарей пыль летит по всей квартире',
        tasks: [
          { title: 'Протереть радиаторы и подоконники', room: 'По всему дому', minutes: 30 },
          { title: 'Провести влажную уборку полов', room: 'По всему дому', minutes: 35, frequency: 'weekly' },
          { title: 'Протереть двери, полки и технику', room: 'По всему дому', minutes: 25 },
          recurring.airing,
        ],
      },
      {
        day: 4,
        title: 'Новогодний разбор',
        subtitle: 'После праздников — снять, упаковать и подписать',
        tasks: [
          { title: 'Убрать и подписать новогодние украшения', room: 'По всему дому', minutes: 35 },
          { title: 'Снять гирлянды и проверить провода', room: 'Гостиная', minutes: 20 },
          { title: 'Разобрать место, где стояла ёлка', room: 'Гостиная', minutes: 25 },
          recurring.floors,
        ],
      },
      {
        day: 5,
        title: 'Уют и воздух',
        tasks: [
          { title: 'Постирать пледы и подушки', room: 'Спальня', minutes: 30, frequency: 'weekly' },
          { title: 'Проветрить комнаты и увлажнить воздух', room: 'По всему дому', minutes: 20, frequency: 'daily' },
          { title: 'Добавить зимний свет и текстиль', hint: 'свечи, тёплые пледы', room: 'Гостиная', minutes: 25 },
          recurring.quickKitchen,
        ],
      },
    ],
  },
];

/**
 * Идемпотентный сид: челлендж обновляется по slug на месте.
 *
 * Дни и задачи обновляются, а не пересоздаются: `user_task_progress` ссылается
 * на `challenge_tasks.id`, и пересоздание задач стёрло бы уже отмеченный
 * прогресс. Лишние дни и задачи (если набор сократился) удаляются.
 */
export const seedChallenges = async (
  client: PoolClient
): Promise<{ created: number; updated: number }> => {
  let created = 0;
  let updated = 0;

  for (const challenge of CHALLENGES) {
    const tasksCount = challenge.days.reduce((sum, day) => sum + day.tasks.length, 0);

    const existing = await client.query<{ id: number }>(
      'SELECT id FROM challenges WHERE slug = $1',
      [challenge.slug]
    );

    let challengeId: number;

    if (existing.rowCount) {
      challengeId = existing.rows[0].id;

      await client.query(
        `UPDATE challenges
            SET title = $2, description = $3, season = $4, days_count = $5,
                tasks_count = $6, is_published = TRUE, position = $7, cover_url = $8
          WHERE id = $1`,
        [
          challengeId,
          challenge.title,
          challenge.description,
          challenge.season,
          challenge.days.length,
          tasksCount,
          challenge.position,
          challenge.cover,
        ]
      );

      updated += 1;
    } else {
      const inserted = await client.query<{ id: number }>(
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

      challengeId = inserted.rows[0].id;
      created += 1;
    }

    for (const day of challenge.days) {
      const dayRow = await client.query<{ id: number }>(
        `INSERT INTO challenge_days (challenge_id, day_number, title, subtitle)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (challenge_id, day_number)
         DO UPDATE SET title = EXCLUDED.title, subtitle = EXCLUDED.subtitle
         RETURNING id`,
        [challengeId, day.day, day.title, day.subtitle ?? null]
      );

      const dayId = dayRow.rows[0].id;

      for (const [index, task] of day.tasks.entries()) {
        await client.query(
          `INSERT INTO challenge_tasks (challenge_day_id, position, title, hint, room, estimated_minutes, frequency)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (challenge_day_id, position)
           DO UPDATE SET title = EXCLUDED.title, hint = EXCLUDED.hint, room = EXCLUDED.room,
                         estimated_minutes = EXCLUDED.estimated_minutes, frequency = EXCLUDED.frequency`,
          [
            dayId,
            index + 1,
            task.title,
            task.hint ?? null,
            task.room ?? null,
            task.minutes,
            task.frequency ?? 'once',
          ]
        );
      }

      // Если набор задач в дне сократился, хвост лишних позиций удаляем.
      await client.query('DELETE FROM challenge_tasks WHERE challenge_day_id = $1 AND position > $2', [
        dayId,
        day.tasks.length,
      ]);
    }

    // Если дней стало меньше, лишние убираем вместе с их задачами.
    await client.query('DELETE FROM challenge_days WHERE challenge_id = $1 AND day_number > $2', [
      challengeId,
      challenge.days.length,
    ]);
  }

  return { created, updated };
};

/**
 * Проверка наполнения до записи в базу: у каждого сезона должен быть ровно один
 * опубликованный челлендж, иначе `GET /api/challenges/current` для пропущенного
 * сезона отвечает `status: 'none'`, и главная молча остаётся без челленджа.
 */
export const validateChallengeSeeds = (): string[] => {
  const problems: string[] = [];
  const seen = new Map<string, number>();

  for (const challenge of CHALLENGES) {
    seen.set(challenge.season, (seen.get(challenge.season) ?? 0) + 1);

    if (challenge.days.length === 0) {
      problems.push(`${challenge.slug}: нет ни одного дня`);
    }

    for (const day of challenge.days) {
      if (day.tasks.length === 0) {
        problems.push(`${challenge.slug}, день ${day.day}: нет задач`);
      }

      for (const task of day.tasks) {
        if (task.title.trim().length === 0) {
          problems.push(`${challenge.slug}, день ${day.day}: пустое название задачи`);
        }

        if (!Number.isInteger(task.minutes) || task.minutes <= 0) {
          problems.push(`${challenge.slug}, день ${day.day}: «${task.title}» без времени`);
        }
      }
    }
  }

  for (const season of ['spring', 'summer', 'autumn', 'winter'] as Season[]) {
    const count = seen.get(season) ?? 0;

    if (count !== 1) {
      problems.push(`сезон ${season}: челленджей ${count}, а нужен ровно один`);
    }
  }

  return problems;
};
