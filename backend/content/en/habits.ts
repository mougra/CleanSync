import { extraKeys, missingKeys } from '../../services/translations';

/**
 * Шаблоны привычек на английском.
 *
 * Ключ — `slug` из сида (`backend/seed-habits.ts`): он не меняется, когда
 * правится формулировка, и по нему шаблон ищется в базе. Зона берётся словарём
 * (`content/en/zones.ts`), а не переводится здесь: одна и та же зона встречается
 * и в челленджах, и в каталоге задач.
 */
export const HABIT_TEMPLATE_EN: Record<string, { title: string; description: string }> = {
  // ── Дом ────────────────────────────────────────────────────────────────
  'five-minutes-kitchen': {
    title: 'Five minutes to tidy the kitchen',
    description:
      'Put away what is out of place, clear the sink and wipe the crumbs. Stop after five minutes.',
  },
  'clear-hallway': {
    title: 'Clear the hallway',
    description:
      'Pair up everyday shoes, hang up outerwear and open up the walkway.',
  },
  'sink-shine': {
    title: 'Rinse and dry the sink',
    description: 'Rinse it and wipe it dry: a dry sink looks clean all day.',
  },
  'vacuum-living-room': {
    title: 'Vacuum or sweep the floor',
    description:
      'One room at a time: ten minutes with the vacuum and the floor looks cared for again.',
  },
  'take-out-trash': {
    title: 'Take out the rubbish',
    description: 'Wipe the bin inside while you are at it — then no smell builds up.',
  },
  'make-bed': {
    title: 'Make the bed',
    description: 'One move in the morning and the room already looks put together.',
  },
  'laundry-one-load': {
    title: 'One load of laundry',
    description:
      'Wash in small batches: clothes stop piling up and do not crease in the basket.',
  },

  // ── Семья ──────────────────────────────────────────────────────────────
  'tidy-toys': {
    title: 'Put the toys back in place',
    description:
      'Boxes by category and the “one story at a time” rule make tidying easier.',
  },
  'dishes-after-dinner': {
    title: 'Wash up after dinner',
    description: 'An empty sink in the evening means a calm morning without a pile of dishes.',
  },
  'clothes-for-tomorrow': {
    title: 'Get tomorrow’s clothes ready',
    description: 'Iron and hang them — no morning hunt for socks.',
  },
  'family-weekly-reset': {
    title: 'Weekend family reset',
    description: 'Half an hour on the shared areas: put away, wipe, air out.',
  },

  // ── Забота о себе ──────────────────────────────────────────────────────
  'ten-minutes-quiet': {
    title: 'Ten minutes of quiet',
    description: 'No phone, no chores: tea, a window, breathing. That is part of order too.',
  },
  'evening-shutdown': {
    title: 'Evening shutdown',
    description:
      'Turn off the extra lights, close the laptop, take the mug away — the home rests together with you.',
  },

  // ── Питомцы ────────────────────────────────────────────────────────────
  'pet-bowls': {
    title: 'Wash the pet bowls',
    description: 'Warm water, no soap: fresh bowls mean fewer digestion problems.',
  },
  'pet-hair-sofa': {
    title: 'Remove pet hair from the sofa',
    description: 'A roller or a damp mitt — one minute, and guests will never guess.',
  },
  'pet-litter': {
    title: 'Check the litter tray',
    description: 'Scoop right away and wash it fully once a week — then there is no smell.',
  },
  'pet-brush': {
    title: 'Brush your pet',
    description: 'Less hair around the house and a calmer animal.',
  },

  // ── Растения ───────────────────────────────────────────────────────────
  'water-plants': {
    title: 'Water the plants',
    description: 'Check the soil with your finger: water only when the top layer is dry.',
  },
  'wipe-leaves': {
    title: 'Wipe the leaves',
    description: 'A damp cloth brings back a rich colour.',
  },
  'mist-plants': {
    title: 'Mist the plants',
    description: 'Especially in winter, when the heating dries the air out.',
  },

  // ── Планирование ───────────────────────────────────────────────────────
  'sum-up-day': {
    title: 'Wrap up the day',
    description: 'Tick off what is done and move the unfinished things to a day that fits.',
  },
  'week-ahead': {
    title: 'Look at the week ahead',
    description: 'Check the coming plans and decide when the home chores fit best.',
  },
  'clear-reminders': {
    title: 'Clear new reminders',
    description: 'Go through saved notes and messages: keep, schedule or delete.',
  },
  'plan-menu': {
    title: 'Plan the weekly menu',
    description: 'A list of meals and groceries saves both time and money.',
  },
  'check-tomorrow': {
    title: 'Check tomorrow’s calendar',
    description: 'Two minutes in the evening and the morning starts without surprises.',
  },

  // ── Здоровье ───────────────────────────────────────────────────────────
  'morning-workout': {
    title: 'Ten-minute morning workout',
    description: 'Simple moves with no equipment: wake up and switch the body on. Follow a video or go from memory.',
  },
  stretching: {
    title: 'Five minutes of stretching',
    description: 'Bends, shoulders, back — release the tension of a desk day.',
  },
  'walk-20': {
    title: 'A twenty-minute walk',
    description: 'Fresh air and steps without a goal: the head clears better than behind a screen.',
  },
  'steps-8000': {
    title: '8,000 steps',
    description: 'Not a workout but movement through the day: stairs, a shop, a walk.',
  },
  'water-6-8': {
    title: '6–8 glasses of water',
    description: 'A glass of water next to your desk — and the norm happens unnoticed.',
  },
  'sleep-before-23': {
    title: 'Lights out before 11 pm',
    description: 'Go to bed at the same time: mornings stop being a fight with the alarm.',
  },
  'healthy-breakfast': {
    title: 'A healthy breakfast',
    description: 'Do not skip the morning: eggs, porridge or cottage cheese instead of biscuits on the go.',
  },
  'hobby-15': {
    title: '15 minutes for a hobby',
    description: 'Drawing, music, models — time that belongs only to you.',
  },

  // ── Развитие ───────────────────────────────────────────────────────────
  'read-10': {
    title: 'Ten minutes of reading',
    description: 'A page or two a day instead of the feed: the book that has been waiting.',
  },
  'language-10': {
    title: 'Ten minutes of a foreign language',
    description: 'One exercise in an app or ten new words — a small step every day.',
  },
  'learn-15': {
    title: '15 minutes of learning',
    description: 'A short course lesson or a professional article: no marathon, no burnout.',
  },
  'journal-gratitude': {
    title: 'Journal and gratitude',
    description: 'Three lines about what went well: a simple way to notice the day.',
  },

  // ── Забота о себе ──────────────────────────────────────────────────────
  'breathe-5': {
    title: 'Five minutes of breathing or meditation',
    description: 'A slow breath in and out without the phone: a pause that makes thinking easier.',
  },
  'no-phone-before-sleep': {
    title: 'An hour without the phone before bed',
    description: 'Screen on the charger, a book or a shower: sleep comes faster.',
  },
  skincare: {
    title: 'Skincare',
    description: 'Wash and moisturise — two minutes that bring back the feeling of being okay.',
  },
};

/** Проверка полноты перевода: используется сидом перед записью в базу. */
export const validateHabitTranslations = (slugs: readonly string[]): string[] => {
  const problems: string[] = [];

  for (const slug of missingKeys(slugs, HABIT_TEMPLATE_EN)) {
    problems.push(`нет английского перевода привычки «${slug}»`);
  }

  for (const slug of extraKeys(slugs, HABIT_TEMPLATE_EN)) {
    problems.push(`английский перевод привычки «${slug}» остался без оригинала`);
  }

  return problems;
};
