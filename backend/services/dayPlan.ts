import pool from '../db';
import type { ContentLocale } from './contentLocale';

/** Частоты, у которых результат считается по дню, а не по задаче. */
const RECURRING_FREQUENCIES: readonly string[] = ['daily', 'weekly', 'monthly'];

/**
 * Задачи, попадающие на конкретный день.
 *
 * Условия периодичности живут в одном месте: «План на сегодня», список ближайших
 * дней и недельное письмо обязаны считать одинаково, иначе недельная задача
 * появится в одном месте и исчезнет в другом. Дата — в UTC, как было и раньше.
 *
 * Про интервал: интервал выражается **днями** для всех частот (миграция 0022),
 * поэтому день переводится в единицу периода (неделя — 7, месяц — 30) и уже она
 * сравнивается по модулю с опорой `due_date`. При интервале в одну единицу периода
 * (7/30) всё как раньше: задача недели/месяца.
 *
 * Про результат дня. `is_completed` в ответе — это результат **на запрошенный
 * день**, а не текущий флаг задачи (миграция 0018, таблица `task_completions`):
 *  - повторяющееся дело (daily/weekly/monthly) закрыто, только если на этот день
 *    есть отметка. Вчерашняя галочка не переезжает на завтра;
 *  - разовое дело (once/due_date) закрыто, если отметка есть на его дату или
 *    стоит прежний флаг `tasks.is_completed`: сделанное однажды остаётся
 *    сделанным, второго дня у такого дела нет.
 * Правило целиком живёт в SQL (колонка `completed_for_day`), а не размазано по
 * вызывающим: «Сегодня» и календарь читают один и тот же признак.
 */
export const tasksDueOn = async (userId: string, date: Date, locale: ContentLocale) => {
  const dayOfWeek = date.getUTCDay(); // 0-6, 0 — воскресенье
  const dayOfMonth = date.getUTCDate(); // 1-31
  const dayStr = date.toISOString().split('T')[0];

  const result = await pool.query(
    `SELECT t.*,
            -- Названия задач и расписаний отдаём на языке запроса. Английский
            -- лежит в таблицах переводов, а ключом остаётся русское название:
            -- по нему генератор набора и «Вернуть» находят уже созданные задачи,
            -- поэтому подменять его в базе нельзя (правило про идемпотентность).
            COALESCE(tt.title, t.title) AS localized_title,
            COALESCE(st.title, s.title) as schedule_title,
            CASE
              -- Повторяющееся дело: результат строго на этот день.
              -- COALESCE: у задачи без частоты (NULL) условие дало бы NULL, и
              -- разбор молча ушёл бы в ветку ELSE — лучше сказать это явно.
              WHEN COALESCE(t.frequency, '') = ANY($5::text[])
                THEN EXISTS (SELECT 1 FROM task_completions c
                              WHERE c.task_id = t.id AND c.completed_on = $4::date)
              -- Разовое: отметка на его дату или прежний флаг задачи.
              ELSE t.is_completed
                   OR EXISTS (SELECT 1 FROM task_completions c
                               WHERE c.task_id = t.id AND c.completed_on = t.due_date)
            END AS completed_for_day
     FROM tasks t
     JOIN schedules s ON t.schedule_id = s.id
     LEFT JOIN task_translations tt ON tt.task_id = t.id AND tt.locale = $6
     LEFT JOIN schedule_translations st ON st.schedule_id = s.id AND st.locale = $6
     WHERE (
             s.user_id = $1
             -- Общий план дома: задачи мои или ничейные, чужие не показываем
             OR (s.household_id IS NOT NULL
                 AND s.household_id IN (SELECT household_id FROM household_members WHERE user_id = $1)
                 AND (t.assignee_id IS NULL OR t.assignee_id = $1))
           )
       AND (
         -- Периодичность «раз в N дней» (interval_count). Интервал выражается
         -- **днями** для всех частот (миграция 0022): «раз в 3 недели» — это 21,
         -- «раз в 3 месяца» — 90. Чтобы сравнить цикл с опорой («due_date»), день
         -- переводится в единицу периода: неделя — 7 дней, месяц — 30.
         --
         -- Выбор формул не случаен. У **недельного** дела шаг цикла — это шаг
         -- выбранного дня недели, поэтому недели и считаются: 21 день — каждый
         -- третий понедельник. У **месячного** дела день месяца фиксирован
         -- («day_of_month»), поэтому и сравниваются календарные месяцы: «раз в 3
         -- месяца» — это сентябрь, декабрь, март, а не «каждые 90 дней от опоры».
         -- С дней на месяцы интервал переводится делением на 30 — ровно тот
         -- делитель, которым генератор мерил месячные ступени.
         (t.frequency = 'daily' AND t.interval_count <= 1) OR
         (t.frequency = 'daily' AND t.due_date IS NOT NULL
           AND MOD(($4::date - t.due_date), t.interval_count) = 0) OR
         (t.frequency = 'weekly' AND t.day_of_week = $2 AND t.interval_count = 7) OR
         (t.frequency = 'weekly' AND t.day_of_week = $2 AND t.due_date IS NOT NULL
           AND MOD(t.interval_count, 7) = 0
           AND MOD(FLOOR(($4::date - t.due_date)::numeric / 7)::int, t.interval_count / 7) = 0) OR
         (t.frequency = 'monthly' AND (t.day_of_month + COALESCE(t.month_shifts[EXTRACT(MONTH FROM $4::date)::int], 0)) = $3 AND t.interval_count = 30) OR
         (t.frequency = 'monthly' AND (t.day_of_month + COALESCE(t.month_shifts[EXTRACT(MONTH FROM $4::date)::int], 0)) = $3 AND t.due_date IS NOT NULL
           AND MOD(
                 MOD(
                   (EXTRACT(YEAR FROM $4::date) * 12 + EXTRACT(MONTH FROM $4::date))
                   - (EXTRACT(YEAR FROM t.due_date) * 12 + EXTRACT(MONTH FROM t.due_date)),
                   -- GREATEST: у месячного дела интервал не бывает меньше 30 дней,
                   -- но кривая строка (например, оставшаяся от ручной правки) дала
                   -- бы деление на ноль — и падал бы весь план дня, а с ним и кольца
                   -- календаря. Пусть лучше считается «раз в месяц».
                   GREATEST(t.interval_count / 30, 1)
                 ) + GREATEST(t.interval_count / 30, 1),
                 GREATEST(t.interval_count / 30, 1)
               ) = 0) OR
         (t.due_date = $4)
       )
     -- Архивные задачи (устаревшие сгенерированные, у которых уже есть история)
     -- в план не показываем: они остаются в базе ради журнала отметок, но человек
     -- их больше не видит. Так чистка набора не стирает серию и статистику.
     AND t.source IS DISTINCT FROM 'home_profile_archived'
     -- При равном или пустом времени Postgres не обещает порядок, и строки
     -- переставлялись после каждой отметки: идентификатор — устойчивый добор.
     ORDER BY t.time ASC NULLS LAST, t.id ASC`,
    [userId, dayOfWeek, dayOfMonth, dayStr, RECURRING_FREQUENCIES, locale],
  );

  /**
   * Наружу уходит `is_completed` на запрошенный день, а служебные колонки
   * `completed_for_day` и `localized_title` — нет: форма ответа «Сегодня»
   * и календаря остаётся прежней, меняется только смысл признака и язык текста.
   */
  return result.rows.map(({ completed_for_day, localized_title, ...task }) => ({
    ...task,
    title: localized_title ?? task.title,
    is_completed: completed_for_day === true,
  }));
};

/**
 * План на конкретный день в виде, пригодном для письма: только незакрытые дела,
 * с зоной и минутами. Живёт рядом с `tasksDueOn`, потому что правило отбора
 * задач менять нельзя, а показать их можно по-разному.
 */
export interface DayPlanItem {
  title: string;
  room: string | null;
  minutes: number;
}

export const dayPlanForDate = async (
  userId: string,
  isoDate: string,
  locale: ContentLocale,
): Promise<{ items: DayPlanItem[]; totalMinutes: number; remainingMinutes: number }> => {
  const tasks = await tasksDueOn(userId, new Date(`${isoDate}T00:00:00Z`), locale);
  const remaining = tasks.filter((task) => !task.is_completed);

  return {
    items: remaining.map((task) => ({
      title: task.title,
      room: task.room ?? null,
      minutes: Number(task.estimated_minutes) || 0,
    })),
    totalMinutes: tasks.reduce((sum, task) => sum + (Number(task.estimated_minutes) || 0), 0),
    remainingMinutes: remaining.reduce((sum, task) => sum + (Number(task.estimated_minutes) || 0), 0),
  };
};
