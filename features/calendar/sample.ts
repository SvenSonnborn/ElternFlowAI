import { addDays, format, setHours, setMinutes, startOfDay } from "date-fns";

import { lightTheme } from "@/design-system/themes";

import type { CalendarOccurrence } from "./types";

import { eventColorFor, eventIconFor, FALLBACK_TYPE_LABEL } from "./palette";

interface Seed {
  dayOffset: number;
  hour: number;
  minute: number;
  durationMin: number;
  title: string;
  slug: string;
  childId: string | null;
  location?: string;
}

const SAMPLE_SEEDS: Seed[] = [
  {
    dayOffset: 0,
    hour: 8,
    minute: 0,
    durationMin: 60,
    title: "Schule",
    slug: "schule",
    childId: "ben",
  },
  {
    dayOffset: 0,
    hour: 14,
    minute: 0,
    durationMin: 60,
    title: "Kinderarzt Dr. Weber",
    slug: "arzt",
    childId: "mia",
    location: "Praxis Hauptstraße 12",
  },
  {
    dayOffset: 0,
    hour: 16,
    minute: 30,
    durationMin: 75,
    title: "Fußballtraining",
    slug: "sport",
    childId: "ben",
    location: "Sportplatz Süd",
  },
  {
    dayOffset: 0,
    hour: 18,
    minute: 0,
    durationMin: 30,
    title: "Mathe-Hausaufgaben",
    slug: "ha",
    childId: "leo",
  },

  {
    dayOffset: 2,
    hour: 9,
    minute: 0,
    durationMin: 45,
    title: "Vorsorge Mia",
    slug: "arzt",
    childId: "mia",
  },
  {
    dayOffset: 4,
    hour: 17,
    minute: 0,
    durationMin: 60,
    title: "Schwimmkurs",
    slug: "sport",
    childId: "mia",
  },
  {
    dayOffset: 4,
    hour: 19,
    minute: 0,
    durationMin: 30,
    title: "Lesen üben",
    slug: "ha",
    childId: "ben",
  },
  {
    dayOffset: 7,
    hour: 10,
    minute: 0,
    durationMin: 120,
    title: "Geburtstag Oma",
    slug: "family",
    childId: null,
    location: "Bei Oma",
  },
  {
    dayOffset: 10,
    hour: 8,
    minute: 0,
    durationMin: 60,
    title: "Klassenarbeit Englisch",
    slug: "schule",
    childId: "leo",
  },
  {
    dayOffset: 10,
    hour: 16,
    minute: 0,
    durationMin: 60,
    title: "Fußballtraining",
    slug: "sport",
    childId: "ben",
  },
  {
    dayOffset: 10,
    hour: 18,
    minute: 30,
    durationMin: 30,
    title: "Mathe üben",
    slug: "ha",
    childId: "leo",
  },
  {
    dayOffset: 13,
    hour: 19,
    minute: 0,
    durationMin: 60,
    title: "Familien-Abendessen",
    slug: "meal",
    childId: null,
  },
  {
    dayOffset: 17,
    hour: 15,
    minute: 0,
    durationMin: 90,
    title: "Zahnarzt Ben",
    slug: "arzt",
    childId: "ben",
  },
];

function seedToOccurrence(seed: Seed, base: Date): CalendarOccurrence {
  const startAt = setMinutes(
    setHours(startOfDay(addDays(base, seed.dayOffset)), seed.hour),
    seed.minute,
  );
  const endAt = new Date(startAt.getTime() + seed.durationMin * 60_000);
  const label = FALLBACK_TYPE_LABEL[seed.slug] ?? { de: seed.slug, en: seed.slug };
  return {
    eventId: `sample-${seed.slug}-${seed.dayOffset}-${seed.hour}`,
    occurrenceDate: format(startAt, "yyyy-MM-dd"),
    startAt,
    endAt,
    title: seed.title,
    description: null,
    location: seed.location ?? null,
    allDay: false,
    childId: seed.childId,
    isException: false,
    isRecurring: false,
    type: {
      slug: seed.slug,
      color: eventColorFor(seed.slug, "primary", lightTheme),
      iconName: eventIconFor(seed.slug, ""),
      labelDe: label.de,
      labelEn: label.en,
    },
  };
}

export function getSampleOccurrences(now: Date = new Date()): CalendarOccurrence[] {
  return SAMPLE_SEEDS.map((seed) => seedToOccurrence(seed, now));
}

export function findSampleOccurrence(
  id: string,
  now: Date = new Date(),
): CalendarOccurrence | null {
  return getSampleOccurrences(now).find((o) => o.eventId === id) ?? null;
}
