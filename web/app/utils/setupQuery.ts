const TRUTHY_SETUP_VALUES = new Set(['1', 'true', 'yes']);

/**
 * Пришёл ли запрос на открытие мастера «Настройка по дому».
 *
 * Ссылки ведут на `/settings?setup=1` (единственная форма, которую мы сами
 * создаём), но параметр в адрес может попасть и как `true` — принимаем оба
 * варианта, чтобы ссылка из письма или закладки не оказалась пустой.
 */
export const isSetupRequested = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => isSetupRequested(item));
  }

  if (typeof value === 'string') {
    return TRUTHY_SETUP_VALUES.has(value.trim().toLowerCase());
  }

  return false;
};
