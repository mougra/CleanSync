import { describe, expect, it } from 'vitest';
import { isSeason, seasonForDate, seasonTitle } from '../services/seasons';

/**
 * Сезон — это ключ, по которому главная выбирает челлендж
 * (`GET /api/challenges/current`), поэтому границы месяцев проверяем явно:
 * ошибка здесь показала бы пользователю прошлогодний челлендж.
 */
describe('Сезон по дате', () => {
  it('весна — март, апрель, май', () => {
    for (const month of [2, 3, 4]) {
      expect(seasonForDate(new Date(2026, month, 15))).toBe('spring');
    }
  });

  it('лето — июнь, июль, август', () => {
    for (const month of [5, 6, 7]) {
      expect(seasonForDate(new Date(2026, month, 15))).toBe('summer');
    }
  });

  it('осень — сентябрь, октябрь, ноябрь', () => {
    for (const month of [8, 9, 10]) {
      expect(seasonForDate(new Date(2026, month, 15))).toBe('autumn');
    }
  });

  it('зима — декабрь, январь, февраль', () => {
    expect(seasonForDate(new Date(2026, 11, 1))).toBe('winter');
    expect(seasonForDate(new Date(2026, 0, 1))).toBe('winter');
    expect(seasonForDate(new Date(2026, 1, 28))).toBe('winter');
  });

  it('первое и последнее число месяца не съезжают в соседний сезон', () => {
    expect(seasonForDate(new Date(2026, 2, 1))).toBe('spring');
    expect(seasonForDate(new Date(2026, 4, 31))).toBe('spring');
    expect(seasonForDate(new Date(2026, 5, 1))).toBe('summer');
    expect(seasonForDate(new Date(2026, 7, 31))).toBe('summer');
    expect(seasonForDate(new Date(2026, 8, 1))).toBe('autumn');
    expect(seasonForDate(new Date(2026, 10, 30))).toBe('autumn');
    expect(seasonForDate(new Date(2026, 11, 1))).toBe('winter');
  });

  it('без аргумента считает от текущей даты', () => {
    expect(seasonForDate()).toBe(seasonForDate(new Date()));
  });
});

describe('Разбор значения сезона', () => {
  it('принимает только четыре известных сезона', () => {
    expect(isSeason('spring')).toBe(true);
    expect(isSeason('summer')).toBe(true);
    expect(isSeason('autumn')).toBe(true);
    expect(isSeason('winter')).toBe(true);
  });

  it('отклоняет мусор: значение приходит из колонки VARCHAR и из запроса', () => {
    expect(isSeason('Spring')).toBe(false);
    expect(isSeason('fall')).toBe(false);
    expect(isSeason('')).toBe(false);
    expect(isSeason(null)).toBe(false);
    expect(isSeason(undefined)).toBe(false);
    expect(isSeason(4)).toBe(false);
  });

  it('названия сезонов на русском — для сообщений об ошибках', () => {
    expect(seasonTitle('spring')).toBe('весна');
    expect(seasonTitle('summer')).toBe('лето');
    expect(seasonTitle('autumn')).toBe('осень');
    expect(seasonTitle('winter')).toBe('зима');
  });
});
