/**
 * Письма на английском.
 *
 * Письмо — единственное место, где язык пользователя нельзя взять из cookie:
 * его читают в почтовом клиенте, а не в браузере. Поэтому язык берём из профиля
 * (`users.locale`), а если он там ещё не проставлен — из заголовка запроса.
 *
 * Ключи названы по назначению письма: три письма (сброс пароля, подтверждение
 * почты и уведомление о смене пароля) — единственные, что уходят пользователю.
 */
export const EMAIL_EN = {
  reset: {
    subject: 'Reset your TidyPlan password',
    title: 'Reset password',
    body: 'You asked to reset the password for your account. Use the button below to set a new one.',
    action: 'Set a new password',
  },
  confirm: {
    subject: 'Confirm your email for TidyPlan',
    title: 'Email confirmation',
    body: 'Welcome to TidyPlan! To start using the app, please confirm your email address.',
    action: 'Confirm email',
  },
  changed: {
    subject: 'Your TidyPlan password was changed',
    title: 'Password changed',
    body: 'The password for your TidyPlan account was just changed. If it was not you, restore access to your account and write to us.',
    action: 'Sign in to TidyPlan',
  },
  /** Подвал письма: подпись и подсказка про ответ на письмо. */
  footer: 'Helping keep homes clean.',
  replyNote: 'You can reply to this email — it reaches our support.',
  fallbackNote: 'If the button does not work, copy this link:',
} as const;
