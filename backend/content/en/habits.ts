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
  'evening-room-order': {
    title: 'Evening tidy-up in the living room',
    description:
      'Put things back in their places and get one shared room ready for tomorrow.',
  },
  'wipe-kitchen-surfaces': {
    title: 'Wipe the kitchen worktops',
    description:
      'Countertops, hob and cabinet fronts — a quick pass while you cook or right after dinner.',
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
  'declutter-one-shelf': {
    title: 'Declutter one shelf',
    description: 'One shelf a day — that is how cupboards get sorted without a marathon.',
  },
  'mirror-wipe': {
    title: 'Wipe the mirror and the tap',
    description: 'Microfibre and water: a streak-free mirror and tap in two minutes.',
  },
  'take-out-trash': {
    title: 'Take out the rubbish',
    description: 'Wipe the bin inside while you are at it — then no smell builds up.',
  },
  'make-bed': {
    title: 'Make the bed',
    description: 'One move in the morning and the room already looks put together.',
  },
  'switches-handles': {
    title: 'Wipe switches and handles',
    description: 'The most touched spots in the house: a disinfecting wipe every couple of days.',
  },
  'laundry-one-load': {
    title: 'One load of laundry',
    description:
      'Wash in small batches: clothes stop piling up and do not crease in the basket.',
  },

  // ── Семья ──────────────────────────────────────────────────────────────
  'family-15-minutes': {
    title: 'Fifteen minutes of cleaning together',
    description:
      'Set a timer for fifteen minutes and send everyone to their own zone — faster and more fun together.',
  },
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
  'air-bedroom': {
    title: 'Air the bedroom',
    description: 'Five minutes of fresh air before bed improves sleep.',
  },
  'reset-after-work': {
    title: 'Unpack after work',
    description: 'Five minutes for the bag, the coat and the shoes — and the evening is yours.',
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
