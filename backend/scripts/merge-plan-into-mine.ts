/**
 * Разовый скрипт: перенести задачи недельного плана «План по дому» в «Мои задачи».
 *
 * Запускается вручную (`npx tsx scripts/merge-plan-into-mine.ts` из backend/) и
 * нужен ровно один раз — после отказа от недельного плана: у части пользователей
 * расписание «План по дому» уже создано, и его задачи не должны пропасть. Работа
 * идёт через тот же сервис, что и маршрут анкеты (services/mergePlanIntoTasks.ts),
 * поэтому правила переноса, периодичность из каталога и память об отказах
 * совпадают один в один.
 *
 * Идемпотентность. Скрипт проходит по пользователям, у которых расписание
 * «План по дому» ещё есть. Первый запуск переносит задачи и удаляет пустое
 * расписание, поэтому повторный запуск уже не находит ни одного пользователя и
 * ничего не меняет. Список пользователей берётся из самой базы, без API и без
 * сервера: скрипт можно запускать на остановленном приложении.
 */
import dotenv from 'dotenv';
import pool from '../db';
import { mergePlanIntoTasks, HOME_PLAN_SCHEDULE_TITLE } from '../services/mergePlanIntoTasks';

dotenv.config();

interface UserRow {
  user_id: number;
}

const main = async () => {
  const users = await pool.query<UserRow>(
    `SELECT DISTINCT user_id
       FROM schedules
      WHERE user_id IS NOT NULL AND title = $1
      ORDER BY user_id`,
    [HOME_PLAN_SCHEDULE_TITLE]
  );

  console.log(
    `Пользователей с расписанием «${HOME_PLAN_SCHEDULE_TITLE}»: ${users.rows.length}`
  );

  let moved = 0;
  let duplicates = 0;
  let dismissed = 0;
  let completed = 0;
  let deleted = 0;
  let remaining = 0;
  let withoutCatalog = 0;
  const remainingDetails: string[] = [];

  for (const row of users.rows) {
    const report = await mergePlanIntoTasks(String(row.user_id));

    moved += report.moved;
    duplicates += report.duplicates;
    dismissed += report.dismissed;
    completed += report.completed;
    withoutCatalog += report.withoutCatalog.length;
    remaining += report.remaining;

    if (report.planDeleted) deleted += 1;

    if (report.remaining > 0) {
      remainingDetails.push(
        `пользователь #${row.user_id}: ${report.remaining} задач осталось (${report.remainingTitles.join(', ')})`
      );
    }

    console.log(
      `  #${row.user_id}: перенесено ${report.moved}, дублей убрано ${report.duplicates}, ` +
        `удалённых человеком пропущено ${report.dismissed}, выполненных ${report.completed}, ` +
        `без каталога ${report.withoutCatalog.length}` +
        `${report.withoutCatalog.length > 0 ? ` (${report.withoutCatalog.join(', ')})` : ''}, ` +
        `осталось ${report.remaining}, расписание ${report.planDeleted ? 'удалено' : 'оставлено'}`
    );
  }

  console.log('\n=== Итог ===');
  console.log(`пользователей обработано: ${users.rows.length}`);
  console.log(`задач перенесено: ${moved}`);
  console.log(`  из них выполненных (перенесены как разовые, с историей): ${completed}`);
  console.log(`без совпадения в каталоге (остались разовыми): ${withoutCatalog}`);
  console.log(`дублей по названию убрано из плана: ${duplicates}`);
  console.log(`удалённых человеком задач не возвращено (память об отказах): ${dismissed}`);
  console.log(`расписаний «${HOME_PLAN_SCHEDULE_TITLE}» удалено: ${deleted}`);
  console.log(`задач осталось в планах: ${remaining}`);

  if (remainingDetails.length > 0) {
    console.log('\nОсталось (расписания не удалены):');
    for (const detail of remainingDetails) console.log(`  - ${detail}`);
  }
};

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error('Перенос упал:', err);
    await pool.end().catch(() => undefined);
    process.exitCode = 1;
  });
