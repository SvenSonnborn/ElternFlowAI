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
