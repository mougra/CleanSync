import type { PoolClient } from 'pg';
import { HABIT_TEMPLATE_EN } from './content/en/habits';
import { zoneEn } from './content/en/zones';
import { upsertTranslation } from './services/translations';

/**
 * Каталог готовых привычек.
 *
 * Первые три и часть «Планирования» взяты из макетов docs/design/mockups
 * («привычки 2»), остальное — общепринятые практики домашних дел: короткие
 * ежедневные действия, которые поддерживают порядок без генеральной уборки.
 *
 * Категории: home, family, selfcare, health, growth, pets, plants, planning.
 *
 * `health` и `growth` добавлены вместе с привычками «для себя»: зарядка, язык,
 * чтение. Часть узких уборочных шаблонов при этом убрана — их место занимают
 * действия, которые поддерживают человека, а не только дом.
 *
 * Единицы повторения: once | day | week | month.
 */

export interface HabitTemplateSeed {
  slug: string;
  title: string;
  description: string;
  category:
    | 'home'
    | 'family'
    | 'selfcare'
    | 'health'
    | 'growth'
    | 'pets'
    | 'plants'
    | 'planning';
  icon: string;
  intervalCount: number;
  intervalUnit: 'once' | 'day' | 'week' | 'month';
  zone?: string;
}

export const HABIT_TEMPLATES: HabitTemplateSeed[] = [
  // ── Дом ─────────────────────────────────────────────────────────────
  {
    slug: 'five-minutes-kitchen',
    title: 'Пять минут для порядка на кухне',
    description: 'Уберите лишнее, освободите раковину и сотрите крошки. Через пять минут остановитесь.',
    category: 'home',
    icon: 'pi-sparkles',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Кухня',
  },
  {
    slug: 'clear-hallway',
    title: 'Освободить прихожую',
    description: 'Поставьте повседневную обувь парами, повесьте верхнюю одежду и освободите проход.',
    category: 'home',
    icon: 'pi-key',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Прихожая',
  },
  {
    slug: 'sink-shine',
    title: 'Вымыть раковину',
    description: 'Ополоснуть и протереть насухо — сухая раковина выглядит чистой весь день.',
    category: 'home',
    icon: 'pi-filter',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Кухня',
  },
  {
    slug: 'vacuum-living-room',
    title: 'Пропылесосить или подмести пол',
    description: 'Одна комната за раз: пылесос на десять минут, и пол снова выглядит ухоженным.',
    category: 'home',
    icon: 'pi-sparkles',
    intervalCount: 3,
    intervalUnit: 'day',
    zone: 'По всему дому',
  },
  {
    slug: 'take-out-trash',
    title: 'Вынести мусор',
    description: 'Заодно протрите ведро внутри — запах не появится.',
    category: 'home',
    icon: 'pi-trash',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Кухня',
  },
  {
    slug: 'make-bed',
    title: 'Заправить кровать',
    description: 'Одно движение утром — и комната уже выглядит собранной.',
    category: 'home',
    icon: 'pi-moon',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Спальня',
  },
  {
    slug: 'laundry-one-load',
    title: 'Одна загрузка стирки',
    description: 'Стирайте небольшими партиями: так вещи не копятся и не мнутся в корзине.',
    category: 'home',
    icon: 'pi-refresh',
    intervalCount: 2,
    intervalUnit: 'day',
    zone: 'Ванная',
  },

  // ── Семья ───────────────────────────────────────────────────────────
  {
    slug: 'tidy-toys',
    title: 'Собрать игрушки по местам',
    description: 'Коробки по категориям и правило «одна история за раз» — убирать становится проще.',
    category: 'family',
    icon: 'pi-box',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Детская',
  },
  {
    slug: 'dishes-after-dinner',
    title: 'Помыть посуду после ужина',
    description: 'Пустая раковина вечером — спокойное утро без горы посуды.',
    category: 'family',
    icon: 'pi-filter',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Кухня',
  },
  {
    slug: 'clothes-for-tomorrow',
    title: 'Подготовить одежду на завтра',
    description: 'Погладить и повесить — утром не придётся искать носки.',
    category: 'family',
    icon: 'pi-check-square',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Спальня',
  },
  {
    slug: 'family-weekly-reset',
    title: 'Семейный сброс на выходных',
    description: 'Полчаса на общие зоны: разобрать, протереть, проветрить.',
    category: 'family',
    icon: 'pi-calendar',
    intervalCount: 1,
    intervalUnit: 'week',
    zone: 'По всему дому',
  },

  // ── Забота о себе ───────────────────────────────────────────────────
  {
    slug: 'ten-minutes-quiet',
    title: 'Десять минут тишины',
    description: 'Без телефона и дел: чай, окно, дыхание. Это тоже часть порядка.',
    category: 'selfcare',
    icon: 'pi-heart',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'evening-shutdown',
    title: 'Вечернее завершение дня',
    description: 'Выключить лишний свет, закрыть ноутбук, убрать кружку — дом отдыхает вместе с вами.',
    category: 'selfcare',
    icon: 'pi-power-off',
    intervalCount: 1,
    intervalUnit: 'day',
  },

  // ── Питомцы ─────────────────────────────────────────────────────────
  {
    slug: 'pet-bowls',
    title: 'Помыть миски питомца',
    description: 'Тёплая вода без мыла: свежая посуда — меньше проблем с пищеварением.',
    category: 'pets',
    icon: 'pi-heart-fill',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Кухня',
  },
  {
    slug: 'pet-hair-sofa',
    title: 'Убрать шерсть с дивана',
    description: 'Ролик или влажная рукавица — минута, и гости не догадаются о питомце.',
    category: 'pets',
    icon: 'pi-sparkles',
    intervalCount: 2,
    intervalUnit: 'day',
    zone: 'Гостиная',
  },
  {
    slug: 'pet-litter',
    title: 'Проверить лоток',
    description: 'Убрать сразу, а раз в неделю помыть полностью — запаха не будет.',
    category: 'pets',
    icon: 'pi-check-circle',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Ванная',
  },
  {
    slug: 'pet-brush',
    title: 'Вычесать питомца',
    description: 'Меньше шерсти в доме и спокойнее животное.',
    category: 'pets',
    icon: 'pi-star',
    intervalCount: 3,
    intervalUnit: 'day',
    zone: 'По всему дому',
  },

  // ── Растения ────────────────────────────────────────────────────────
  {
    slug: 'water-plants',
    title: 'Полить растения',
    description: 'Проверьте почву пальцем: поливайте, только если верхний слой сухой.',
    category: 'plants',
    icon: 'pi-sun',
    intervalCount: 3,
    intervalUnit: 'day',
    zone: 'По всему дому',
  },
  {
    slug: 'wipe-leaves',
    title: 'Протереть листья',
    description: 'Влажная салфетка возвращает растениям насыщенный цвет.',
    category: 'plants',
    icon: 'pi-sparkles',
    intervalCount: 1,
    intervalUnit: 'week',
    zone: 'По всему дому',
  },
  {
    slug: 'mist-plants',
    title: 'Опрыскать растения',
    description: 'Особенно зимой, когда воздух сухой от отопления.',
    category: 'plants',
    icon: 'pi-cloud',
    intervalCount: 3,
    intervalUnit: 'day',
    zone: 'По всему дому',
  },

  // ── Планирование ────────────────────────────────────────────────────
  {
    slug: 'sum-up-day',
    title: 'Подвести итог дня',
    description: 'Отметьте сделанное и перенесите незавершённое на подходящий день.',
    category: 'planning',
    icon: 'pi-check-circle',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'week-ahead',
    title: 'Посмотреть на неделю вперёд',
    description: 'Посмотрите на ближайшие планы и решите, когда удобно заняться домашними делами.',
    category: 'planning',
    icon: 'pi-calendar',
    intervalCount: 1,
    intervalUnit: 'week',
  },
  {
    slug: 'clear-reminders',
    title: 'Разобрать новые напоминания',
    description: 'Просмотрите сохранённые заметки и сообщения: оставьте, запланируйте или удалите.',
    category: 'planning',
    icon: 'pi-envelope',
    intervalCount: 2,
    intervalUnit: 'day',
  },
  {
    slug: 'plan-menu',
    title: 'Спланировать меню на неделю',
    description: 'Список блюд и покупок экономит время и деньги.',
    category: 'planning',
    icon: 'pi-list',
    intervalCount: 1,
    intervalUnit: 'week',
    zone: 'Кухня',
  },
  {
    slug: 'check-tomorrow',
    title: 'Проверить календарь на завтра',
    description: 'Две минуты вечером — и утро не начинается с сюрпризов.',
    category: 'planning',
    icon: 'pi-calendar-plus',
    intervalCount: 1,
    intervalUnit: 'day',
  },

  // ── Здоровье ────────────────────────────────────────────────────────
  {
    slug: 'morning-workout',
    title: 'Утренняя зарядка 10 минут',
    description: 'Простые движения без инвентаря: проснуться и включить тело. Можно под видео или по памяти.',
    category: 'health',
    icon: 'pi-bolt',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'stretching',
    title: 'Растяжка 5 минут',
    description: 'Наклоны, плечи, спина — снять напряжение после сидячего дня.',
    category: 'health',
    icon: 'pi-heart',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'walk-20',
    title: 'Прогулка 20 минут',
    description: 'Свежий воздух и шаги без цели: голова проветривается лучше, чем за экраном.',
    category: 'health',
    icon: 'pi-compass',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'steps-8000',
    title: '8 000 шагов',
    description: 'Не спорт, а движение в течение дня: лестница, магазин, прогулка.',
    category: 'health',
    icon: 'pi-star',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'water-6-8',
    title: '6–8 стаканов воды',
    description: 'Стакан воды рядом с рабочим местом — и норма выполняется незаметно.',
    category: 'health',
    icon: 'pi-cloud',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'sleep-before-23',
    title: 'Сон до 23:00',
    description: 'Ложиться в одно время: утро перестаёт начинаться с борьбы с будильником.',
    category: 'health',
    icon: 'pi-moon',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'healthy-breakfast',
    title: 'Полезный завтрак',
    description: 'Не пропускать утро: яйца, каша или творог вместо печенья на бегу.',
    category: 'health',
    icon: 'pi-sun',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'hobby-15',
    title: '15 минут на хобби',
    description: 'Рисование, музыка, модели — время, которое принадлежит только вам.',
    category: 'health',
    icon: 'pi-star',
    intervalCount: 1,
    intervalUnit: 'day',
  },

  // ── Развитие ────────────────────────────────────────────────────────
  {
    slug: 'read-10',
    title: '10 минут чтения',
    description: 'Страница-две в день вместо ленты: книга, которая давно ждёт.',
    category: 'growth',
    icon: 'pi-book',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'language-10',
    title: 'Иностранный язык 10 минут',
    description: 'Одно упражнение в приложении или десять новых слов — маленький шаг каждый день.',
    category: 'growth',
    icon: 'pi-globe',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'learn-15',
    title: '15 минут обучения',
    description: 'Короткий урок курса или статья по профессии: без марафона и выгорания.',
    category: 'growth',
    icon: 'pi-pencil',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'journal-gratitude',
    title: 'Дневник и благодарность',
    description: 'Три строки о том, что прошло хорошо: простой способ заметить день.',
    category: 'growth',
    icon: 'pi-pencil',
    intervalCount: 1,
    intervalUnit: 'day',
  },

  // ── Забота о себе ───────────────────────────────────────────────────
  {
    slug: 'breathe-5',
    title: 'Дыхание или медитация 5 минут',
    description: 'Медленный вдох и выдох без телефона: пауза, после которой легче думать.',
    category: 'selfcare',
    icon: 'pi-heart',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'no-phone-before-sleep',
    title: 'Час без телефона перед сном',
    description: 'Экран на зарядку, книга или душ: сон приходит быстрее.',
    category: 'selfcare',
    icon: 'pi-moon',
    intervalCount: 1,
    intervalUnit: 'day',
  },
  {
    slug: 'skincare',
    title: 'Уход за кожей',
    description: 'Умыться и нанести крем — две минуты, которые возвращают ощущение «я в порядке».',
    category: 'selfcare',
    icon: 'pi-sparkles',
    intervalCount: 1,
    intervalUnit: 'day',
  },
];

/**
 * Идемпотентно: шаблон с существующим slug пропускается.
 *
 * Английский перевод при этом пишется всегда — и для нового шаблона, и для уже
 * существующего. Иначе переводы появлялись бы только у привычек, добавленных
 * после этой правки, а весь каталог, засеянный раньше, остался бы русским.
 */
export const seedHabitTemplates = async (
  client: PoolClient
): Promise<{ created: number; skipped: number }> => {
  let created = 0;
  let skipped = 0;

  for (const [index, template] of HABIT_TEMPLATES.entries()) {
    const existing = await client.query<{ id: number }>(
      'SELECT id FROM habit_templates WHERE slug = $1',
      [template.slug]
    );

    let templateId = existing.rows[0]?.id;

    if (templateId) {
      skipped += 1;
    } else {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO habit_templates
           (slug, title, description, category, icon, default_interval_count, default_interval_unit, zone, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          template.slug,
          template.title,
          template.description,
          template.category,
          template.icon,
          template.intervalCount,
          template.intervalUnit,
          template.zone ?? null,
          index + 1,
        ]
      );

      templateId = inserted.rows[0]?.id;
      created += 1;
    }

    const translation = HABIT_TEMPLATE_EN[template.slug];

    if (templateId && translation) {
      await upsertTranslation(client, {
        table: 'habit_template_translations',
        keyColumn: 'habit_template_id',
        key: templateId,
        locale: 'en',
        fields: {
          title: translation.title,
          description: translation.description,
          zone: zoneEn(template.zone),
        },
      });
    }
  }

  /**
   * Публикация шаблонов синхронизируется с кодом.
   *
   * Раньше убранный из массива шаблон оставался в базе опубликованным и висел
   * в листе идей. Здесь он скрывается (`is_published = FALSE`), а не удаляется:
   * записи пользователей и история отметок ссылаются на строку и остаются
   * целыми. Вернули шаблон в список — он снова опубликуется при следующем сиде.
   */
  await client.query(
    'UPDATE habit_templates SET is_published = (slug = ANY($1::text[]))',
    [HABIT_TEMPLATES.map((template) => template.slug)]
  );

  return { created, skipped };
};
