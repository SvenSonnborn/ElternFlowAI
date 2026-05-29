import { format } from "date-fns";
import { Frequency, RRule } from "rrule";

import type { Theme } from "@/design-system/themes";
import type { Database, Json } from "@/features/supabase/database.types";

import type { CalendarOccurrence } from "./types";

import { eventColorFor, eventIconFor, FALLBACK_TYPE_LABEL } from "./palette";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];
type EventExceptionRow = Database["public"]["Tables"]["event_exceptions"]["Row"];

export type EventWithRelations = EventRow & {
  event_types: EventTypeRow | null;
  event_exceptions: EventExceptionRow[] | null;
};

const FREQ_MAP: Record<NonNullable<EventRow["rrule_freq"]>, Frequency> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

function isJsonObject(j: Json | null | undefined): j is { [k: string]: Json | undefined } {
  return typeof j === "object" && j !== null && !Array.isArray(j);
}

function readLabel(slug: string, label: Json | null | undefined): { de: string; en: string } {
  const fallback = FALLBACK_TYPE_LABEL[slug] ?? { de: slug, en: slug };
  if (!isJsonObject(label)) return fallback;
  const de = label.de;
  const en = label.en;
  return {
    de: typeof de === "string" ? de : fallback.de,
    en: typeof en === "string" ? en : fallback.en,
  };
}

function expandRecurrence(row: EventRow, rangeStart: Date, rangeEnd: Date): Date[] {
  const start = new Date(row.start_at);
  if (!row.rrule_freq) {
    return start >= rangeStart && start <= rangeEnd ? [start] : [];
  }
  const rule = new RRule({
    freq: FREQ_MAP[row.rrule_freq],
    interval: row.rrule_interval || 1,
    dtstart: start,
    until: row.rrule_until ? new Date(row.rrule_until) : null,
    count: row.rrule_count ?? null,
    byweekday: row.rrule_byweekday?.length ? row.rrule_byweekday.map((n) => n - 1) : null,
  });
  return rule.between(rangeStart, rangeEnd, true);
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
    const occurrences = expandRecurrence(row, rangeStart, rangeEnd);
    if (!occurrences.length) continue;
    const masterStart = new Date(row.start_at);
    const masterEnd = new Date(row.end_at);
    const durationMs = masterEnd.getTime() - masterStart.getTime();

    const typeRow = row.event_types;
    const slug = typeRow?.slug ?? "family";
    const labels = readLabel(slug, typeRow?.label ?? null);
    const color = eventColorFor(slug, typeRow?.color ?? "primary", theme);
    const iconName = eventIconFor(slug, typeRow?.icon ?? "");

    const exceptions = new Map((row.event_exceptions ?? []).map((ex) => [ex.occurrence_date, ex]));

    for (const occurrenceStart of occurrences) {
      const occurrenceDate = format(occurrenceStart, "yyyy-MM-dd");
      const ex = exceptions.get(occurrenceDate);
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
        isException: !!ex,
        type: { slug, color, iconName, labelDe: labels.de, labelEn: labels.en },
      });
    }
  }
  return out;
}
