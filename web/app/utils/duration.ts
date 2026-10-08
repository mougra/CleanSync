/** Длительность в минутах: 45 мин, 2 ч 20 мин. */
export function formatMinutes(minutes: number, locale: string): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;

  if (locale === 'ru') {
    if (hours === 0) {
      return `${rest} мин`;
    }
    return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
  }

  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
