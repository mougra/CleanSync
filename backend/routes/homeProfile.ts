import express, { Request, Response } from 'express';
import pool from '../db';
import { authMiddleware } from '../auth';
import {
  buildDefaultTasks,
  DEFAULT_TASK_SOURCE,
  myTasksScheduleDescription,
  normalizeTaskTitle,
  type DefaultTaskSet,
} from '../services/defaultTasks';
import { dayBudget } from '../services/dailyBudget';
import { resolveContentLocale, type ContentLocale } from '../services/contentLocale';
import { relocalizeGeneratedContent } from '../services/generatedContent';
import { getTaskCatalog } from '../services/taskCatalog';
import { catalogTitle as localCatalogTitle, catalogZone as localZoneTitle, catalogCadence as localCadenceTitle } from '../services/catalogLocale';
import {
  CLEANING_LEVELS,
  CLEANING_STYLES,
  COMPOSITIONS,
  DAILY_MINUTES_OPTIONS,
  DEFAULT_HOME_ANSWERS,
  DRYING_OPTIONS,
  HARDEST_ZONES,
  HOUSING_TYPES,
  OUTDOOR_OPTIONS,
  PET_OPTIONS,
  ROOM_OPTIONS,
  WEEK_DAYS,
  answersFromStoredRow,
  focusZoneLabel,
  orderWeekDays,
  type HomeAnswers,
  type PartialHomeAnswers,
} from '../services/homePlan';
import {
  HOME_PLAN_SCHEDULE_TITLE,
  mergePlanIntoTasks,
  type MergePlanReport,
} from '../services/mergePlanIntoTasks';

/**
 * Мастер «Настройка по дому»: анкета о доме и ритме уборки + сборка набора задач.
 *
 * Профиль дома один на пользователя (home_profiles.user_id — первичный ключ),
 * ответы можно сохранять пошагово: PUT принимает и одно поле, и все сразу.
 *
 * Источник задач теперь один — постоянный набор «Мои задачи»
 * (services/defaultTasks.ts): дела с периодичностью, которые дальше живут своей
 * жизнью (человек может их менять и дополнять). Набор появляется сам, как только
 * анкета пройдена (PUT с `complete: true`), а также достраивается при обращении к
 * «плану» (POST и GET /plan).
 *
 * Недельного плана «План по дому» больше нет. Заказчик оставил один источник
 * задач, поэтому:
 *  - `buildHomePlan` (services/homePlan.ts) в этом маршруте не вызывается, а
 *    расписание «План по дому» не создаётся ни в одном потоке завершения анкеты;
 *  - у кого план уже был, его задачи переносятся в «Мои задачи»
 *    (services/mergePlanIntoTasks.ts), после чего расписание плана удаляется;
 *  - сам модуль недельного плана сохранён целиком и может вернуться как
 *    необязательная функция — в его шапке это помечено.
 *
 * Форма ответов API сохранена: `plan` (POST и GET /plan) по-прежнему описывает
 * готовый план — дни, задачи, уровень, фокусную зону и сводку, — но теперь это
 * набор «Мои задачи», а не недельная раскладка. Пустого экрана «План готов» не
 * будет: количество задач и минуты берутся из реального расписания.
 *
 * Прогресс анкеты. Значения по умолчанию в таблице (миграция 0010) не дают
 * отличить отвеченный шаг от пропущенного, поэтому имена явно присланных полей
 * копятся в `home_profiles.answered_fields` и уходят наружу как `answeredFields`.
 * Это только информация для интерфейса: на сборку набора список не влияет.
 */
const router = express.Router();

/**
 * Заголовок прежнего недельного плана: по нему план находится при переносе и
 * удаляется при сбросе анкеты. Константа живёт рядом с переносом
 * (services/mergePlanIntoTasks.ts) — там же, где её знают.
 */
const PLAN_TITLE = HOME_PLAN_SCHEDULE_TITLE;

interface HomeProfileRow {
  housing_type: string;
  rooms: string;
  composition: string;
  pets: string[] | null;
  outdoor: string;
  has_kids_room: boolean;
  has_garage: boolean;
  works_from_home: boolean;
  drying: string;
  cleaning_level: string;
  daily_minutes: string;
  cleaning_style: string;
  cleaning_days: number[] | null;
  hardest_zone: string;
  /** Имена полей, которые человек заполнил явно (миграция 0015). */
  answered_fields: string[] | null;
  completed_at: string | null;
  updated_at: string | null;
}

/** Колонка → поле ответа и допустимые значения (по вариантам шагов макета). */
const FIELD_RULES: Record<
  keyof PartialHomeAnswers,
  { column: string; values?: readonly string[]; kind: 'string' | 'boolean' | 'intArray' | 'textArray' }
> = {
  housingType: { column: 'housing_type', values: HOUSING_TYPES, kind: 'string' },
  rooms: { column: 'rooms', values: ROOM_OPTIONS, kind: 'string' },
  composition: { column: 'composition', values: COMPOSITIONS, kind: 'string' },
  pets: { column: 'pets', values: PET_OPTIONS, kind: 'textArray' },
  outdoor: { column: 'outdoor', values: OUTDOOR_OPTIONS, kind: 'string' },
  hasKidsRoom: { column: 'has_kids_room', kind: 'boolean' },
  hasGarage: { column: 'has_garage', kind: 'boolean' },
  worksFromHome: { column: 'works_from_home', kind: 'boolean' },
  drying: { column: 'drying', values: DRYING_OPTIONS, kind: 'string' },
  cleaningLevel: { column: 'cleaning_level', values: CLEANING_LEVELS, kind: 'string' },
  dailyMinutes: { column: 'daily_minutes', values: DAILY_MINUTES_OPTIONS, kind: 'string' },
  cleaningStyle: { column: 'cleaning_style', values: CLEANING_STYLES, kind: 'string' },
  cleaningDays: { column: 'cleaning_days', kind: 'intArray' },
  hardestZone: { column: 'hardest_zone', values: HARDEST_ZONES, kind: 'string' },
};

const SELECT_FIELDS = `housing_type, rooms, composition, pets, outdoor, has_kids_room, has_garage,
  works_from_home, drying, cleaning_level, daily_minutes, cleaning_style, cleaning_days,
  hardest_zone, answered_fields, completed_at::text AS completed_at, updated_at::text AS updated_at`;

/** Профиль дома пользователя или null, если анкету ещё не начинали. */
const loadProfile = async (userId: string): Promise<HomeProfileRow | null> => {
  const result = await pool.query<HomeProfileRow>(
    `SELECT ${SELECT_FIELDS} FROM home_profiles WHERE user_id = $1`,
    [userId]
  );

  return result.rows[0] ?? null;
};

/** Имена полей анкеты: по ним же проверяем список явных ответов. */
const ANSWER_FIELD_NAMES: ReadonlySet<string> = new Set(Object.keys(FIELD_RULES));

/**
 * Явно заполненные поля профиля.
 *
 * Список читается из своей же колонки, но наружу отдаются только известные
 * имена: в базе мог оказаться мусор от старого клиента, а интерфейс по этим
 * именам считает шаги мастера, и лишняя строка сломала бы счёт.
 */
const toAnsweredFields = (row: HomeProfileRow | null): string[] =>
  (row?.answered_fields ?? []).filter((field) => ANSWER_FIELD_NAMES.has(field));

/**
 * Ответ интерфейсу: те же ключи, что ждёт мастер, плюс флаг завершённости и
 * список явно заполненных полей.
 *
 * `answeredFields` — это прогресс, а не часть анкеты: значения в `profile`
 * по-прежнему приходят с подставленными умолчаниями (миграция 0010), и
 * отличить «выбрал» от «не трогали» можно только по этому списку.
 */
const toProfileResponse = (row: HomeProfileRow | null) => {
  if (!row) {
    return { profile: null, completed: false, answeredFields: [] as string[] };
  }

  const profile = {
    housingType: row.housing_type,
    rooms: row.rooms,
    composition: row.composition,
    pets: row.pets ?? [],
    outdoor: row.outdoor,
    hasKidsRoom: row.has_kids_room,
    hasGarage: row.has_garage,
    worksFromHome: row.works_from_home,
    drying: row.drying,
    cleaningLevel: row.cleaning_level,
    dailyMinutes: row.daily_minutes,
    cleaningStyle: row.cleaning_style,
    cleaningDays: row.cleaning_days ?? [],
    hardestZone: row.hardest_zone,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };

  return { profile, completed: row.completed_at !== null, answeredFields: toAnsweredFields(row) };
};

/**
 * Разбирает тело запроса: пустой PUT не должен затирать ответы, а явно
 * переданные поля — обновляться, даже если это false или пустой массив.
 */
const parseAnswers = (
  body: unknown
): { answers: PartialHomeAnswers; error?: string; provided: number; reachedEnd: boolean } => {
  const input = (body ?? {}) as Record<string, unknown>;
  const answers: PartialHomeAnswers = {};
  // Мастер присылает complete: true на последнем шаге: только тогда анкета
  // считается пройденной. Без этого флага значения по умолчанию в базе
  // выглядели бы как «человек ответил на всё» уже после первого шага.
  const reachedEnd = input.complete === true;
  let provided = 0;

  for (const key of Object.keys(FIELD_RULES) as (keyof PartialHomeAnswers)[]) {
    if (!(key in input)) continue;

    const value = input[key];
    const rule = FIELD_RULES[key];
    provided += 1;

    if (rule.kind === 'boolean') {
      if (typeof value !== 'boolean') {
        return { answers, error: `Поле «${key}» должно быть true или false`, provided, reachedEnd };
      }
      Object.assign(answers, { [key]: value });
      continue;
    }

    if (rule.kind === 'string') {
      if (typeof value !== 'string' || !rule.values?.includes(value)) {
        return {
          answers,
          error: `Недопустимое значение «${key}»: ${value}. Допустимо: ${rule.values?.join(', ')}`,
          provided,
          reachedEnd,
        };
      }
      Object.assign(answers, { [key]: value });
      continue;
    }

    if (rule.kind === 'textArray') {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        return { answers, error: `Поле «${key}» должно быть массивом строк`, provided, reachedEnd };
      }
      const unknown = value.find((item) => !rule.values?.includes(item as string));
      if (unknown !== undefined) {
        return {
          answers,
          error: `Недопустимое значение «${key}»: ${unknown}. Допустимо: ${rule.values?.join(', ')}`,
          provided,
          reachedEnd,
        };
      }
      Object.assign(answers, { [key]: value as string[] });
      continue;
    }

    // intArray: дни недели 0-6, каждый день не больше одного раза
    if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item))) {
      return { answers, error: `Поле «${key}» должно быть массивом чисел`, provided, reachedEnd };
    }

    const dayNumbers = value as number[];
    if (dayNumbers.some((day) => day < 0 || day > 6)) {
      return { answers, error: `Дни недели — числа от 0 (воскресенье) до 6 (суббота)`, provided, reachedEnd };
    }

    Object.assign(answers, { [key]: [...new Set(dayNumbers)].sort((left, right) => left - right) });
  }

  return { answers, provided, reachedEnd };
};

/** GET /api/home-profile — анкета пользователя, прогресс и null вместо профиля. */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json(toProfileResponse(await loadProfile(String(req.userId))));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch home profile' });
  }
});

/**
 * PUT /api/home-profile — сохранить ответы.
 *
 * Можно частично, шаг за шагом: присылайте только те поля, которые человек
 * успел выбрать. Первое сохранение заводит профиль, дальнейшие обновляют.
 * `completed_at` ставится ровно по флагу `complete: true` с последнего шага
 * мастера — по самим ответам завершённость не выводится.
 *
 * Флаг можно прислать и без полей: последний шаг разрешено пропустить, и тогда
 * тело — это ровно `{ complete: true }`. Отвергается только вовсе пустой запрос
 * (ни поля, ни флага): иначе «завершить анкету» получилось бы одним `{}`.
 *
 * Имена пришедших полей добавляются в `answered_fields` — по ним интерфейс
 * считает пройденные шаги мастера. Список только растёт, поэтому повторный
 * проход анкеты (и «Пропустить» на отдельных шагах) не обнуляет прогресс.
 */
router.put('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = parseAnswers(req.body);

    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    /**
     * Пустой PUT по-прежнему ошибка: «завершить без всего» нельзя. Но последний
     * шаг мастера можно пропустить — тогда приходит только `{ complete: true }`,
     * без единого поля, и это законное завершение анкеты, а не мусор.
     */
    if (parsed.provided === 0 && !parsed.reachedEnd) {
      res.status(400).json({ error: 'Нужно передать хотя бы одно поле анкеты' });
      return;
    }

    const userId = String(req.userId);
    const current = await loadProfile(userId);

    if (current) {
      const fields = Object.keys(parsed.answers) as (keyof PartialHomeAnswers)[];
      const values = fields.map((field) => parsed.answers[field]);
      const setters = fields.map((field, index) => `${FIELD_RULES[field].column} = $${index + 1}`);

      // Номера оставшихся параметров: список пришедших полей, флаг завершения,
      // user_id. Список полей передаём массивом строк — Postgres сам приведёт
      // его к text[].
      const answeredIndex = values.length + 1;
      const completeIndex = values.length + 2;
      const userIndex = values.length + 3;

      /**
       * `answered_fields` только пополняется: объединение старого массива с
       * пришедшими именами идёт одним UPDATE, поэтому повторный проход анкеты
       * не теряет ранее отвеченные шаги, а два одновременных запроса не
       * затирают друг друга (перечитывать список в JS не нужно).
       *
       * `completed_at` ставится только явным флагом с последнего шага и больше
       * ни от чего не зависит: шаг разрешено пропустить, а значения по умолчанию
       * описывают «типовой дом» (правило 28), поэтому по самим ответам отличить
       * пройденный мастер от пропущенного нельзя.
       */
      /**
       * Полей может не быть вовсе: последний шаг разрешено пропустить, и тогда
       * приходит только флаг завершения. Поэтому присвоения собираем списком:
       * пустой `setters` давал `SET , answered_fields = …` — синтаксическую
       * ошибку и 500 вместо 200 (найдено живым прогоном, закрыто тестом).
       */
      const assignments = [
        ...setters,
        `answered_fields = (
                  SELECT COALESCE(array_agg(DISTINCT name ORDER BY name), '{}')
                    FROM unnest(answered_fields || $${answeredIndex}::text[]) AS name
                )`,
        `completed_at = CASE WHEN $${completeIndex} THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END`,
        'updated_at = CURRENT_TIMESTAMP',
      ];

      await pool.query(
        `UPDATE home_profiles
            SET ${assignments.join(',\n                ')}
          WHERE user_id = $${userIndex}`,
        [...values, fields, parsed.reachedEnd, userId]
      );
    } else {
      const fields = Object.keys(parsed.answers) as (keyof PartialHomeAnswers)[];
      const columns = [
        'user_id',
        ...fields.map((field) => FIELD_RULES[field].column),
        'answered_fields',
        'completed_at',
      ];
      const values: unknown[] = [
        userId,
        ...fields.map((field) => parsed.answers[field]),
        [...fields].sort(),
      ];
      values.push(parsed.reachedEnd ? new Date() : null);

      const placeholders = values.map((_, index) => `$${index + 1}`);

      await pool.query(
        `INSERT INTO home_profiles (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         ON CONFLICT (user_id) DO NOTHING`,
        values
      );
    }

    const updated = await loadProfile(userId);

    /**
     * Анкета пройдена — сразу собираем постоянный набор «Мои задачи», не
     * дожидаясь кнопки «собрать план»: готовый список дел должен появляться
     * сам.
     *
     * `removeStale` здесь **включён**. Раньше он был выключен, «чтобы правки не
     * улетали при каждом шаге», и это оказалось ошибкой: человек проходил анкету
     * заново, а прежние сгенерированные задачи оставались в расписании — ровно
     * на это и жаловался заказчик («перепрошёл опросник, а задачи прежние»).
     * Завершение анкеты и есть явная пересборка плана, поэтому устаревшие
     * сгенерированные задачи (с пометкой источника, незакрытые и отсутствующие в
     * новом наборе) удаляются. Задачи, созданные человеком, не трогаются никогда:
     * у них нет пометки источника, и под условие удаления они не попадают.
     *
     * Перед пересборкой прежний недельный план переносится в набор
     * (services/mergePlanIntoTasks.ts): второй источник задач больше не
     * создаётся, а уже существующий должен влиться в «Мои задачи» без дублей.
     * Порядок именно такой — сначала перенос, потом сборка: перенесённые
     * названия уже стоят в расписании, и `syncDefaultTasks` видит их как
     * существующие, а не создаёт вторые.
     */
    if (updated && updated.completed_at) {
      try {
        const answers = answersFromStoredRow(updated);
        const defaultSet = buildDefaultTasks(answers);
        const merged = await mergePlanIntoTasks(userId);
        const myTasks = await syncDefaultTasks(userId, defaultSet, { removeStale: true });

        // Набор только что собран русскими названиями (они — ключ идемпотентности),
        // поэтому английские подписи кладём рядом, в таблицу переводов.
        await relocalizeGeneratedContent(userId, resolveContentLocale(req));

        res.json({
          ...toProfileResponse(updated),
          myTasks: toMyTasksResponse(myTasks, defaultSet, merged),
        });
        return;
      } catch (err) {
        // Профиль уже сохранён: неудача сборки набора не должна превращать
        // успешный PUT в 500 — набор достроится при следующем обращении.
        console.error('Не удалось собрать «Мои задачи»:', err);
      }
    }

    res.json(toProfileResponse(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save home profile' });
  }
});

/**
 * Строка БД → ответы анкеты для генератора.
 *
 * `completed_at` здесь ни при чём: завершённость читается из самой колонки
 * (`toProfileResponse`), а не выводится из ответов — пропущенный шаг и ответ
 * «по умолчанию» по значениям неразличимы. Само сопоставление живёт в
 * services/homePlan.ts (`answersFromStoredRow`): тем же помощником читает анкету
 * перенос задач из «Плана по дому», и второй копии правил быть не должно.
 */
const toAnswers = (row: HomeProfileRow): HomeAnswers => answersFromStoredRow(row);

/** Задача набора в объёме, который нужен «плану» и финальному экрану мастера. */
interface PlanTaskRow {
  id: number;
  /** Русское название из базы: по нему находится запись каталога (уровень, теги). */
  source_title: string;
  /** Название на языке запроса — то, что видит человек. */
  title: string;
  room: string | null;
  estimated_minutes: number | null;
  frequency: string | null;
  day_of_week: number | null;
}

/**
 * «План» в терминах единого набора «Мои задачи».
 *
 * Раньше здесь была недельная раскладка (buildHomePlan): дни с планом и итогами.
 * Источник задач теперь один, поэтому наружу уходит тот же конверт, но с
 * содержимым набора:
 *  - `days` — ежедневный минимум (он лежит в каждом дне) плюс недельные дела
 *    своего дня, с настоящими id задач: интерфейс может отмечать их сразу;
 *  - `summary` — сколько задач в наборе, сколько они занимают минут и сколько это
 *    в среднем на день: финальный экран «План готов» не должен показывать пустоту;
 *  - `focusZone` — «трудная» зона из анкеты (набор вокруг неё больше не строится,
 *    но человек выбрал именно её, и мастер про неё пишет).
 */
const buildPlanView = async (
  answers: HomeAnswers,
  scheduleId: number,
  set: DefaultTaskSet,
  locale: ContentLocale,
) => {
  /**
   * Название отдаём на языке запроса, но рядом берём и русское: по нему
   * находится запись каталога (уровень задачи и теги знает только каталог,
   * а его ключ — русское название).
   */
  const result = await pool.query<PlanTaskRow>(
    `SELECT t.id,
            t.title AS source_title,
            COALESCE(tt.title, t.title) AS title,
            t.room, t.estimated_minutes, t.frequency, t.day_of_week
       FROM tasks t
       LEFT JOIN task_translations tt ON tt.task_id = t.id AND tt.locale = $2
      WHERE t.schedule_id = $1
      ORDER BY t.id`,
    [scheduleId, locale]
  );

  const rows = result.rows;
  const cleaningDays = new Set(orderWeekDays(answers.cleaningDays));
  const catalogByTitle = new Map(getTaskCatalog().map((item) => [item.task, item]));
  const days = WEEK_DAYS.map(({ dayOfWeek, label }) => {
    const tasks = rows
      .filter(
        (row) =>
          row.frequency === 'daily' ||
          (row.frequency === 'weekly' && row.day_of_week === dayOfWeek)
      )
      .map((row, index) => {
        const catalogTask = catalogByTitle.get(row.source_title);

        return {
          id: row.id,
          position: index + 1,
          title: row.title,
          room: row.room ?? '',
          estimatedMinutes: row.estimated_minutes ?? 0,
          frequency: row.frequency ?? 'once',
          dayOfWeek,
          // Уровень и теги знает только каталог: перенесённая разовая задача
          // (её в каталоге нет) отдаёт null, и это честнее выдуманного уровня.
          level: catalogTask?.level ?? null,
          tags: catalogTask?.tags ?? [],
        };
      });

    return {
      dayOfWeek,
      label,
      selected: cleaningDays.has(dayOfWeek),
      totalTasks: tasks.length,
      totalMinutes: tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
      tasks,
    };
  });

  const totalMinutes = rows.reduce((sum, row) => sum + (row.estimated_minutes ?? 0), 0);
  const activeDays = days.filter((day) => day.totalTasks > 0).length;
  /**
   * «Минут в день» считается по дням, а не делением всех минут набора: месячные и
   * более редкие дела разложены по числам месяца, и делить их на дни недели
   * нельзя — вышло бы 45 минут в день при бюджете 25. День человека состоит из
   * ежедневного минимума и недельных дел своего дня, среднее по ним и показываем.
   */
  const perDayMinutes = activeDays > 0
    ? Math.round(days.reduce((sum, day) => sum + day.totalMinutes, 0) / activeDays)
    : 0;
  const tags = [
    ...new Set(rows.flatMap((row) => catalogByTitle.get(row.title)?.tags ?? [])),
  ].filter((tag) => tag !== 'dry_air' && tag !== 'dry_machine');

  return {
    level: answers.cleaningLevel,
    focusZone: focusZoneLabel(answers.hardestZone),
    days,
    summary: {
      totalTasks: rows.length,
      totalMinutes,
      activeDays,
      minutesPerDay: perDayMinutes,
      dailyBudget: dayBudget(answers),
      rooms: [
        ...new Set(rows.map((row) => row.room).filter((room): room is string => Boolean(room))),
      ],
      tags,
      notes: set.summary.notes,
    },
  };
};

/**
 * Общий ответ «плана» для POST и GET /plan.
 *
 * Разница между ними только в способе сборки набора (`removeStale`), поэтому
 * конверт собирается в одном месте: расписание, дни, сводка, ответы анкеты и
 * отчёт по набору. Форма ответа прежняя — менялось только её содержимое.
 */
const toPlanResponse = async (options: {
  answers: HomeAnswers;
  defaultSet: DefaultTaskSet;
  myTasks: SyncResult;
  merged: MergePlanReport;
  locale: ContentLocale;
}) => {
  const schedule = await pool.query<{ id: number; title: string; created_at: string }>(
    `SELECT s.id, COALESCE(st.title, s.title) AS title, s.created_at::text AS created_at
       FROM schedules s
       LEFT JOIN schedule_translations st ON st.schedule_id = s.id AND st.locale = $2
      WHERE s.id = $1`,
    [options.myTasks.scheduleId, options.locale]
  );
  const row = schedule.rows[0];
  const plan = await buildPlanView(
    options.answers,
    options.myTasks.scheduleId,
    options.defaultSet,
    options.locale,
  );

  return {
    schedule: row ? { id: row.id, title: row.title, createdAt: row.created_at } : null,
    ...plan,
    generatedFor: options.answers,
    myTasks: toMyTasksResponse(options.myTasks, options.defaultSet, options.merged),
  };
};

/**
 * Приводит расписание «Мои задачи» в соответствие с набором по анкете.
 *
 * Идемпотентность устроена так:
 *  - расписание ищется по заголовку и создаётся только если его нет;
 *  - уже существующие задачи с тем же названием не трогаются вообще — человек
 *    мог поменять им минуты, день или периодичность, и перезапись это стёрла бы;
 *  - названия из списка отказов (`dismissed_default_tasks`) пропускаются: задачу,
 *    которую человек удалил, пересборка возвращать не должна;
 *  - добавляются только недостающие названия, поэтому повторный вызов не плодит
 *    дубли (ключ — название задачи внутри расписания);
 *  - с `removeStale` (это явная пересборка через POST /plan) убираются только
 *    устаревшие задачи, которые создал этот же набор (`source`), и только
 *    незакрытые: выполненная история и задачи, созданные руками, остаются.
 */
const syncDefaultTasks = async (
  userId: string,
  set: DefaultTaskSet,
  options: { removeStale: boolean }
): Promise<SyncResult> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Два одновременных вызова (двойной клик по «пересобрать») иначе могли бы
    // создать два расписания «Мои задачи»: блокировка живёт до конца транзакции.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), $2::int)', [
      set.scheduleTitle,
      userId,
    ]);

    const existingSchedule = await client.query<{ id: number }>(
      'SELECT id FROM schedules WHERE user_id = $1 AND title = $2 ORDER BY id LIMIT 1',
      [userId, set.scheduleTitle]
    );

    let scheduleId = existingSchedule.rows[0]?.id;

    if (scheduleId === undefined) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO schedules (user_id, title, description)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, set.scheduleTitle, myTasksScheduleDescription(set)]
      );

      scheduleId = inserted.rows[0].id;
    }

    const current = await client.query<{
      id: number;
      title: string;
      is_completed: boolean;
      source: string | null;
      room: string | null;
      estimated_minutes: number | null;
      frequency: string | null;
      interval_count: number | null;
      day_of_week: number | null;
      day_of_month: number | null;
    }>(
      `SELECT id, title, is_completed, source, room, estimated_minutes, frequency,
              interval_count, day_of_week, day_of_month
         FROM tasks WHERE schedule_id = $1
        ORDER BY id`,
      [scheduleId]
    );

    /**
     * Строки по названию — списком, а не одной записью.
     *
     * Раньше здесь лежала одна строка на название, и вторая копия того же дела
     * просто терялась из виду: дубли (`«Вымыть миски питомца»` дважды, разные
     * числа месяца) оставались в расписании навсегда. Теперь лишние копии видно
     * и можно убрать.
     */
    const byTitle = new Map<string, typeof current.rows>();

    for (const row of current.rows) {
      const rows = byTitle.get(row.title) ?? [];
      rows.push(row);
      byTitle.set(row.title, rows);
    }

    const wanted = new Set(set.tasks.map((task) => task.title));

    /**
     * Память об отказах: названия, которые человек удалил (миграция 0017).
     * Сравнение нормализованное — тем же ключом, что и у названий внутри
     * расписания, иначе «Мыть пол» вернулось бы после удаления «Мыть пол».
     */
    const dismissedRows = await client.query<{ title: string }>(
      'SELECT title FROM dismissed_default_tasks WHERE user_id = $1',
      [userId]
    );
    const dismissed = new Set(dismissedRows.rows.map((row) => normalizeTaskTitle(row.title)));

    let created = 0;
    let existing = 0;
    let skipped = 0;
    let updated = 0;
    let deduplicated = 0;

    for (const task of set.tasks) {
      const rows = byTitle.get(task.title);

      if (rows && rows.length > 0) {
        const [keeper, ...extra] = rows;

        /**
         * Расписание существующей сгенерированной задачи **обновляем** под новый
         * набор: периодичность, день, зона и минуты.
         *
         * Без этого перепрохождение анкеты ничего не меняло у тех, у кого задачи
         * уже были: раковина оставалась «каждый день» (в новом каталоге она раз в
         * две недели), гараж продолжал висеть в четверг, а старые частоты жили
         * своей жизнью — ровно на это и жаловался заказчик. Задачи, созданные
         * человеком (`source IS NULL`), не трогаем: это его собственные дела.
         */
        if (keeper.source === DEFAULT_TASK_SOURCE) {
          await client.query(
            `UPDATE tasks
                SET room = $2,
                    estimated_minutes = $3,
                    frequency = $4,
                    interval_count = $5,
                    day_of_week = $6,
                    day_of_month = $7,
                    due_date = $8
              WHERE id = $1`,
            [
              keeper.id,
              task.room,
              task.minutes,
              task.frequency,
              task.intervalCount,
              task.dayOfWeek,
              task.dayOfMonth,
              task.dueDate,
            ]
          );

          updated += 1;
        }

        // Дубли одного названия: лишние сгенерированные копии убираем, чужие
        // (созданные человеком) оставляем.
        const duplicates = extra.filter((row) => row.source === DEFAULT_TASK_SOURCE);

        if (duplicates.length > 0) {
          await client.query('DELETE FROM tasks WHERE id = ANY($1::int[])', [
            duplicates.map((row) => row.id),
          ]);

          deduplicated += duplicates.length;
        }

        existing += 1;
        continue;
      }

      // Удалённое не воскрешаем: человек убрал это дело осознанно, и пересборка
      // не должна возвращать его на экран.
      if (dismissed.has(normalizeTaskTitle(task.title))) {
        skipped += 1;
        continue;
      }

      await client.query(
        `INSERT INTO tasks
           (schedule_id, title, room, estimated_minutes, frequency, interval_count,
            day_of_week, day_of_month, due_date, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          scheduleId,
          task.title,
          task.room,
          task.minutes,
          task.frequency,
          task.intervalCount,
          task.dayOfWeek,
          task.dayOfMonth,
          task.dueDate,
          task.source,
        ]
      );

      created += 1;
    }

    let removed = 0;

    if (options.removeStale) {
      const stale = current.rows.filter(
        (row) => row.source === DEFAULT_TASK_SOURCE && !row.is_completed && !wanted.has(row.title)
      );

      if (stale.length > 0) {
        await client.query('DELETE FROM tasks WHERE id = ANY($1::int[])', [
          stale.map((row) => row.id),
        ]);
        removed = stale.length;
      }
    }

    const total = await client.query<{ total: number }>(
      'SELECT COUNT(*)::int AS total FROM tasks WHERE schedule_id = $1',
      [scheduleId]
    );

    await client.query('COMMIT');

    return {
      scheduleId,
      created,
      existing,
      updated,
      deduplicated,
      removed,
      dismissed: skipped,
      total: total.rows[0].total,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** Что записалось в набор: результат syncDefaultTasks. */
interface SyncResult {
  scheduleId: number;
  created: number;
  existing: number;
  /** Сколько существующих сгенерированных задач обновлено под новый набор. */
  updated: number;
  /** Сколько лишних копий одного названия убрано. */
  deduplicated: number;
  removed: number;
  /** Сколько недостающих дел не создано: их названия в списке отказов. */
  dismissed: number;
  total: number;
}

/** Ответ по постоянному набору: что записалось и как он выглядит по нагрузке. */
const toMyTasksResponse = (saved: SyncResult, set: DefaultTaskSet, merge?: MergePlanReport) => ({
  ...saved,
  title: set.scheduleTitle,
  dailyMinutes: set.summary.dailyMinutes,
  weeklyTasks: set.summary.weeklyTasks,
  monthlyTasks: set.summary.monthlyTasks,
  maxDailyMinutes: set.summary.maxDailyMinutes,
  notes: set.summary.notes,
  ...(merge ? { merged: merge } : {}),
});

/**
 * POST /api/home-profile/preview — собрать набор по ответам **без аккаунта**.
 *
 * Зачем. Анкета и генератор — самая ценная часть продукта, а увидеть их можно
 * было только после регистрации. Гость, пришедший из поиска, уходил, не поняв,
 * что здесь вообще происходит. Этот маршрут отдаёт готовый набор сразу: он
 * ничего не пишет в базу, не знает пользователя и работает на тех же правилах,
 * что и `buildDefaultTasks` для вошедшего.
 *
 * Что дальше с прогрессом. Отметки гостя живут на устройстве (localStorage,
 * см. `web/app/composables/useGuestPlan.ts`): серверу нечего хранить, пока у
 * человека нет аккаунта. Ответы и отметки переезжают в аккаунт одной кнопкой —
 * клиент вызывает `PUT /api/home-profile` с `complete: true`, затем
 * `POST /api/home-profile/plan`, и набор создаётся заново по тем же ответам
 * (генератор детерминирован, поэтому это тот же самый набор).
 *
 * Ответ намеренно содержит `dayOfWeek`/`dayOfMonth`/`intervalCount`: по ним
 * клиент строит файл календаря, не забирая план второй раз.
 */
router.post('/preview', async (req: Request, res: Response) => {
  const parsed = parseAnswers(req.body);

  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  // Пустой запрос — это не «дом по умолчанию», а забытые ответы: молча отдать
  // план типовой квартиры значило бы показать не то, что человек выбрал.
  if (parsed.provided === 0) {
    res.status(400).json({ error: 'Пришлите хотя бы один ответ анкеты' });
    return;
  }

  try {
    const answers: HomeAnswers = { ...DEFAULT_HOME_ANSWERS, ...parsed.answers };
    const set = buildDefaultTasks(answers);
    const locale = resolveContentLocale(req);

    res.json({
      answers,
      plan: {
        tasks: set.tasks.map((task) => ({
          title: localCatalogTitle(task.title, locale),
          room: localZoneTitle(task.room, locale),
          minutes: task.minutes,
          level: task.level,
          cadence: task.cadence,
          /** Опора для календаря: день недели (0 — воскресенье) или число месяца. */
          dayOfWeek: task.dayOfWeek,
          dayOfMonth: task.dayOfMonth,
          intervalCount: task.intervalCount,
        })),
        /**
         * Подписи периодичностей — с сервера: словарь уже есть в каталоге, а
         * дублировать полтора десятка строк в двух файлах i18n незачем.
         */
        cadences: [...new Set(set.tasks.map((task) => task.cadence))].reduce<
          Record<string, string>
        >((labels, cadence) => {
          labels[cadence] = localCadenceTitle(cadence, locale);
          return labels;
        }, {}),
        summary: {
          totalTasks: set.summary.totalTasks,
          totalMinutes: set.summary.totalMinutes,
          weeklyTasks: set.summary.weeklyTasks,
          monthlyTasks: set.summary.monthlyTasks,
          maxDailyMinutes: set.summary.maxDailyMinutes,
          dailyLimit: set.summary.dailyLimit,
          rooms: set.summary.rooms.map((room) => localZoneTitle(room, locale)),
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to preview home plan' });
  }
});

/**
 * POST /api/home-profile/plan — собрать набор по сохранённым ответам.
 *
 * Недельного плана здесь больше нет: прежний «План по дому» переносится в «Мои
 * задачи» (services/mergePlanIntoTasks.ts), а сам набор достраивается
 * (недостающие дела добавляются, устаревшие незакрытые — убираются), поэтому
 * кнопку «пересобрать» можно нажимать сколько угодно раз: дублей не будет. В
 * ответе `plan` описывает именно набор — дни, задачи с id, уровень, фокусную зону
 * и сводку, — чтобы финальный экран мастера «План готов» не был пустым.
 */
router.post('/plan', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = String(req.userId);
    const row = await loadProfile(userId);

    if (!row) {
      res.status(400).json({ error: 'Сначала заполните анкету о доме' });
      return;
    }

    const answers = toAnswers(row);
    const defaultSet = buildDefaultTasks(answers);

    // Сначала перенос прежнего плана, потом пересборка набора: перенесённые
    // названия уже стоят в расписании, и syncDefaultTasks видит их как существующие.
    const merged = await mergePlanIntoTasks(userId);
    const myTasks = await syncDefaultTasks(userId, defaultSet, { removeStale: true });

    await relocalizeGeneratedContent(userId, resolveContentLocale(req));

    res.json(await toPlanResponse({ answers, defaultSet, myTasks, merged, locale: resolveContentLocale(req) }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate home plan' });
  }
});

/**
 * GET /api/home-profile/plan — посмотреть набор по сохранённым ответам.
 *
 * Ничего не перезаписывает: недостающие дела набора только достраиваются (без
 * `removeStale`), а прежний «План по дому» переносится в «Мои задачи», если
 * человек завёл анкету до отказа от недельного плана. Так «первое обращение к
 * плану» тоже даёт готовый список дел, но правки пользователя не затирает.
 */
router.get('/plan', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = String(req.userId);
    const row = await loadProfile(userId);

    if (!row) {
      res.status(400).json({ error: 'Сначала заполните анкету о доме' });
      return;
    }

    const answers = toAnswers(row);
    const defaultSet = buildDefaultTasks(answers);
    const merged = await mergePlanIntoTasks(userId);
    const myTasks = await syncDefaultTasks(userId, defaultSet, { removeStale: false });

    res.json(await toPlanResponse({ answers, defaultSet, myTasks, merged, locale: resolveContentLocale(req) }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch home plan' });
  }
});

/**
 * DELETE /api/home-profile — сбросить анкету, прежний план и память об отказах.
 *
 * Отказы чистятся намеренно: человек начинает настройку заново, и удалённые
 * когда-то сгенерированные задачи снова могут быть предложены. Держать их в
 * списке после сброса — значит навсегда оставить набор неполным.
 */
router.delete('/', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  const userId = String(req.userId);

  try {
    await client.query('BEGIN');

    const deletedSchedule = await client.query<{ id: number }>(
      `DELETE FROM schedules WHERE user_id = $1 AND title = $2 RETURNING id`,
      [userId, PLAN_TITLE]
    );
    const deletedProfile = await client.query(
      'DELETE FROM home_profiles WHERE user_id = $1 RETURNING user_id',
      [userId]
    );
    const deletedDismissed = await client.query(
      'DELETE FROM dismissed_default_tasks WHERE user_id = $1 RETURNING title',
      [userId]
    );

    await client.query('COMMIT');

    res.json({
      profileReset: (deletedProfile.rowCount ?? 0) > 0,
      planDeleted: (deletedSchedule.rowCount ?? 0) > 0,
      // Сколько названий перестало быть «удалёнными»: проверка для интерфейса и тестов.
      dismissedCleared: deletedDismissed.rowCount ?? 0,
      // «Мои задачи» намеренно остаются: это уже рабочий список человека,
      // который он мог дополнить и поправить, — сброс анкеты его не касается.
      profile: null,
      completed: false,
      // Список явных ответов живёт в той же строке, поэтому уходит вместе с ней.
      answeredFields: [],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to reset home profile' });
  } finally {
    client.release();
  }
});

export default router;
