import { format } from "date-fns";

import type { Theme } from "@/design-system/themes";
import type { Database, Json } from "@/features/supabase/database.types";

import type { CalendarOccurrence } from "./types";

import { eventColorFor, eventIconFor, typeLabelsForSlug } from "./palette";
import { occurrencesBetween } from "./rrule";
import { floatingToInstant, instantToFloating } from "./timezone";
import { occurrenceVersion } from "./version";

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
 * Größte reale Verschiebung, die eine Zonenregel an einem Umstellungstag
 * erzeugen kann — nachgemessen gegen `Intl`, nicht geschätzt. Reine
 * DST-Umstellungen (Sommer-/Winterzeit) liegen bei ein bis zwei Stunden.
 * Zonen, die dabei die Datumsgrenze verschieben, springen dagegen um volle
 * **24 Stunden** (`Pacific/Kwajalein` 1993: −12 h → +12 h; `Pacific/Apia`
 * 2011: −10 h → +14 h — beide beim Wechsel von der West- auf die Ostseite
 * der Datumsgrenze, um mit den Nachbarn gleichzuziehen). 24 h ist damit die
 * gemessene Grenze; 26 h legt Luft drauf und deckt sich mit `PROBE_MS` in
 * `timezone.ts`, das aus verwandtem Grund (Sonden weit genug vor/hinter der
 * gesuchten Wandzeit) dieselbe Spanne wählt. Der Name trägt bewusst nicht
 * mehr „DST", weil der Datumsgrenzen-Fall die eigentliche Obergrenze setzt.
 *
 * Der Puffer existiert, weil `durationMs`/`floatingDurationMs` **am Master**
 * gemessen werden, aber für **jede** Occurrence der Serie gelten (Befund A,
 * PR #119): Läuft der Master selbst über keine Umstellung, sind beide Werte
 * gleich — eine spätere Occurrence kann trotzdem über eine Umstellung laufen
 * und dadurch absolut länger sein als beide. `max(...)` allein deckt genau
 * diesen Fall nicht ab, siehe den zweiten Test in `expand.test.ts`
 * ("Oktober-Rückstellung"). Zu weit zu suchen kostet nichts — der Filter
 * weiter unten verwirft überschüssige Kandidaten ohnehin.
 */
const MAX_ZONE_SHIFT_MS = 26 * 3600_000;

/**
 * Occurrence starts inside the window — widened backwards by the event's own
 * duration, because a span that began before `rangeStart` still paints days
 * inside it, plus `MAX_ZONE_SHIFT_MS` (Befund A/E): the widened window must
 * cover the occurrence's **wall-clock** duration, not just its absolute one,
 * or an occurrence whose floating end lands inside the window can fall out of
 * the search entirely before the filter below ever sees it. Over-widening is
 * free — the filter drops excess candidates — under-widening loses events.
 */
function expandRecurrence(
  row: EventRow,
  rangeStart: Date,
  rangeEnd: Date,
  maxDurationMs: number,
): Date[] {
  const searchStart = new Date(
    rangeStart.getTime() - Math.max(0, maxDurationMs) - MAX_ZONE_SHIFT_MS,
  );
  return occurrencesBetween(row, searchStart, rangeEnd);
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
    // Zwei Dauern: die absolute (für das Suchfenster, Befund A — s.u.) und die
    // Wandzeit-Dauer (für das Ende jeder Occurrence): ein mehrtägiger Termin
    // über eine Umstellung soll seine Wanduhrzeit behalten, nicht seine
    // Millisekunden.
    const durationMs = masterEnd.getTime() - masterStart.getTime();
    const floatingDurationMs =
      instantToFloating(masterEnd, row.timezone).getTime() -
      instantToFloating(masterStart, row.timezone).getTime();

    const occurrences = expandRecurrence(
      row,
      rangeStart,
      rangeEnd,
      Math.max(durationMs, floatingDurationMs),
    );
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
        endAt: floatingToInstant(
          new Date(instantToFloating(occurrenceStart, row.timezone).getTime() + floatingDurationMs),
          row.timezone,
        ),
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
        version: occurrenceVersion(row, occurrenceDate),
        rrule,
        type: { slug, color, iconName, labelDe: labels.de, labelEn: labels.en },
      });
    }
  }
  return out;
}
