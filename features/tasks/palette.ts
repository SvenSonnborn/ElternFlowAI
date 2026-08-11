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
