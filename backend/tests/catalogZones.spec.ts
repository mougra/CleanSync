import { describe, expect, it } from 'vitest';
import { buildZonePage, listZonePages, MIN_ZONE_TASKS, CADENCE_ORDER } from '../routes/catalog';

/**
 * Страницы зон собираются из каталога задач, а не пишутся руками.
 *
 * Тест не ходит в базу: каталог живёт в коде, а маршрут только раскладывает его
 * по зонам и переводит названия. Поэтому проверяется главное, что может
 * сломаться незаметно: адрес зоны ведёт к непустой странице, блоки идут от
 * частого к редкому, а английская версия действительно английская.
 */
describe('страницы зон из каталога задач', () => {
  it('кухня даёт содержательную страницу с задачами и минутами', () => {
    const page = buildZonePage('kitchen', 'ru');

    expect(page).not.toBeNull();
    expect(page!.slug).toBe('kitchen');
    expect(page!.tasks).toBeGreaterThanOrEqual(MIN_ZONE_TASKS);
    expect(page!.minutes).toBeGreaterThan(0);
    expect(page!.groups.length).toBeGreaterThan(0);
    expect(page!.groups[0]!.tasks.length).toBeGreaterThan(0);
  });

  it('блоки идут от частого к редкому', () => {
    const page = buildZonePage('kitchen', 'ru');
    const positions = page!.groups.map((group) => CADENCE_ORDER.indexOf(group.cadence));

    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('сумма минут групп совпадает с итогом страницы', () => {
    const page = buildZonePage('bathroom', 'ru');
    const total = page!.groups.reduce((sum, group) => sum + group.minutes, 0);

    expect(total).toBe(page!.minutes);
  });

  it('английская версия переводит названия задач и зоны', () => {
    const ru = buildZonePage('kitchen', 'ru')!;
    const en = buildZonePage('kitchen', 'en')!;

    expect(en.title).toBe('Kitchen');
    expect(en.tasks).toBe(ru.tasks);
    expect(en.groups[0]!.tasks[0]!.title).not.toBe(ru.groups[0]!.tasks[0]!.title);
  });

  it('незнакомый адрес не превращается в пустую страницу', () => {
    expect(buildZonePage('unknown-room', 'ru')).toBeNull();
    expect(buildZonePage('', 'ru')).toBeNull();
  });

  it('в списке только зоны выше порога и без дублей', () => {
    const pages = listZonePages('ru');
    const slugs = pages.map((page) => page.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(pages.every((page) => page.tasks >= MIN_ZONE_TASKS)).toBe(true);
    expect(slugs).toContain('kitchen');
  });
});
