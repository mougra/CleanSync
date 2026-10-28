import { TASK_CADENCE_LABELS_EN } from '../content/en/taskCatalog';
import { taskTitleEn } from '../content/en/taskSets';
import { zoneEn } from '../content/en/zones';
import { TASK_CADENCE_LABELS, type TaskCadence } from './taskCatalog';
import type { ContentLocale } from './contentLocale';

/**
 * Названия задач и зон каталога на языке запроса.
 *
 * Каталог (`services/taskCatalog.ts`) — русский: он же ключ для сида и для
 * идемпотентности набора (правило 41), поэтому переводить его в самих данных
 * нельзя. Английские названия лежат рядом словарём (`content/en/taskCatalog.ts`)
 * и подставляются только при чтении — здесь и в `services/generatedContent.ts`.
 *
 * Модуль один на всех читателей: и страница зоны (`routes/catalog.ts`), и
 * предпросмотр плана без аккаунта (`routes/homeProfile.ts`) должны называть одно
 * и то же дело одинаково, иначе гость увидит в плане не то, что прочитал на
 * странице.
 *
 * Название ищем в двух словарях: библиотеки каталога и курируемых наборов
 * (`content/en/taskSets.ts`). Курируемый набор — не подмножество библиотеки:
 * часть названий склеена из нескольких каталожных строк, и своего перевода в
 * библиотеке у них нет.
 *
 * Неизвестное название возвращаем как есть: непереведённая строка лучше пустой
 * (тот же принцип, что `COALESCE(перевод, оригинал)` в SQL).
 */
export const catalogTitle = (title: string, locale: ContentLocale): string =>
  locale === 'en' ? (taskTitleEn(title) ?? title) : title;

export const catalogZone = (zone: string, locale: ContentLocale): string =>
  locale === 'en' ? (zoneEn(zone) ?? zone) : zone;

/** Подпись периодичности: «Раз в неделю» / “Once a week”. */
export const catalogCadence = (cadence: TaskCadence, locale: ContentLocale): string =>
  locale === 'en'
    ? (TASK_CADENCE_LABELS_EN[cadence] ?? TASK_CADENCE_LABELS[cadence])
    : TASK_CADENCE_LABELS[cadence];
