/**
 * Каталог задач в том виде, в котором его отдаёт `/api/catalog/zones`.
 *
 * Типы повторяют ответ маршрута (`backend/routes/catalog.ts`), а не импортируют
 * серверные: у web и backend нет общего пакета (правило 5), и дублировать
 * интерфейс дешевле, чем тащить зависимость.
 */

export type TaskLevel = 'light' | 'normal' | 'deep';

/** Периодичность из каталога: та же шкала, что у «Моих задач». */
export type TaskCadence =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'threeWeeks'
  | 'sixWeeks'
  | 'monthly'
  | 'twoMonths'
  | 'quarterly'
  | 'fourMonths'
  | 'semiannual'
  | 'yearly'
  | 'twoYears'
  | 'threeYears'
  | 'fourYears'
  | 'fiveYears';

export interface ZoneSummary {
  slug: string;
  title: string;
  tasks: number;
  minutes: number;
}

export interface ZoneTask {
  title: string;
  minutes: number;
  level: TaskLevel;
  cadence: TaskCadence;
}

export interface ZoneCadenceGroup {
  cadence: TaskCadence;
  title: string;
  minutes: number;
  tasks: ZoneTask[];
}

export interface ZonePage extends ZoneSummary {
  groups: ZoneCadenceGroup[];
}

export interface ZonesResponse {
  zones: ZoneSummary[];
}
