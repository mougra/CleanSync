/**
 * Сводка по каталогу задач «Настройки по дому»: сколько задач каждого уровня,
 * какие темы покрыты и сколько задач подходит под характерные ответы анкеты.
 * Запуск: npx tsx scripts/catalog-stats.ts
 */
import { getTaskCatalog, taskCountByLevel, validateTaskCatalog } from '../services/taskCatalog';
import { buildHomePlan, candidateCount } from '../services/homePlan';

const catalog = getTaskCatalog();

console.log(`Всего задач: ${catalog.length}`);
console.log('По уровням:', JSON.stringify(taskCountByLevel()));
console.log('Проблемы каталога:', validateTaskCatalog());

const byRoom = new Map<string, number>();
const byTag = new Map<string, number>();
const byMinutes = new Map<string, number>();

for (const task of catalog) {
  byRoom.set(task.room, (byRoom.get(task.room) ?? 0) + 1);
  byMinutes.set(String(task.minutes), (byMinutes.get(String(task.minutes)) ?? 0) + 1);

  for (const tag of task.tags) {
    byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
  }
}

console.log('\nПо зонам:');
for (const [room, count] of [...byRoom].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${room}: ${count}`);
}

console.log('\nПо тегам:');
for (const [tag, count] of [...byTag].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tag}: ${count}`);
}

console.log('\nЗадачи без тегов (подходят всем):', catalog.filter((task) => task.tags.length === 0).length);
console.log('Самая короткая задача:', Math.min(...catalog.map((task) => task.minutes)), 'мин');
console.log('Самая длинная задача:', Math.max(...catalog.map((task) => task.minutes)), 'мин');

const scenarios = [
  { name: 'студия, кошки, deep, <30', answers: { cleaningLevel: 'deep' as const, pets: ['cats' as const], dailyMinutes: 'under30' as const, rooms: '1-2' as const } },
  { name: 'дом 8+, family, всё', answers: { cleaningLevel: 'deep' as const, rooms: '8+' as const, composition: 'family_kids' as const, pets: ['dogs' as const], outdoor: 'yard' as const, hasGarage: true, hasKidsRoom: true, worksFromHome: true, dailyMinutes: '1to2h' as const } },
  { name: 'квартира, light', answers: { cleaningLevel: 'light' as const, dailyMinutes: '30to60' as const } },
  { name: 'квартира, normal, без питомцев', answers: { cleaningLevel: 'normal' as const } },
];

console.log('\nКандидатов под ответы и размер плана:');
for (const scenario of scenarios) {
  const plan = buildHomePlan(scenario.answers);
  console.log(
    `  ${scenario.name}: кандидатов ${candidateCount(scenario.answers)}, в плане задач ${plan.summary.totalTasks}, минут ${plan.summary.totalMinutes}, дней ${plan.summary.activeDays}`
  );
}
