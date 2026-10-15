import type { PoolClient } from 'pg';
import type { ContentLocale } from '../services/contentLocale';

/**
 * Запись переводов справочников.
 *
 * Таблиц переводов семь, и у каждой свой набор колонок, поэтому здесь один
 * общий помощник с именами таблиц и колонок из объединения типов: значения
 * приходят параметрами ($1, $2, ...), в SQL подставляются только имена,
 * которые код и так знает наизусть.
 *
 * `ON CONFLICT ... DO UPDATE` делает сид идемпотентным: повторный запуск
 * обновляет перевод, а не падает на дубликате и не плодит строки.
 */

export type TranslationTable =
  | 'challenge_translations'
  | 'challenge_day_translations'
  | 'challenge_task_translations'
  | 'achievement_translations'
  | 'habit_template_translations'
  | 'schedule_translations'
  | 'task_translations';

export type TranslationKeyColumn =
  | 'challenge_id'
  | 'challenge_day_id'
  | 'challenge_task_id'
  | 'achievement_id'
  | 'habit_template_id'
  | 'schedule_id'
  | 'task_id';

export interface TranslationRow {
  table: TranslationTable;
  keyColumn: TranslationKeyColumn;
  key: number;
  locale: ContentLocale;
  /** Колонки перевода: `{ title: 'Spring cleaning', hint: null }`. */
  fields: Record<string, string | null>;
}

/** Записать один перевод. Пустая строка и `null` означают «перевода нет». */
export const upsertTranslation = async (
  client: PoolClient,
  { table, keyColumn, key, locale, fields }: TranslationRow,
): Promise<void> => {
  const columns = Object.keys(fields);

  if (columns.length === 0) {
    return;
  }

  const values = columns.map((column) => fields[column] ?? null);
  const placeholders = [key, locale, ...values].map((_, index) => `$${index + 1}`);

  await client.query(
    `INSERT INTO ${table} (${keyColumn}, locale, ${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     ON CONFLICT (${keyColumn}, locale) DO UPDATE
        SET ${columns.map((column) => `${column} = EXCLUDED.${column}`).join(', ')}`,
    [key, locale, ...values],
  );
};

/** Записать переводы пачкой — сид грузит справочники целиком. */
export const upsertTranslations = async (
  client: PoolClient,
  rows: TranslationRow[],
): Promise<void> => {
  for (const row of rows) {
    await upsertTranslation(client, row);
  }
};

/** Строки, которых нет в переводе: имена идут в сообщение об ошибке сида. */
export const missingKeys = (
  expected: readonly string[],
  translated: Readonly<Record<string, unknown>>,
): string[] => expected.filter((key) => !(key in translated));

/** Лишние ключи перевода: обычно это опечатка или переименованный пункт. */
export const extraKeys = (
  expected: readonly string[],
  translated: Readonly<Record<string, unknown>>,
): string[] => Object.keys(translated).filter((key) => !expected.includes(key));
