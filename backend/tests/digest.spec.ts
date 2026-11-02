import { beforeEach, describe, expect, it } from 'vitest';
import { digestUnsubscribeToken, digestUnsubscribeUrl, renderDigestHtml } from '../services/digest';

/**
 * Недельное письмо: то, что можно проверить без базы и без SMTP.
 *
 * Планировщик и выборка адресатов проверяются на настоящей базе в общем наборе,
 * а здесь — подпись отписки и сам HTML: ошибка в подписи позволила бы отключить
 * письма чужому человеку, а неэкранированный заголовок задачи — сломать вёрстку
 * письма (название задачи вводит пользователь).
 */

const copy = {
  subject: (count: number) => `План: ${count}`,
  greeting: (name: string) => `Привет${name ? `, ${name}` : ''}!`,
  intro: (date: string, count: number, minutes: number) => `${date}: ${count} дел, ${minutes} минут.`,
  streak: (days: number) => `Серия: ${days}`,
  outro: 'Отметьте сделанное.',
  action: 'Открыть план',
  unsubscribe: 'Отписаться',
  listTitle: 'На завтра',
};

const base = {
  copy,
  lang: 'ru' as const,
  name: 'Аня',
  date: '9 ноября',
  items: [{ title: 'Пыль на полках', room: 'Гостиная', minutes: 8 }],
  minutes: 8,
  streak: 6,
  unsubscribe: 'https://tidyplan.ru/api/digest/unsubscribe?u=1&t=abc',
};

describe('подпись отписки', () => {
  beforeEach(() => {
    process.env.DIGEST_SECRET = 'test-digest-secret';
  });

  it('детерминирована для одного и того же пользователя', () => {
    const first = digestUnsubscribeToken('1');

    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(digestUnsubscribeToken('1')).toBe(first);
  });

  it('различается у разных пользователей', () => {
    expect(digestUnsubscribeToken('1')).not.toBe(digestUnsubscribeToken('2'));
  });

  it('меняется вместе с секретом', () => {
    const before = digestUnsubscribeToken('1');
    process.env.DIGEST_SECRET = 'another-secret';

    expect(digestUnsubscribeToken('1')).not.toBe(before);
  });

  it('попадает в ссылку вместе с id', () => {
    const url = digestUnsubscribeUrl('42');

    expect(url).toContain('/api/digest/unsubscribe');
    expect(url).toContain('u=42');
    expect(url).toContain(`t=${digestUnsubscribeToken('42')}`);
  });
});

describe('html письма', () => {
  it('содержит план, серию и ссылку отписки', () => {
    const html = renderDigestHtml(base);

    expect(html).toContain('Пыль на полках');
    expect(html).toContain('Гостиная');
    expect(html).toContain('Серия: 6');
    expect(html).toContain('Отписаться');
  });

  it('экранирует название задачи, введённое пользователем', () => {
    const html = renderDigestHtml({
      ...base,
      items: [{ title: '<script>alert(1)</script>', room: null, minutes: 0 }],
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('не показывает серию из одного дня', () => {
    const html = renderDigestHtml({ ...base, streak: 1 });

    expect(html).not.toContain('Серия: 1');
  });
});
