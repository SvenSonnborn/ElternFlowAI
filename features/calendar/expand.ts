import { format } from "date-fns";

import type { Theme } from "@/design-system/themes";
import type { Database, Json } from "@/features/supabase/database.types";

import type { CalendarOccurrence } from "./types";

import { eventColorFor, eventIconFor, typeLabelsForSlug } from "./palette";
import { buildRule } from "./rrule";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];
type EventExceptionRow = Database["public"]["Tables"]["event_exceptions"]["Row"];

export type EventWithRelations = EventRow & {
  event_types: EventTypeRow | null;
  event_exceptions: EventExceptionRow[] | null;
};

function isJsonObject(j: Json | null | undefined): j is { [k: string]: Json | undefined } {
  return typeof j === "object" && j !== null && !Array.isArray(j);
}

function readLabel(slug: string, label: Json | null | undefined): { de: string; en: string } {
  const fallback = typeLabelsForSlug(slug);
  if (!isJsonObject(label)) return fallback;
  const de = label.de;
  const en = label.en;
  return {
    de: typeof de === "string" ? de : fallback.de,
    en: typeof en === "string" ? en : fallback.en,
  };
}

/**
 * Occurrence starts inside the window — widened backwards by the event's own
 * duration, because a span that began before `rangeStart` still paints days
 * inside it. Nothing is guessed: shifting by exactly the duration is the
 * smallest window that cannot miss an intersecting occurrence.
 */
function expandRecurrence(
  row: EventRow,
  rangeStart: Date,
  rangeEnd: Date,
  durationMs: number,
): Date[] {
  const searchStart = new Date(rangeStart.getTime() - Math.max(0, durationMs));
  const rule = buildRule(row);
  if (!rule) {
    const start = new Date(row.start_at);
    return start >= searchStart && start <= rangeEnd ? [start] : [];
  }
  return rule.between(searchStart, rangeEnd, true);
}

interface Resolved {
  title: string;
  location: string | null;
  startAt: Date;
  endAt: Date;
}

function applyOverride(base: Resolved, override: Json | null): Resolved {
  if (!isJsonObject(override)) return base;
  const next: Resolved = { ...base };
  if (typeof override.title === "string") next.title = override.title;
  if (typeof override.location === "string") next.location = override.location;
  else if (override.location === null) next.location = null;
  if (typeof override.start_at === "string") next.startAt = new Date(override.start_at);
  if (typeof override.end_at === "string") next.endAt = new Date(override.end_at);
  return next;
}

export function expandEvents(
  rows: EventWithRelations[],
  rangeStart: Date,
  rangeEnd: Date,
  theme: Theme,
): CalendarOccurrence[] {
  const out: CalendarOccurrence[] = [];
  for (const row of rows) {
    const masterStart = new Date(row.start_at);
    const masterEnd = new Date(row.end_at);
    const durationMs = masterEnd.getTime() - masterStart.getTime();

    const occurrences = expandRecurrence(row, rangeStart, rangeEnd, durationMs);
    if (!occurrences.length) continue;

    const typeRow = row.event_types;
    const slug = typeRow?.slug ?? "family";
    const labels = readLabel(slug, typeRow?.label ?? null);
    const color = eventColorFor(slug, typeRow?.color ?? "primary", theme);
    const iconName = eventIconFor(slug, typeRow?.icon ?? "");

    const exceptions = new Map((row.event_exceptions ?? []).map((ex) => [ex.occurrence_date, ex]));
    const rrule = {
      freq: row.rrule_freq,
      interval: row.rrule_interval,
      byweekday: row.rrule_byweekday,
      count: row.rrule_count,
      until: row.rrule_until,
    };

    for (const occurrenceStart of occurrences) {
      const lookupDate = format(occurrenceStart, "yyyy-MM-dd");
      const ex = exceptions.get(lookupDate);
      if (ex?.action === "cancelled") continue;

      let resolved: Resolved = {
        title: row.title,
        location: row.location,
        startAt: occurrenceStart,
        endAt: new Date(occurrenceStart.getTime() + durationMs),
      };
      if (ex?.action === "modified") {
        resolved = applyOverride(resolved, ex.override ?? null);
      }

      // The widened search window (and a modified exception's shifted times)
      // can produce occurrences that miss the range entirely — drop them here
      // rather than letting the grid deal with off-window days.
      if (resolved.endAt < rangeStart || resolved.startAt > rangeEnd) continue;

      // Date may shift if a modified exception overrode start_at to a different day —
      // recompute from the resolved value so the returned record reflects the actual date.
      const occurrenceDate = format(resolved.startAt, "yyyy-MM-dd");

      out.push({
        eventId: row.id,
        occurrenceDate,
        startAt: resolved.startAt,
        endAt: resolved.endAt,
        title: resolved.title,
        description: row.description,
        location: resolved.location,
        allDay: row.all_day,
        childId: row.child_id,
        parentId: row.parent_id,
        isException: !!ex,
        isRecurring: !!row.rrule_freq,
        rrule,
        type: { slug, color, iconName, labelDe: labels.de, labelEn: labels.en },
      });
    }
  }
  return out;
}
