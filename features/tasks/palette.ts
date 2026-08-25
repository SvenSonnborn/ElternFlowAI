import type { IconName } from "@/app-sections/shared";
import type { Theme } from "@/design-system/themes";

/**
 * `task_types.color` holds the *name* of a semantic theme role, not a hex
 * value — the migration seeds `accent`, `primary` and `primarySoft`. Same
 * mechanism as `eventColorFor` in features/calendar/palette.ts, minus the
 * slug-to-hex table: there is no task-specific palette.
 *
 * Anything that does not resolve to a *string* falls back to `primary`. That
 * single check is enough to keep inherited members out: `theme.toString` is a
 * function, not a string, and `Object.prototype` carries no string-valued
 * members at all.
 */
export function taskTypeColorFor(colorRole: string | null | undefined, theme: Theme): string {
  if (!colorRole) return theme.primary;
  const value = (theme as unknown as Record<string, unknown>)[colorRole];
  return typeof value === "string" ? value : theme.primary;
}

/**
 * The catalog key for a task type's label. `task_types.label` is jsonb seeded
 * with German only (`20260529091455_type_lookups.sql`), so a label read from
 * there would show up in German inside the English UI — the catalogs own this
 * copy, exactly as `typeLabelsForSlug` does for the calendar.
 *
 * Hyphenated slugs become camelCase so the key path stays a plain identifier.
 */
export function taskTypeLabelKey(slug: string): string {
  const camel = slug.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return `hw.type.${camel}`;
}

// `Map` statt Objekt-Literal, aus demselben Grund, aus dem `taskTypeColorFor`
// oben auf `typeof value === "string"` prüft: `task_types.slug` ist bei
// familieneigenen Typen frei wählbar, und ein Objekt-Literal hätte für
// `"toString"` seinen geerbten Member herausgegeben — eine Funktion, wo die
// Zeile einen Icon-Namen erwartet.
const SLUG_TO_ICON = new Map<string, IconName>([
  ["hausaufgaben", "book-open"],
  ["besorgung", "shopping-cart"],
  ["eltern-aufgabe", "check-square"],
]);

const DB_ICON_TO_ICON = new Map<string, IconName>([
  ["book-open", "book-open"],
  ["shopping-bag", "shopping-cart"],
  ["shopping-cart", "shopping-cart"],
  ["check-square", "check-square"],
  ["check", "check"],
  ["calendar", "calendar"],
]);

/**
 * The icon a task's type renders with.
 *
 * `task_types.icon` seeds Lucide-style names, and one of the three — the
 * `shopping-bag` behind `besorgung` — has no entry in the app's icon map,
 * which carries `shopping-cart` instead. `Icon` renders nothing at all for a
 * name it does not know, so the translation has to happen before it.
 *
 * Same two-step shape as `eventIconFor` in features/calendar/palette.ts: the
 * canonical slugs decide first, a family-owned slug falls through to whatever
 * its row names, and anything left over gets the neutral checkbox.
 */
export function taskIconFor(slug: string, dbIcon: string): IconName {
  return SLUG_TO_ICON.get(slug) ?? DB_ICON_TO_ICON.get(dbIcon) ?? "check-square";
}
