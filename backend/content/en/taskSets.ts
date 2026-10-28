import { extraKeys } from '../../services/translations';
import { CATALOG_TITLE_EN } from './taskCatalog';

/**
 * Английские названия задач курируемых наборов (`services/taskSets.ts`).
 *
 * Здесь только то, чего нет в библиотеке каталога: названия, склеенные из
 * нескольких каталожных строк («Протереть подоконники», «Помыть окна изнутри и
 * снаружи») или переименованные. Всё остальное уже переведено в
 * `content/en/taskCatalog.ts`, и второй копии быть не должно: разъедутся — в
 * английском интерфейсе появится другой текст, чем на странице зоны.
 *
 * Ключ — русское название задачи символ в символ, как и в каталоге.
 */
export const TASK_SET_TITLE_EN: Record<string, string> = {
  'Протереть рабочие поверхности на кухне и убрать всё лишнее с неё':
    'Wipe the kitchen worktops and clear everything off them',
  'Постирать и загрузить бельё в стиральную машину':
    'Wash the laundry and load it into the washing machine',
  'Вымыть или пропылесосить полы во всей квартире': 'Wash or vacuum the floors throughout the flat',
  'Вымыть ванну': 'Wash the bath',
  'Полотенца заменить на свежие': 'Change the towels for fresh ones',
  'Протереть подоконники': 'Wipe the windowsills',
  'Разобрать одну полку в шкафу': 'Sort out one shelf in the cupboard',
  'Протереть ручки дверей, шкафов и выключатели':
    'Wipe the door and cupboard handles and the switches',
  'Протереть зеркала': 'Wipe the mirrors',
  'Помыть мусорное ведро': 'Wash the bin',
  'Протереть пульты': 'Wipe the remotes',
  'Прочистить вытяжку': 'Clean the extractor hood',
  'Протереть двери по всей квартире': 'Wipe the doors throughout the flat',
  'Разобрать вещи и выбросить ненужное': 'Sort out the things and bin what is not needed',
  'Помыть окна изнутри и снаружи': 'Wash the windows inside and out',
  'Разобрать лоток с документами': 'Sort out the document tray',
  'Вымыть лоток и заменить наполнитель': 'Wash the litter tray and change the litter',
  'Помыть лапы после прогулки': 'Wash the paws after a walk',
};

/**
 * Английское название задачи набора: сначала библиотека, потом словарь набора.
 *
 * Одной функцией пользуются и чтение (`services/catalogLocale.ts`), и запись
 * переводов сгенерированных задач (`services/generatedContent.ts`): иначе
 * страница зоны и «Мои задачи» называли бы одно дело по-разному.
 */
export const taskTitleEn = (title: string): string | undefined =>
  CATALOG_TITLE_EN[title] ?? TASK_SET_TITLE_EN[title];

/**
 * Проверка словаря набора: у каждой задачи наборов есть перевод, лишних строк нет.
 *
 * Вызывается сидом и тестом. Библиотечные названия проверяются своим словарём
 * (`validateCatalogTranslations`), поэтому здесь сверяем только то, что реально
 * лежит в наборах.
 */
export const validateTaskSetTranslations = (titles: readonly string[]): string[] => {
  const problems: string[] = [];

  for (const title of titles) {
    if (!taskTitleEn(title)) {
      problems.push(`нет английского перевода задачи набора «${title}»`);
    }
  }

  for (const title of extraKeys(titles, TASK_SET_TITLE_EN)) {
    problems.push(`английский перевод задачи набора «${title}» остался без оригинала`);
  }

  return problems;
};
