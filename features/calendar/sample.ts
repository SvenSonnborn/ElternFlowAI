/**
 * Sample calendar seeds — kept for Smoke-Test / Storybook-style verification only.
 * The app no longer imports this in production paths; AuthGate guarantees a real
 * Supabase session before any calendar screen mounts.
 *
 * Titles and locations are catalog keys under `sample.*`, resolved through the
 * `translate` the caller passes in, so the seeds render in the active language
 * instead of freezing German literals into a fixture. The `type` labels are the
 * exception: `typeLabelsForSlug` has to produce DE *and* EN at once for
 * `CalendarOccurrence`, which a single-language `t` cannot do, so it keeps
 * reading the global catalogs.
 */
import { addDays, format, setHours, setMinutes, startOfDay } from "date-fns";

import type { Translate } from "@/features/shared";

import { lightTheme } from "@/design-system/themes";

import type { CalendarOccurrence } from "./types";

import { eventColorFor, eventIconFor, typeLabelsForSlug } from "./palette";

interface Seed {
  dayOffset: number;
  hour: number;
  minute: number;
  durationMin: number;
  /** Key under `sample.event.*`. */
  titleKey: string;
  /** Interpolation values for `titleKey` — proper names stay literals. */
  titleParams?: Record<string, string>;
  slug: string;
  childId: string | null;
  /** Key under `sample.location.*`. */
  locationKey?: string;
}

const SAMPLE_SEEDS: Seed[] = [
  {
    dayOffset: 0,
    hour: 8,
    minute: 0,
    durationMin: 60,
    titleKey: "school",
    slug: "schule",
    childId: "ben",
  },
  {
    dayOffset: 0,
    hour: 14,
    minute: 0,
    durationMin: 60,
    titleKey: "pediatrician",
    slug: "arzt",
    childId: "mia",
    locationKey: "practice",
  },
  {
    dayOffset: 0,
    hour: 16,
    minute: 30,
    durationMin: 75,
    titleKey: "football",
    slug: "sport",
    childId: "ben",
    locationKey: "sportsField",
  },
  {
    dayOffset: 0,
    hour: 18,
    minute: 0,
    durationMin: 30,
    titleKey: "mathHomework",
    slug: "ha",
    childId: "leo",
  },

  {
    dayOffset: 2,
    hour: 9,
    minute: 0,
    durationMin: 45,
    titleKey: "checkup",
    titleParams: { name: "Mia" },
    slug: "arzt",
    childId: "mia",
  },
  {
    dayOffset: 4,
    hour: 17,
    minute: 0,
    durationMin: 60,
    titleKey: "swimming",
    slug: "sport",
    childId: "mia",
  },
  {
    dayOffset: 4,
    hour: 19,
    minute: 0,
    durationMin: 30,
    titleKey: "reading",
    slug: "ha",
    childId: "ben",
  },
  {
    dayOffset: 7,
    hour: 10,
    minute: 0,
    durationMin: 120,
    titleKey: "grandmaBirthday",
    slug: "family",
    childId: null,
    locationKey: "grandma",
  },
  {
    dayOffset: 10,
    hour: 8,
    minute: 0,
    durationMin: 60,
    titleKey: "englishTest",
    slug: "schule",
    childId: "leo",
  },
  {
    dayOffset: 10,
    hour: 16,
    minute: 0,
    durationMin: 60,
    titleKey: "football",
    slug: "sport",
    childId: "ben",
  },
  {
    dayOffset: 10,
    hour: 18,
    minute: 30,
    durationMin: 30,
    titleKey: "mathPractice",
    slug: "ha",
    childId: "leo",
  },
  {
    dayOffset: 13,
    hour: 19,
    minute: 0,
    durationMin: 60,
    titleKey: "familyDinner",
    slug: "meal",
    childId: null,
  },
  {
    dayOffset: 17,
    hour: 15,
    minute: 0,
    durationMin: 90,
    titleKey: "dentist",
    titleParams: { name: "Ben" },
    slug: "arzt",
    childId: "ben",
  },
];

/**
 * Expands one seed into a full occurrence relative to `base`. Everything the UI
 * keys on — id, dates, slug — is derived from the schedule; only `title` and
 * `location` go through `translate`. That split is what keeps a language switch
 * from renaming an event out from under a route that already points at it.
 */
function seedToOccurrence(seed: Seed, base: Date, translate: Translate): CalendarOccurrence {
  const startAt = setMinutes(
    setHours(startOfDay(addDays(base, seed.dayOffset)), seed.hour),
    seed.minute,
  );
  const endAt = new Date(startAt.getTime() + seed.durationMin * 60_000);
  const label = typeLabelsForSlug(seed.slug);
  return {
    // Built from the schedule, never the copy — ids stay stable across a
    // language switch, so a detail route opened in DE still resolves in EN.
    eventId: `sample-${seed.slug}-${seed.dayOffset}-${seed.hour}`,
    occurrenceDate: format(startAt, "yyyy-MM-dd"),
    startAt,
    endAt,
    title: translate(`sample.event.${seed.titleKey}`, seed.titleParams),
    description: null,
    location: seed.locationKey ? translate(`sample.location.${seed.locationKey}`) : null,
    allDay: false,
    childId: seed.childId,
    parentId: null,
    isException: false,
    isRecurring: false,
    rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
    type: {
      slug: seed.slug,
      color: eventColorFor(seed.slug, "primary", lightTheme),
      iconName: eventIconFor(seed.slug, ""),
      labelDe: label.de,
      labelEn: label.en,
    },
  };
}

/**
 * All 13 sample occurrences, dated relative to `now` so the fixture always
 * spans "today plus the next two and a half weeks" instead of drifting into the
 * past. `translate` is required rather than defaulting to i18next's global `t` —
 * see the module docblock for why that global is unsafe here.
 */
export function getSampleOccurrences(
  translate: Translate,
  now: Date = new Date(),
): CalendarOccurrence[] {
  return SAMPLE_SEEDS.map((seed) => seedToOccurrence(seed, now, translate));
}

/**
 * Looks up a single sample occurrence by `eventId`, or `null` if nothing
 * matches. Ids are language-independent, so an id captured in German still
 * resolves against an English `translate`.
 */
export function findSampleOccurrence(
  id: string,
  translate: Translate,
  now: Date = new Date(),
): CalendarOccurrence | null {
  return getSampleOccurrences(translate, now).find((o) => o.eventId === id) ?? null;
}
