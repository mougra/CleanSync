import express, { Request, Response } from 'express';
import { getTaskCatalog, type TaskCadence, type TaskLevel } from '../services/taskCatalog';
import { catalogCadence, catalogTitle, catalogZone } from '../services/catalogLocale';
import { ZONE_CANONICAL } from '../services/zones';
import { resolveContentLocale, type ContentLocale } from '../services/contentLocale';

/**
 * Каталог задач как публичный источник страниц.
 *
 * Зачем это в API, а не в контенте. Каталог (`services/taskCatalog.ts`) — это
 * 294 шага уборки с зоной, минутами, уровнем и периодичностью. Из него уже
 * собираются два набора для зарегистрированных («Мои задачи» и недельный план),
 * а теперь он же становится источником страниц «что и как часто убирать в
 * комнате X». Тексты этих страниц не пишутся руками: они выводятся из данных,
 * поэтому не расходятся с тем, что приложение реально предлагает человеку.
 *
 * Страницы собираются **по зонам**, а не по каждой задаче. Отдельная страница на
 * каждую из 294 задач была бы тонкой копией списка: один и тот же шаблон без
 * собственного содержания. Зона даёт осмысленную единицу (12 адресов), и на ней
 * есть что сказать: сколько дел, сколько минут, что делать каждую неделю, а что
 * раз в полгода.
 *
 * Маршрут публичный и без базы: каталог живёт в коде, ответ одинаков для всех,
 * кроме языка (`?locale=en` → английские названия из `content/en/taskCatalog.ts`).
 *
 * Порог `MIN_ZONE_TASKS`: зоны с парой задач («Гараж») не дают содержательной
 * страницы. Они остаются в каталоге и в плане, просто не получают адреса.
 */

export const MIN_ZONE_TASKS = 5;

/**
 * Порядок периодичностей на странице: от частого к редкому.
 *
 * Свой список, а не `Object.keys(TASK_CADENCE_LABELS)`: порядок ключей в объекте
 * зависит от того, как его правили, а страница не должна переставлять блоки
 * после каждой правки словаря.
 */
export const CADENCE_ORDER: readonly TaskCadence[] = [
  'weekly',
  'biweekly',
  'threeWeeks',
  'sixWeeks',
  'monthly',
  'twoMonths',
  'quarterly',
  'fourMonths',
  'semiannual',
  'yearly',
  'twoYears',
  'threeYears',
  'fourYears',
  'fiveYears',
  'daily',
];

export interface ZoneTask {
  title: string;
  minutes: number;
  level: TaskLevel;
  cadence: TaskCadence;
}

export interface ZoneCadenceGroup {
  cadence: TaskCadence;
  title: string;
  minutes: number;
  tasks: ZoneTask[];
}

export interface ZonePage {
  slug: string;
  title: string;
  tasks: number;
  minutes: number;
  groups: ZoneCadenceGroup[];
}

/** Обратный словарь «русская зона → код адреса»: код и есть slug страницы. */
const ZONE_SLUGS: Record<string, string> = Object.fromEntries(
  Object.entries(ZONE_CANONICAL).map(([code, title]) => [title, code])
);

const localTitle = (title: string, locale: ContentLocale): string => catalogTitle(title, locale);

const cadenceTitle = (cadence: TaskCadence, locale: ContentLocale): string =>
  catalogCadence(cadence, locale);

const zoneTitle = (title: string, locale: ContentLocale): string => catalogZone(title, locale);

const sumMinutes = (tasks: ZoneTask[]): number => tasks.reduce((total, task) => total + task.minutes, 0);

/**
 * Одна зона целиком: задачи по периодичностям.
 *
 * `null` — если зоны нет в словаре или в ней слишком мало дел: страницы с
 * ответом 404 лучше, чем страница с тремя пунктами.
 */
export const buildZonePage = (slug: string, locale: ContentLocale): ZonePage | null => {
  const canonical = Object.entries(ZONE_CANONICAL).find(([code]) => code === slug)?.[1];

  if (!canonical) {
    return null;
  }

  const tasks = getTaskCatalog()
    .filter((task) => task.room === canonical)
    .map<ZoneTask>((task) => ({
      title: localTitle(task.task, locale),
      minutes: task.minutes,
      level: task.level,
      cadence: task.cadence,
    }));

  if (tasks.length < MIN_ZONE_TASKS) {
    return null;
  }

  const groups = CADENCE_ORDER.map((cadence) => {
    const list = tasks.filter((task) => task.cadence === cadence);

    return {
      cadence,
      title: cadenceTitle(cadence, locale),
      minutes: sumMinutes(list),
      tasks: list,
    };
  }).filter((group) => group.tasks.length > 0);

  return {
    slug,
    title: zoneTitle(canonical, locale),
    tasks: tasks.length,
    minutes: sumMinutes(tasks),
    groups,
  };
};

/** Все зоны, у которых есть содержательная страница: для списка и карты сайта. */
export const listZonePages = (locale: ContentLocale): ZonePage[] =>
  Object.keys(ZONE_CANONICAL)
    .map((slug) => buildZonePage(slug, locale))
    .filter((page): page is ZonePage => page !== null);

const router = express.Router();

/**
 * GET /api/catalog/zones — зоны со страницами: код, название, число дел, минуты.
 *
 * Полные списки задач здесь не отдаём: для списка и карты сайта хватает счёта,
 * а 12 зон по 25-40 задач — это десятки килобайт на каждый заход.
 */
router.get('/zones', (req: Request, res: Response) => {
  const locale = resolveContentLocale(req);

  res.json({
    zones: listZonePages(locale).map((page) => ({
      slug: page.slug,
      title: page.title,
      tasks: page.tasks,
      minutes: page.minutes,
    })),
  });
});

/** GET /api/catalog/zones/:slug — одна зона с задачами по периодичностям. */
router.get('/zones/:slug', (req: Request, res: Response) => {
  const page = buildZonePage(String(req.params.slug), resolveContentLocale(req));

  if (!page) {
    res.status(404).json({ error: 'Zone not found' });
    return;
  }

  res.json(page);
});

export default router;
