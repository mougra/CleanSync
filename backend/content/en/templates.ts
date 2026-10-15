import { extraKeys, missingKeys } from '../../services/translations';

/**
 * Шаблоны расписаний и готовых чек-листов на английском.
 *
 * Ключ верхнего уровня — русское название расписания из сида (`backend/seed.ts`),
 * ключи внутри `tasks` — русские названия пунктов. Стабильного ключа у шаблонов
 * нет: это стартовый набор, который человек копирует себе (`schedules.source_template_id`),
 * поэтому сид сверяет наборы целиком и падает, если название переименовали,
 * а перевод оставили прежний.
 */
export interface ScheduleTemplateEn {
  title: string;
  description: string;
  tasks: Record<string, string>;
}

export const TEMPLATE_EN: Record<string, ScheduleTemplateEn> = {
  'Весенний челлендж': {
    title: 'Spring challenge',
    description: 'Light spring cleaning: air the rooms, wipe the surfaces...',
    tasks: {
      'Освежите кухню': 'Refresh the kitchen',
      'Ревизия в шкафах': 'Go through the cupboards',
      'Чистка санузла': 'Clean the bathroom',
    },
  },
  'Летний челлендж': {
    title: 'Summer challenge',
    description: 'Easy upkeep: airing, taking out the rubbish...',
    tasks: {
      'Проверьте окна и балкон': 'Check the windows and the balcony',
      'Постирайте занавески': 'Wash the curtains',
      'Обработайте сантехнику': 'Treat the plumbing',
    },
  },
  'Зимний челлендж': {
    title: 'Winter challenge',
    description: 'Comfort and order: cleaning for cosiness and safety...',
    tasks: {
      'Организуйте шкафы': 'Organise the cupboards',
      'Почистите поверхности': 'Clean the surfaces',
      'Проверьте батареи': 'Check the radiators',
    },
  },
  Кухня: {
    title: 'Kitchen',
    description: '',
    tasks: {
      'Разгрузите столешницу': 'Clear the countertop',
      'Помойте посуду': 'Wash the dishes',
      'Вымойте раковину': 'Wash the sink',
      'Замените полотенце': 'Change the towel',
      'Вытрите фасады': 'Wipe the cabinet fronts',
      'Выбросьте мусор': 'Take out the rubbish',
    },
  },
  Гостиная: {
    title: 'Living room',
    description: '',
    tasks: {
      'Сложите вещи': 'Put things away',
      'Пропылесосьте пол': 'Vacuum the floor',
      'Протрите телевизор': 'Wipe the TV',
      'Проветрите комнату': 'Air the room',
    },
  },
  'Ванная комната': {
    title: 'Bathroom',
    description: '',
    tasks: {
      'Протрите раковину': 'Wipe the sink',
      'Чистка унитаза': 'Clean the toilet',
      'Протирка зеркал': 'Wipe the mirrors',
      'Поменяйте полотенца': 'Change the towels',
    },
  },
  Спальня: {
    title: 'Bedroom',
    description: '',
    tasks: {
      'Заправьте кровать': 'Make the bed',
      'Разберите вещи': 'Sort out your things',
      'Пропылесосьте пол': 'Vacuum the floor',
      'Протрите тумбочки': 'Wipe the bedside tables',
    },
  },
  Прихожая: {
    title: 'Hallway',
    description: 'The zone that takes in everything coming from outside.',
    tasks: {
      'Разберите обувь по парам': 'Pair up the shoes',
      'Повесьте верхнюю одежду': 'Hang up the outerwear',
      'Протрите дверь и ручки': 'Wipe the door and the handles',
      'Разложите почту и пакеты': 'Sort the post and the bags',
      'Протрите плинтусы и пол': 'Wipe the skirting boards and the floor',
    },
  },
  'Балкон и хранение': {
    title: 'Balcony and storage',
    description: 'The place where things go “for later” — and stay for a year.',
    tasks: {
      'Уберите то, что не по сезону': 'Put away what is out of season',
      'Проверьте коробки и подпишите их': 'Check the boxes and label them',
      'Отложите лишнее на отдачу': 'Set aside the extras to give away',
      'Подметите и протрите пол': 'Sweep and wipe the floor',
      'Протрите рамы и подоконник': 'Wipe the frames and the windowsill',
    },
  },
};

/**
 * Проверка полноты: наборы названий сверяются в обе стороны.
 *
 * Расписание сверяем по названию, пункты — внутри расписания: одинаковые пункты
 * встречаются в разных шаблонах («Пропылесосьте пол» есть и в гостиной, и в
 * спальне), и общий словарь по названию был бы двусмысленным.
 */
export const validateTemplateTranslations = (
  templates: ReadonlyArray<{ title: string; tasks: readonly string[] }>,
): string[] => {
  const problems: string[] = [];
  const titles = templates.map((template) => template.title);

  for (const title of missingKeys(titles, TEMPLATE_EN)) {
    problems.push(`нет английского перевода шаблона «${title}»`);
  }

  for (const title of extraKeys(titles, TEMPLATE_EN)) {
    problems.push(`английский перевод шаблона «${title}» остался без оригинала`);
  }

  for (const template of templates) {
    const translation = TEMPLATE_EN[template.title];

    if (!translation) {
      continue;
    }

    for (const task of missingKeys(template.tasks, translation.tasks)) {
      problems.push(`нет английского перевода пункта «${task}» в шаблоне «${template.title}»`);
    }

    for (const task of extraKeys(template.tasks, translation.tasks)) {
      problems.push(
        `английский перевод пункта «${task}» в шаблоне «${template.title}» остался без оригинала`,
      );
    }
  }

  return problems;
};
