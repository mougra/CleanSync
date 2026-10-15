/** Временный отчёт: какие интервалы в днях выходят у сгенерированного набора. */
import { buildDefaultTasks } from '../services/defaultTasks';

const PROFILES: Array<[string, Record<string, unknown>]> = [
  [
    'A: студия, минимум, 2 дня',
    {
      housingType: 'studio', rooms: '1-2', composition: 'alone', pets: ['none'], outdoor: 'none',
      hasKidsRoom: false, hasGarage: false, worksFromHome: false, drying: 'air', cleaningLevel: 'light',
      dailyMinutes: 'under30', cleaningStyle: 'often_small', cleaningDays: [1, 3, 6], hardestZone: 'kitchen',
    },
  ],
  [
    'B: дом 8+, 7 дней, 1-2 ч',
    {
      housingType: 'house', rooms: '8+', composition: 'family_kids', pets: ['cats', 'dogs'], outdoor: 'yard',
      hasKidsRoom: true, hasGarage: true, worksFromHome: true, drying: 'dryer', cleaningLevel: 'deep',
      dailyMinutes: '1to2h', cleaningStyle: 'often_small', cleaningDays: [0, 1, 2, 3, 4, 5, 6], hardestZone: 'bathroom',
    },
  ],
  [
    'C: квартира 3-4, 30-60, 3 дня',
    {
      housingType: 'apartment', rooms: '3-4', composition: 'partner', pets: ['none'], outdoor: 'none',
      hasKidsRoom: false, hasGarage: false, worksFromHome: false, drying: 'air', cleaningLevel: 'normal',
      dailyMinutes: '30to60', cleaningStyle: 'varies', cleaningDays: [1, 3, 5], hardestZone: 'nothing',
    },
  ],
  [
    'D: квартира 5-7, зависит, 5 дней',
    {
      housingType: 'apartment', rooms: '5-7', composition: 'roommates', pets: ['cats'], outdoor: 'none',
      hasKidsRoom: false, hasGarage: false, worksFromHome: false, drying: 'washer_dryer', cleaningLevel: 'normal',
      dailyMinutes: 'depends', cleaningStyle: 'when_energy', cleaningDays: [1, 2, 3, 4, 5], hardestZone: 'floors',
    },
  ],
];

for (const [label, answers] of PROFILES) {
  const set = buildDefaultTasks(answers as never);
  const intervals = set.tasks.map((task) => task.intervalCount);
  const over = intervals.filter((value) => value > 180).length;
  const under = intervals.filter((value) => value < 7).length;

  console.log(
    `${label}: задач ${set.summary.totalTasks}, потеряно ${set.summary.droppedTasks}, интервал ${Math.min(...intervals)}…${Math.max(...intervals)} дней, >180: ${over}, <7: ${under}`
  );
}
