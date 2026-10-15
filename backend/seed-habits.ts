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
 * Категории: home, family, selfcare, pets, plants, planning.
 * Единицы повторения: once | day | week | month.
 */

export interface HabitTemplateSeed {
  slug: string;
  title: string;
  description: string;
  category: 'home' | 'family' | 'selfcare' | 'pets' | 'plants' | 'planning';
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
    icon: 'pi-signpost',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Прихожая',
  },
  {
    slug: 'evening-room-order',
    title: 'Вечерний порядок в комнате',
    description: 'Разложите вещи по местам и приведите одну общую комнату в порядок к завтрашнему дню.',
    category: 'home',
    icon: 'pi-home',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Гостиная',
  },
  {
    slug: 'wipe-kitchen-surfaces',
    title: 'Протереть рабочие поверхности',
    description: 'Столешницы, плита и фасады — быстрым движением, пока готовите или после ужина.',
    category: 'home',
    icon: 'pi-th-large',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Кухня',
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
    slug: 'declutter-one-shelf',
    title: 'Разобрать одну полку',
    description: 'Одна полка в день — так шкафы разбираются без многочасового марафона.',
    category: 'home',
    icon: 'pi-box',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'По всему дому',
  },
  {
    slug: 'mirror-wipe',
    title: 'Протереть зеркало и смеситель',
    description: 'Микрофибра и вода: зеркало и кран без разводов за две минуты.',
    category: 'home',
    icon: 'pi-eye',
    intervalCount: 3,
    intervalUnit: 'day',
    zone: 'Ванная',
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
    slug: 'switches-handles',
    title: 'Протереть выключатели и ручки',
    description: 'Самые частые точки контакта: салфетка с дезинфекцией раз в пару дней.',
    category: 'home',
    icon: 'pi-bolt',
    intervalCount: 2,
    intervalUnit: 'day',
    zone: 'По всему дому',
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
    slug: 'family-15-minutes',
    title: 'Пятнадцать минут общей уборки',
    description: 'Таймер на пятнадцать минут и вся семья по своим зонам — вместе быстрее и веселее.',
    category: 'family',
    icon: 'pi-users',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'По всему дому',
  },
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
    slug: 'air-bedroom',
    title: 'Проветрить спальню',
    description: 'Пять минут свежего воздуха перед сном улучшают сон.',
    category: 'selfcare',
    icon: 'pi-cloud',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Спальня',
  },
  {
    slug: 'reset-after-work',
    title: 'Разложить вещи после работы',
    description: 'Пять минут на сумку, верхнюю одежду и обувь — вечер свободен.',
    category: 'selfcare',
    icon: 'pi-briefcase',
    intervalCount: 1,
    intervalUnit: 'day',
    zone: 'Прихожая',
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

  return { created, skipped };
};
