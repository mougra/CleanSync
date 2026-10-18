export interface AppNavItem {
  /** Ключ перевода в секции `nav`. */
  key: 'today' | 'habits' | 'tips' | 'checklists' | 'stats' | 'settings';
  to: string;
  icon: string;
  /**
   * Пункт только для бокового меню. Нижняя навигация в макетах — ровно пять
   * пунктов, поэтому статистика живёт в боковом меню и на главной.
   */
  sidebarOnly?: boolean;
}

/**
 * Пункты основной навигации — из макетов главной
 * (docs/design/mockups/main page 1.jpg): Сегодня, Привычки, Советы, Чек-листы, Настройки.
 */
export const appNavItems: AppNavItem[] = [
  { key: 'today', to: '/', icon: 'pi-calendar' },
  { key: 'habits', to: '/habits', icon: 'pi-refresh' },
  { key: 'tips', to: '/tips', icon: 'pi-book' },
  { key: 'checklists', to: '/checklists', icon: 'pi-list-check' },
  { key: 'stats', to: '/analytics', icon: 'pi-chart-bar', sidebarOnly: true },
  { key: 'settings', to: '/settings', icon: 'pi-cog' },
];

/** Пункты для нижней навигации: без тех, что только в боковом меню. */
export const bottomNavItems = appNavItems.filter((item) => !item.sidebarOnly);

/**
 * Адрес без языкового префикса.
 *
 * Английская версия живёт под `/en`, поэтому «свой» раздел надо сравнивать
 * с путём без префикса: иначе на `/en/habits` активным не считался бы ни один
 * пункт меню. Русский — язык по умолчанию, префикса у него нет.
 */
export const appPath = (path: string): string => path.replace(/^\/en(?=\/|$)/, '') || '/';
