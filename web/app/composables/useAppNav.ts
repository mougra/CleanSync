export interface AppNavItem {
  /** Ключ перевода в секции `nav`. */
  key: 'today' | 'habits' | 'tips' | 'checklists' | 'settings';
  to: string;
  icon: string;
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
  { key: 'settings', to: '/settings', icon: 'pi-cog' },
];
