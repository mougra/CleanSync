import type { Request } from 'express';

/**
 * Язык контента в API.
 *
 * Интерфейс переводится на клиенте (`@nuxtjs/i18n`), а тексты, которые лежат
 * в базе — названия челленджей, достижений, шаблонов привычек, — приходят из
 * API уже готовыми строками. Значит, сервер должен знать, на каком языке их
 * отдавать, и делать это на каждом запросе: у одного пользователя язык может
 * смениться в любой момент.
 *
 * Порядок источников:
 *  1. `?locale=en` — явный запрос (нужен тестам и отладке);
 *  2. `Accept-Language` — что человек видит прямо сейчас; `useApi` на клиенте
 *     подставляет этот заголовок в каждый запрос;
 *  3. язык из профиля (`users.locale`) — запасной вариант для тех случаев, где
 *     заголовка нет;
 *  4. `ru` — язык по умолчанию.
 *
 * Неизвестный язык не ошибка: его просто нет в списке поддерживаемых, и запрос
 * получает русский текст. Так старый клиент с `Accept-Language: de` продолжает
 * работать, а не получает 400.
 */
export const SUPPORTED_LOCALES = ['ru', 'en'] as const;

export type ContentLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: ContentLocale = 'ru';

export const isContentLocale = (value: unknown): value is ContentLocale =>
  typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);

/**
 * Привести тег языка к поддерживаемому: `en-US` → `en`, `ru-RU` → `ru`.
 *
 * Регистр и подтеги отбрасываем осознанно: у нас нет отдельных переводов для
 * `en-GB` и `en-US`, а браузеры присылают именно полные теги.
 */
export const normalizeLocale = (value: string | null | undefined): ContentLocale | null => {
  if (!value) {
    return null;
  }

  const base = value.trim().toLowerCase().split(/[-_]/)[0] ?? '';

  return isContentLocale(base) ? base : null;
};

/**
 * Разбор `Accept-Language`.
 *
 * Учитываем веса (`q=`): при `en;q=0.4, ru;q=1` человек хочет русский, хотя
 * английский стоит первым. `*` означает «любой язык» — отдаём язык по умолчанию.
 */
export const parseAcceptLanguage = (header: string | string[] | undefined): ContentLocale | null => {
  const raw = Array.isArray(header) ? header.join(',') : header;

  if (!raw) {
    return null;
  }

  const candidates = raw
    .split(',')
    .map((chunk) => {
      const [tag = '', ...params] = chunk.trim().split(';');
      const weight = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='));
      const quality = weight ? Number.parseFloat(weight.slice(2)) : 1;

      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((candidate) => candidate.tag.length > 0)
    .sort((left, right) => right.quality - left.quality);

  for (const candidate of candidates) {
    if (candidate.tag === '*') {
      return DEFAULT_LOCALE;
    }

    const locale = normalizeLocale(candidate.tag);

    if (locale) {
      return locale;
    }
  }

  return null;
};

/** Язык контента для текущего запроса. */
export const resolveContentLocale = (
  req: Request,
  userLocale?: string | null,
): ContentLocale => {
  const explicit = normalizeLocale(typeof req.query.locale === 'string' ? req.query.locale : null);

  if (explicit) {
    return explicit;
  }

  const fromHeader = parseAcceptLanguage(req.headers['accept-language']);

  if (fromHeader) {
    return fromHeader;
  }

  return normalizeLocale(userLocale) ?? DEFAULT_LOCALE;
};
