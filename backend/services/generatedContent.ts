import pool from '../db';
import { taskTitleEn } from '../content/en/taskSets';
import { DEFAULT_TASK_SOURCE, DEFAULT_TASKS_SCHEDULE_TITLE } from './defaultTasks';
import { HOME_PLAN_SOURCE } from './homePlan';
import { HOME_PLAN_SCHEDULE_TITLE } from './mergePlanIntoTasks';
import { upsertTranslation } from './translations';
import type { ContentLocale } from './contentLocale';

/**
 * Английские названия сгенерированных расписаний.
 *
 * Расписание «Мои задачи» и прежнее «План по дому» создаёт сервер (или клиент
 * ровно тем же названием), и по названию же их потом находят: `TaskCreateSheet`
 * ищет «Мои задачи», генератор — тоже. Поэтому название в базе остаётся русским
 * ключом, а перевод живёт отдельной строкой в `schedule_translations`.
 */
export const GENERATED_SCHEDULE_TITLE_EN: Record<string, string> = {
  [DEFAULT_TASKS_SCHEDULE_TITLE]: 'My tasks',
  [HOME_PLAN_SCHEDULE_TITLE]: 'Home plan',
};

/**
 * Переводы сгенерированного набора задач и расписаний.
 *
 * Зачем. Задачи из каталога попадают в `tasks` русским названием — оно и есть
 * ключ: генератор не создаёт вторую копию задачи с тем же названием,
 * `dismissed_default_tasks` помнит отказы по названию, а «Вернуть» ищет задачу
 * по нему же. Подменить название на английское значило бы сломать
 * идемпотентность набора и воскрешать удалённое. Поэтому английский текст лежит
 * рядом, в `task_translations`, и подставляется только при чтении.
 *
 * Вызывается после генерации плана и при смене языка: в обоих случаях набор
 * переводов нужно привести к текущему языку пользователя. Задача, которую
 * человек переименовал руками, перестаёт совпадать с каталогом — её перевод
 * удаляем, чтобы не показывать устаревший английский текст.
 */
export const relocalizeGeneratedContent = async (
  userId: number | string,
  locale: ContentLocale,
): Promise<void> => {
  const client = await pool.connect();

  try {
    const tasks = await client.query<{ id: number; title: string }>(
      `SELECT t.id, t.title
         FROM tasks t
         JOIN schedules s ON s.id = t.schedule_id
        WHERE s.user_id = $1 AND t.source = ANY($2::text[])`,
      [userId, [DEFAULT_TASK_SOURCE, HOME_PLAN_SOURCE]],
    );

    const schedules = await client.query<{ id: number; title: string }>(
      `SELECT id, title FROM schedules WHERE user_id = $1 AND title = ANY($2::text[])`,
      [userId, Object.keys(GENERATED_SCHEDULE_TITLE_EN)],
    );

    await client.query('BEGIN');

    if (tasks.rows.length > 0 && locale === 'en') {
      const translated: number[] = [];

      for (const task of tasks.rows) {
        const titleEn = taskTitleEn(task.title);

        if (!titleEn) {
          continue;
        }

        await upsertTranslation(client, {
          table: 'task_translations',
          keyColumn: 'task_id',
          key: task.id,
          locale: 'en',
          fields: { title: titleEn },
        });

        translated.push(task.id);
      }

      const stale = tasks.rows.map((task) => task.id).filter((id) => !translated.includes(id));

      if (stale.length > 0) {
        await client.query('DELETE FROM task_translations WHERE task_id = ANY($1::int[])', [stale]);
      }
    }

    if (schedules.rows.length > 0 && locale === 'en') {
      for (const schedule of schedules.rows) {
        const titleEn = GENERATED_SCHEDULE_TITLE_EN[schedule.title];

        if (!titleEn) {
          continue;
        }

        await upsertTranslation(client, {
          table: 'schedule_translations',
          keyColumn: 'schedule_id',
          key: schedule.id,
          locale: 'en',
          fields: { title: titleEn },
        });
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
