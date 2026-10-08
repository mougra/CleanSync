import dotenv from 'dotenv';
import app from './app';
import pool from './db';
import { startReminderScheduler } from './services/push';

dotenv.config();

const PORT = process.env.PORT || 5000;

const start = async (): Promise<void> => {
  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL: соединение установлено');
  } catch (err) {
    console.error('Нет соединения с PostgreSQL. Порядок действий:');
    console.error('  docker compose up -d postgres');
    console.error('  npm run migrate:up && npm run seed');    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Планировщик напоминаний живёт в процессе сервера: отдельного воркера
  // пока нет, а один инстанс Express у нас и так один.
  startReminderScheduler();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

start();
