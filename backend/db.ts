import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

/**
 * `DATE` из Postgres отдаём строкой, а не моментом времени.
 *
 * Драйвер по умолчанию превращает `date` в объект `Date` — в поясе процесса. Из-за
 * этого календарный день уезжал на сутки: в базе `2026-10-13`, а в JSON
 * `2026-10-12T20:00:00.000Z` (пояс этой машины восточнее UTC). Страдало всё, где дата
 * означает именно **день**, а не момент: `due_date` (якорь циклов «раз в N дней» и
 * «раз в N недель»), `task_completions.completed_on`, `habit_completions.completed_on`,
 * дни отпуска. Два видимых следствия: интерфейсу приходилось сдвигать день при правке
 * задачи, а возврат удалённой задачи создавал её «вчера» — в базе задача появлялась, а
 * в плане на сегодня её не было.
 *
 * Поэтому отдаём ровно то, что лежит в колонке: `YYYY-MM-DD`. Где нужен момент времени,
 * он берётся из колонки-момента (`completed_at`, `done_at`) и приводится к дню явно —
 * см. `services/appTime.ts`.
 */
pg.types.setTypeParser(1082, (value: string) => value);

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'clean_planner'
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
