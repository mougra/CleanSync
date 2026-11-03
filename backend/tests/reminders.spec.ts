import { describe, expect, it } from 'vitest';
import { buildDigestPayload, buildNudgePayload } from '../services/reminders';

/**
 * Тексты напоминаний о плане.
 *
 * Проверяем то, что видит человек в системном уведомлении: заголовок, строку
 * тела с правильным склонением и ссылку. Склонение — не придирка: «3 дела» и
 * «5 дел» в одном шаблоне выдают машинный текст, а уведомление читают краем глаза.
 */
describe('уведомление «план на неделю»', () => {
  it('считает дела и минуты по-русски', () => {
    const payload = buildDigestPayload('ru', 3, 20, null);

    expect(payload.title).toBe('План на неделю');
    expect(payload.body).toBe('Завтра 3 дела · примерно 20 минут');
    expect(payload.url).toBe('/');
  });

  it('склоняет единицы правильно', () => {
    expect(buildDigestPayload('ru', 1, 1, null).body).toBe('Завтра 1 дело · примерно 1 минута');
    expect(buildDigestPayload('ru', 5, 5, null).body).toBe('Завтра 5 дел · примерно 5 минут');
    expect(buildDigestPayload('ru', 21, 22, null).body).toBe('Завтра 21 дело · примерно 22 минуты');
  });

  it('добавляет серию, только когда она осмысленная', () => {
    expect(buildDigestPayload('ru', 2, 10, 6).body).toContain('серия 6 дней');
    expect(buildDigestPayload('ru', 2, 10, 1).body).not.toContain('серия');
  });

  it('на английском без русских слов', () => {
    const payload = buildDigestPayload('en', 3, 20, null);

    expect(payload.body).toBe('Tomorrow: 3 tasks · about 20 min');
    expect(payload.body).not.toMatch(/[А-Яа-яЁё]/);
  });
});

describe('дневное напоминание', () => {
  it('зовёт начать, а не сообщает факт', () => {
    const payload = buildNudgePayload('ru', 3, 20);

    expect(payload.body).toBe('Сегодня 3 дела на 20 минут — начнём?');
    expect(payload.tag).toBe('plan-nudge');
  });

  it('различает одно дело и несколько', () => {
    expect(buildNudgePayload('ru', 1, 5).body).toContain('1 дело на 5 минут');
    expect(buildNudgePayload('en', 1, 5).body).toContain('1 task in 5 min');
  });
});
