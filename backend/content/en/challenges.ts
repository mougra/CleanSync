/**
 * Челленджи на английском — всё дерево сразу: челлендж → день → задача.
 *
 * Ключ верхнего уровня — `slug` из сида (`backend/seed-challenges.ts`), ключи
 * дней — номера дней строкой, а ключ задачи — её русское название из сида.
 * Стабильного id у задач в сиде нет: он появляется только после записи в базу
 * (`challenge_tasks.id`), а сам сид обновляет тексты на месте и сохраняет этот
 * id ради прогресса пользователей. Поэтому опорой для перевода служит название:
 * внутри дня оно уникально, и повторный запуск сида с исправленной опечаткой
 * виден сразу — перевода для новой строки не находится.
 *
 * Регулярные дела из блока `recurring` (`switches`, `trash`, `floors`,
 * `quickKitchen`, `airing`) стоят в нескольких днях: их название и подсказка
 * продублированы строкой в каждом дне, где дело встречается, — так словарь
 * остаётся словарём «день → задачи» и не требует второй карты на отслеживание.
 *
 * Зон (`room`) здесь нет: «Кухня», «Прихожая», «По всему дому» — это словарь
 * каталога и сидов, он живёт отдельно (`content/en/zones.ts`), иначе одна и та
 * же зона называлась бы в челленджах иначе, чем в привычках и задачах дома.
 */
export interface ChallengeTaskEn {
  title: string;
  hint: string | null;
}

export interface ChallengeDayEn {
  title: string;
  subtitle: string | null;
  /** Ключ — русское название задачи, как оно записано в сиде. */
  tasks: Record<string, ChallengeTaskEn>;
}

export interface ChallengeEn {
  title: string;
  description: string;
  /** Ключи — номера дней в виде строки: '1', '2', ... */
  days: Record<string, ChallengeDayEn>;
}

export const CHALLENGE_EN: Record<string, ChallengeEn> = {
  // ── Весенняя уборка ────────────────────────────────────────────────────
  'vesennyaya-uborka': {
    title: 'Spring cleaning',
    description:
      'Six days of 1.5–2 hours: the home after winter — windows, cupboards, balcony and kitchen. One-off jobs by zone plus a little regular upkeep.',
    days: {
      '1': {
        title: 'Windows and light',
        subtitle: 'The main spring job — bringing the daylight back',
        tasks: {
          'Помыть окна': { title: 'Wash the windows', hint: 'glass, frames, reveals' },
          'Постирать и повесить шторы': { title: 'Wash and hang the curtains', hint: null },
          'Протереть подоконники и светильники': {
            title: 'Wipe the windowsills and the light fittings',
            hint: null,
          },
          'Протереть выключатели, ручки дверей и пульты': {
            title: 'Wipe the switches, door handles and remote controls',
            hint: null,
          },
        },
      },
      '2': {
        title: 'Air and wash after the winter',
        subtitle: 'Winter dust and stale air',
        tasks: {
          'Проветрить все комнаты по 15 минут': {
            title: 'Air all the rooms for 15 minutes',
            hint: null,
          },
          'Протереть радиаторы и плинтусы': {
            title: 'Wipe the radiators and the skirting boards',
            hint: 'dust from the heating',
          },
          'Вымыть твёрдые полы': { title: 'Wash the hard floors', hint: null },
          'Проветрить все комнаты по 10 минут': {
            title: 'Air all the rooms for 10 minutes',
            hint: null,
          },
        },
      },
      '3': {
        title: 'Wardrobe and clothes',
        subtitle: 'Winter things into storage, the extras to give away',
        tasks: {
          'Разобрать шкаф с одеждой по сезону': { title: 'Sort the wardrobe by season', hint: null },
          'Убрать 10 вещей на отдачу': { title: 'Pick 10 things to give away', hint: null },
          'Помыть и убрать зимнюю обувь': { title: 'Wash and put away the winter shoes', hint: null },
          'Протереть выключатели, ручки дверей и пульты': {
            title: 'Wipe the switches, door handles and remote controls',
            hint: null,
          },
        },
      },
      '4': {
        title: 'Kitchen and balcony',
        subtitle: 'The two places where winter leaves the most traces',
        tasks: {
          'Разобрать и вымыть полки в шкафах': {
            title: 'Sort out and wash the cupboard shelves',
            hint: null,
          },
          'Вымыть балкон и протереть перила': {
            title: 'Wash the balcony and wipe the railings',
            hint: null,
          },
          'Протереть сушилку и балконную мебель': {
            title: 'Wipe the drying rack and the balcony furniture',
            hint: null,
          },
          'Быстрая уборка кухни за 15 минут': {
            title: 'Fifteen minutes to tidy the kitchen',
            hint: 'worktop, sink, crumbs',
          },
        },
      },
      '5': {
        title: 'Bathroom and hallway',
        subtitle: null,
        tasks: {
          'Отмыть плитку и душевую': { title: 'Scrub the tiles and the shower', hint: null },
          'Разобрать средства и заменить полотенца': {
            title: 'Sort out the toiletries and change the towels',
            hint: null,
          },
          'Разобрать обувной шкаф в прихожей': {
            title: 'Sort out the shoe cupboard in the hallway',
            hint: null,
          },
          'Вынести мусор и протереть ведро': {
            title: 'Take out the rubbish and wipe the bin',
            hint: null,
          },
        },
      },
      '6': {
        title: 'Final touches',
        subtitle: 'Walk through the home and pick up what was missed',
        tasks: {
          'Протереть забытые места': {
            title: 'Wipe the forgotten places',
            hint: 'doors, switches, mirrors',
          },
          'Проверить комнаты и убрать лишнее': {
            title: 'Check the rooms and put the extras away',
            hint: null,
          },
          'Добавить уютную деталь': {
            title: 'Add one cosy detail',
            hint: 'a plant, flowers, a candle',
          },
          'Пропылесосить или подмести пол': { title: 'Vacuum or sweep the floor', hint: null },
        },
      },
    },
  },

  // ── Летняя свежесть ────────────────────────────────────────────────────
  'letnyaya-svezhest': {
    title: 'Summer freshness',
    description:
      'Five days of 1–1.5 hours: cool and fresh in the heat — the fridge, kitchen cupboards, appliances and airing.',
    days: {
      '1': {
        title: 'Fridge and freezer',
        subtitle: 'In summer the essentials are cold and clean',
        tasks: {
          'Разобрать холодильник и выбросить просрочку': {
            title: 'Sort out the fridge and bin anything out of date',
            hint: null,
          },
          'Вымыть полки и ящики морозилки': {
            title: 'Wash the shelves and drawers in the freezer',
            hint: null,
          },
          'Вымыть холодильник снаружи и сзади': {
            title: 'Wash the fridge on the outside and behind',
            hint: null,
          },
          'Вынести мусор и протереть ведро': {
            title: 'Take out the rubbish and wipe the bin',
            hint: null,
          },
        },
      },
      '2': {
        title: 'Kitchen cupboards',
        subtitle: null,
        tasks: {
          'Разобрать шкаф с крупами и специями': {
            title: 'Sort out the cupboard with the grains and spices',
            hint: null,
          },
          'Протереть кухонные шкафчики внутри': {
            title: 'Wipe the kitchen cupboards inside',
            hint: null,
          },
          'Вымыть вытяжку и фартук': {
            title: 'Wash the extractor hood and the splashback',
            hint: null,
          },
          'Быстрая уборка кухни за 15 минут': {
            title: 'Fifteen minutes to tidy the kitchen',
            hint: 'worktop, sink, crumbs',
          },
        },
      },
      '3': {
        title: 'Dust behind the appliances',
        subtitle: 'In summer dust and pet hair show up most',
        tasks: {
          'Отодвинуть и пропылесосить за техникой': {
            title: 'Pull out the appliances and vacuum behind them',
            hint: 'hob, fridge, washing machine',
          },
          'Протереть технику и провода': {
            title: 'Wipe the appliances and the cables',
            hint: null,
          },
          'Пропылесосить ковры и мягкую мебель': {
            title: 'Vacuum the rugs and the soft furniture',
            hint: null,
          },
          'Пропылесосить или подмести пол': { title: 'Vacuum or sweep the floor', hint: null },
        },
      },
      '4': {
        title: 'Airing and air conditioning',
        subtitle: null,
        tasks: {
          'Помыть фильтры кондиционера': {
            title: 'Wash the air conditioner filters',
            hint: 'or the ventilation grilles',
          },
          'Проветрить комнаты в прохладные часы': {
            title: 'Air the rooms during the cool hours',
            hint: null,
          },
          'Постирать и заменить полотенца': { title: 'Wash and change the towels', hint: null },
          'Протереть выключатели, ручки дверей и пульты': {
            title: 'Wipe the switches, door handles and remote controls',
            hint: null,
          },
        },
      },
      '5': {
        title: 'Balcony and textiles',
        subtitle: null,
        tasks: {
          'Вымыть пол и перила на балконе': {
            title: 'Wash the floor and the railings on the balcony',
            hint: null,
          },
          'Постирать шторы и покрывала': {
            title: 'Wash the curtains and the throws',
            hint: null,
          },
          'Убрать зимний текстиль на хранение': {
            title: 'Put the winter textiles into storage',
            hint: null,
          },
          'Проветрить все комнаты по 10 минут': {
            title: 'Air all the rooms for 10 minutes',
            hint: null,
          },
        },
      },
    },
  },

  // ── Осеннее обновление дома ────────────────────────────────────────────
  'osennee-obnovlenie-doma': {
    title: 'Autumn home refresh',
    description:
      'Six days of 1.5 hours: getting the home ready for the cold — insulation, seasonal clothes, kitchen, balcony and windows for winter.',
    days: {
      '1': {
        title: 'Windows and textiles',
        subtitle: null,
        tasks: {
          'Помыть окна перед холодами': {
            title: 'Wash the windows before the cold',
            hint: null,
          },
          'Постирать и повесить шторы': { title: 'Wash and hang the curtains', hint: null },
          'Проветрить и просушить комнаты': {
            title: 'Air and dry out the rooms',
            hint: null,
          },
          'Протереть выключатели, ручки дверей и пульты': {
            title: 'Wipe the switches, door handles and remote controls',
            hint: null,
          },
        },
      },
      '2': {
        title: 'Wardrobe',
        subtitle: 'Warm things into the wardrobe, summer things into storage',
        tasks: {
          'Разобрать шкаф с одеждой по сезону': { title: 'Sort the wardrobe by season', hint: null },
          'Достать тёплые вещи и убрать летние': {
            title: 'Bring out the warm clothes and put the summer ones away',
            hint: null,
          },
          'Убрать 10 вещей на отдачу': { title: 'Pick 10 things to give away', hint: null },
          'Пропылесосить или подмести пол': { title: 'Vacuum or sweep the floor', hint: null },
        },
      },
      '3': {
        title: 'Kitchen and preserves',
        subtitle: null,
        tasks: {
          'Разобрать шкафы и проверить сроки': {
            title: 'Sort out the cupboards and check the dates',
            hint: null,
          },
          'Помыть холодильник внутри': { title: 'Wash the fridge inside', hint: null },
          'Протереть банки и полки под заготовки': {
            title: 'Wipe the jars and the shelves for preserves',
            hint: null,
          },
          'Быстрая уборка кухни за 15 минут': {
            title: 'Fifteen minutes to tidy the kitchen',
            hint: 'worktop, sink, crumbs',
          },
        },
      },
      '4': {
        title: 'Balcony and drying',
        subtitle: 'After the rain everything needs drying out',
        tasks: {
          'Разобрать балкон и просушить вещи': {
            title: 'Sort out the balcony and dry everything out',
            hint: null,
          },
          'Вымыть пол и перила на балконе': {
            title: 'Wash the floor and the railings on the balcony',
            hint: null,
          },
          'Вынести лишнее и убрать мусор': {
            title: 'Take out the extras and the rubbish',
            hint: null,
          },
          'Вынести мусор и протереть ведро': {
            title: 'Take out the rubbish and wipe the bin',
            hint: null,
          },
        },
      },
      '5': {
        title: 'Insulation and warmth',
        subtitle: null,
        tasks: {
          'Проверить батареи и развоздушить': {
            title: 'Check the radiators and bleed them',
            hint: null,
          },
          'Утеплить окна и двери': { title: 'Draught-proof the windows and doors', hint: null },
          'Проверить чердак, щели и пороги': {
            title: 'Check the loft, the gaps and the thresholds',
            hint: 'that is where the heat escapes',
          },
          'Проветрить все комнаты по 10 минут': {
            title: 'Air all the rooms for 10 minutes',
            hint: null,
          },
        },
      },
      '6': {
        title: 'Windows ready for winter',
        subtitle: 'The final check before the cold',
        tasks: {
          'Проверить фурнитуру и уплотнители окон': {
            title: 'Check the window fittings and seals',
            hint: null,
          },
          'Протереть подоконники и откосы': {
            title: 'Wipe the windowsills and the reveals',
            hint: null,
          },
          'Заменить перегоревшие лампочки': {
            title: 'Replace the blown bulbs',
            hint: null,
          },
          'Протереть выключатели, ручки дверей и пульты': {
            title: 'Wipe the switches, door handles and remote controls',
            hint: null,
          },
        },
      },
    },
  },

  // ── Зимний комфорт ─────────────────────────────────────────────────────
  'zimniy-komfort': {
    title: 'Winter comfort',
    description:
      'Five days of an hour each: comfort and safety in winter — grit in the hallway, drying shoes, heating dust and packing away the New Year.',
    days: {
      '1': {
        title: 'Hallway after the grit',
        subtitle: 'Salt and dirt from the street must not spread through the home',
        tasks: {
          'Вымыть пол в прихожей от реагентов': {
            title: 'Wash the hallway floor to remove the grit',
            hint: null,
          },
          'Постелить и прополоскать коврик у двери': {
            title: 'Lay out and rinse the doormat',
            hint: null,
          },
          'Протереть двери, ручки и плинтусы': {
            title: 'Wipe the doors, the handles and the skirting boards',
            hint: null,
          },
          'Протереть выключатели, ручки дверей и пульты': {
            title: 'Wipe the switches, door handles and remote controls',
            hint: null,
          },
        },
      },
      '2': {
        title: 'Drying the shoes',
        subtitle: null,
        tasks: {
          'Просушить зимнюю обувь': {
            title: 'Dry the winter shoes',
            hint: 'not on the radiator — at room temperature',
          },
          'Почистить и обработать обувь': {
            title: 'Clean and treat the shoes',
            hint: 'a treatment against damp and salt',
          },
          'Разложить обувь по парам и убрать лишнее': {
            title: 'Pair up the shoes and put the extras away',
            hint: null,
          },
          'Вынести мусор и протереть ведро': {
            title: 'Take out the rubbish and wipe the bin',
            hint: null,
          },
        },
      },
      '3': {
        title: 'Clearing the heating dust',
        subtitle: 'Radiators send dust all over the flat',
        tasks: {
          'Протереть радиаторы и подоконники': {
            title: 'Wipe the radiators and the windowsills',
            hint: null,
          },
          'Провести влажную уборку полов': {
            title: 'Give the floors a damp clean',
            hint: null,
          },
          'Протереть двери, полки и технику': {
            title: 'Wipe the doors, the shelves and the appliances',
            hint: null,
          },
          'Проветрить все комнаты по 10 минут': {
            title: 'Air all the rooms for 10 minutes',
            hint: null,
          },
        },
      },
      '4': {
        title: 'Packing away the New Year',
        subtitle: 'After the holidays — take it down, pack it up and label it',
        tasks: {
          'Убрать и подписать новогодние украшения': {
            title: 'Put away and label the Christmas decorations',
            hint: null,
          },
          'Снять гирлянды и проверить провода': {
            title: 'Take down the fairy lights and check the cables',
            hint: null,
          },
          'Разобрать место, где стояла ёлка': {
            title: 'Sort out the spot where the Christmas tree stood',
            hint: null,
          },
          'Пропылесосить или подмести пол': { title: 'Vacuum or sweep the floor', hint: null },
        },
      },
      '5': {
        title: 'Cosiness and air',
        subtitle: null,
        tasks: {
          'Постирать пледы и подушки': { title: 'Wash the throws and the pillows', hint: null },
          'Проветрить комнаты и увлажнить воздух': {
            title: 'Air the rooms and humidify the air',
            hint: null,
          },
          'Добавить зимний свет и текстиль': {
            title: 'Add winter light and textiles',
            hint: 'candles, warm throws',
          },
          'Быстрая уборка кухни за 15 минут': {
            title: 'Fifteen minutes to tidy the kitchen',
            hint: 'worktop, sink, crumbs',
          },
        },
      },
    },
  },
};
