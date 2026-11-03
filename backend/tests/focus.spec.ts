import { describe, expect, it } from 'vitest';
import { activeSeconds, type FocusRow } from '../services/focus';

/**
 * Арифметика таймера.
 *
 * Проверяем без базы: важно, чтобы «идёт 12 минут» не считало паузы работой, а
 * завершённая сессия не тянулась дальше своего конца.
 */
const row = (patch: Partial<FocusRow> = {}): FocusRow => ({
  id: 1,
  task_id: null,
  title: null,
  room: null,
  started_at: '2026-11-03T10:00:00.000Z',
  last_resumed_at: '2026-11-03T10:00:00.000Z',
  paused_seconds: 0,
  ended_at: null,
  status: 'running',
  ...patch,
});

describe('секунды таймера', () => {
  it('считает от старта до «сейчас» у идущей сессии', () => {
    const now = new Date('2026-11-03T10:05:00.000Z').getTime();

    expect(activeSeconds(row(), now)).toBe(300);
  });

  it('вычитает паузы', () => {
    const now = new Date('2026-11-03T10:10:00.000Z').getTime();

    expect(activeSeconds(row({ paused_seconds: 120 }), now)).toBe(480);
  });

  it('у завершённой сессии время не растёт', () => {
    const finished = row({
      ended_at: '2026-11-03T10:07:30.000Z',
      status: 'finished',
    });

    // «Сейчас» сильно позже конца — ответ всё равно 450 секунд.
    expect(activeSeconds(finished, new Date('2026-11-04T10:00:00.000Z').getTime())).toBe(450);
  });

  it('не уходит в минус, если пауз больше, чем прошло времени', () => {
    const now = new Date('2026-11-03T10:01:00.000Z').getTime();

    expect(activeSeconds(row({ paused_seconds: 600 }), now)).toBe(0);
  });
});
