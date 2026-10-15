/**
 * Тексты push-уведомлений на английском.
 *
 * Push собирается на сервере, где интерфейса нет, поэтому язык берём из профиля
 * (`users.locale`). Русские строки остаются языком по умолчанию и живут рядом с
 * вызовом — их всего несколько.
 */
export const PUSH_EN = {
  habitTitle: 'Time to check off a habit',
  testTitle: 'Notifications are on',
  testBody: 'This is how habit reminders will arrive.',
  nudgeAuthorFallback: 'Someone from your home',
  nudgeTitle: (who: string) => `${who} is reminding you about the cleaning`,
  nudgeBody: 'The shared home plan is waiting: open “Home” and tick off your part.',
} as const;
