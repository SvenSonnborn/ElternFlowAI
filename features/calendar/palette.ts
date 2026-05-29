import { t as i18nT } from "i18next";

import type { IconName } from "@/app-sections/shared";
import type { Theme } from "@/design-system/themes";

import { palette } from "@/design-system";

const SLUG_TO_HEX: Record<string, string> = {
  schule: palette.event.schule,
  arzt: palette.event.arzt,
  sport: palette.event.sport,
  training: palette.event.sport,
  ha: palette.event.ha,
  hausaufgaben: palette.event.ha,
  family: palette.event.family,
  meal: palette.event.meal,
};

const SLUG_TO_ICON: Record<string, IconName> = {
  schule: "school",
  arzt: "doctor",
  sport: "ball",
  training: "ball",
  ha: "book-open",
  hausaufgaben: "book-open",
  family: "users",
  meal: "utensils",
};

const DB_ICON_TO_ICON: Record<string, IconName> = {
  school: "school",
  stethoscope: "doctor",
  activity: "ball",
  users: "users",
  utensils: "utensils",
  "book-open": "book-open",
  calendar: "calendar",
};

export function eventColorFor(slug: string, roleFallback: string, theme: Theme): string {
  const hex = SLUG_TO_HEX[slug];
  if (hex) return hex;
  const themed = (theme as unknown as Record<string, string | undefined>)[roleFallback];
  return themed ?? theme.primary;
}

export function eventIconFor(slug: string, dbIcon: string): IconName {
  return SLUG_TO_ICON[slug] ?? DB_ICON_TO_ICON[dbIcon] ?? "calendar";
}

// Map non-canonical slugs to their cal.legend.* equivalent for label lookup.
// (DB seeds `training` for sport-style events; `hausaufgaben` is task-side,
// listed defensively in case it ever surfaces in event_types.)
const SLUG_LABEL_ALIAS: Record<string, string> = {
  training: "sport",
  hausaufgaben: "ha",
};

/**
 * Resolves user-visible DE/EN labels for an event_types slug via the i18n
 * catalogs (`cal.legend.<slug>`). Falls back to the slug itself when no key
 * matches, preserving the previous "{ de: slug, en: slug }" default.
 */
export function typeLabelsForSlug(slug: string): { de: string; en: string } {
  const aliased = SLUG_LABEL_ALIAS[slug] ?? slug;
  return {
    de: i18nT(`cal.legend.${aliased}`, { lng: "de", defaultValue: slug }),
    en: i18nT(`cal.legend.${aliased}`, { lng: "en", defaultValue: slug }),
  };
}
