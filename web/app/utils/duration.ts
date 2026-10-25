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

/**
 * Длительность для крупных сумм: минуты, часы, а с суток и больше — дни.
 *
 * Зачем отдельно от `formatMinutes`. «2 530 минут» на странице плана — это число,
 * которое человек не переводит в голове ни во что осмысленное; «1 д 18 ч» он
 * понимает сразу. Порог в сутки выбран потому, что меньше суток «день» звучит
 * нелепо («0 д 5 ч»), а больше — часы уже нечитаемы.
 *
 * Минуты показываем только до суток: в «1 д 18 ч 10 мин» хвост из минут — шум,
 * а в «2 ч 20 мин» — полезная точность.
 */
export function formatDuration(minutes: number, locale: string): string {
  const safe = Math.max(0, Math.round(minutes));
  const days = Math.floor(safe / (60 * 24));
  const hours = Math.floor((safe % (60 * 24)) / 60);

  if (locale === 'ru') {
    if (days > 0) {
      return hours === 0 ? `${days} д` : `${days} д ${hours} ч`;
    }

    return formatMinutes(safe, locale);
  }

  if (days > 0) {
    return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
  }

  return formatMinutes(safe, locale);
}

/**
 * Время в формате часов: `00:05:00`.
 *
 * В статистике показываем именно так, как в макете: минуты и секунды видно
 * даже у коротких задач, иначе «5 мин» теряется среди крупных чисел.
 */
export function formatClock(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;

  return [hours, rest, 0].map((part) => String(part).padStart(2, '0')).join(':');
}

/** Сокращённая запись для строки истории: `~5:00`. */
export function formatClockShort(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = String(safe % 60).padStart(2, '0');

  return hours > 0 ? `~${hours}:${rest}:00` : `~${safe}:00`;
}
