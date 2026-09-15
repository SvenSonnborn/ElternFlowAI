import { format } from "date-fns";

import type { Theme } from "@/design-system/themes";
import type { Database, Json } from "@/features/supabase/database.types";

import type { CalendarOccurrence } from "./types";

import { isJsonObject, overrideDate, overrideInterval } from "./override";
import { eventColorFor, eventIconFor, typeLabelsForSlug } from "./palette";
import { occurrencesBetween } from "./rrule";
import { floatingToInstant, instantToFloating, zonedDateKey, zonedDayBounds } from "./timezone";
import { occurrenceVersion } from "./version";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];
type EventExceptionRow = Database["public"]["Tables"]["event_exceptions"]["Row"];

export type EventWithRelations = EventRow & {
  event_types: EventTypeRow | null;
  event_exceptions: EventExceptionRow[] | null;
};

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

/**
 * Die Regel-Vorkommen zu den `modified`-Exceptions, die per Override **in**
 * dieses Fenster geschoben wurden, ihr eigenes Regel-Datum aber außerhalb
 * haben.
 *
 * Ohne sie ist eine so verschobene Occurrence **an beiden Daten unsichtbar**:
 * am Regel-Datum verwirft sie der Fensterfilter (sie liegt dort nicht mehr), am
 * neuen Datum entsteht sie nie, weil `rule.between(...)` nur Regel-Daten kennt
 * (nachgemessen, Spec §6.2). Erreichbar über `EventEditScreen` mit Scope „Nur
 * diesen".
 *
 * Zurückgegeben wird das **Regel**-Vorkommen, nicht der Override-Start: Der
 * Aufrufer schickt es durch dieselbe Auflösung wie jedes andere Vorkommen, und
 * nur so trägt die Occurrence hinterher denselben `occurrenceKey`, dasselbe
 * Versions-Token und dieselbe Exception-Kennzeichnung wie auf dem regulären
 * Weg (ADR-034).
 *
 * Die Reihenfolge der Prüfungen ist Absicht — billig vor teuer: Der
 * Fensterschnitt und die Deduplizierung kosten nichts, der abschließende
 * `occurrencesBetween`-Aufruf einen zusätzlichen rrule-Durchlauf. Der ist
 * unverzichtbar: Verwaiste Exceptions überleben den Löschpfad
 * (`deleteAllExceptions` läuft nur bei `ruleDiffers`, `deleteExceptionsFromDate`
 * nur ab dem Schnitt), und ohne die Prüfung erzeugte eine solche Zeile einen
 * Phantom-Termin an einem Datum, an dem die Serie gar nicht stattfindet. Er
 * kostet auch selten etwas: Verschobene Exceptions sind die Ausnahme, und die
 * Regel-Schlüsselmenge wird erst gebaut, wenn die erste eine Prüfung braucht.
 */
function movedExceptionOccurrences(
  row: EventRow,
  exceptions: EventExceptionRow[],
  ruleOccurrences: Date[],
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const out: Date[] = [];
  let ruleKeys: Set<string> | null = null;
  for (const ex of exceptions) {
    if (ex.action !== "modified") continue;
    const interval = overrideInterval(ex.override);
    if (!interval) continue;
    // Derselbe Schnitt, den der Filter in `expandEvents` gleich noch einmal
    // zieht — hier nur, um den rrule-Aufruf unten zu sparen.
    if (interval.end < rangeStart || interval.start > rangeEnd) continue;
    ruleKeys ??= new Set(ruleOccurrences.map((o) => zonedDateKey(o, row.timezone)));
    if (ruleKeys.has(ex.occurrence_date)) continue;
    const bounds = zonedDayBounds(ex.occurrence_date, row.timezone);
    if (!bounds) continue;
    const onThatDay = occurrencesBetween(row, bounds.start, bounds.end).find(
      (o) => zonedDateKey(o, row.timezone) === ex.occurrence_date,
    );
    if (onThatDay) out.push(onThatDay);
  }
  return out;
}

interface Resolved {
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
}

function applyOverride(base: Resolved, override: Json | null): Resolved {
  if (!isJsonObject(override)) return base;
  const next: Resolved = { ...base };
  if (typeof override.title === "string") next.title = override.title;
  // `description` und `location` teilen sich dieselbe Form: ein String setzt,
  // ein explizites `null` löscht, ein fehlender Key lässt den Master-Wert
  // stehen. Der Spalten-Comment der Migration nennt beide Keys seit dem ersten
  // Tag; `description` wurde bis ADR-035 trotzdem nie gelesen, eine per „Nur
  // diesen" geänderte Beschreibung erreichte die Anzeige also nie.
  if (typeof override.description === "string") next.description = override.description;
  else if (override.description === null) next.description = null;
  if (typeof override.location === "string") next.location = override.location;
  else if (override.location === null) next.location = null;
  // Unparsbare Datumswerte werden verworfen statt als Invalid Date
  // weitergereicht — siehe `overrideDate`.
  const start = overrideDate(override.start_at);
  if (start) next.startAt = start;
  const end = overrideDate(override.end_at);
  if (end) next.endAt = end;
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

    const exceptionRows = row.event_exceptions ?? [];
    const ruleOccurrences = expandRecurrence(
      row,
      rangeStart,
      rangeEnd,
      Math.max(durationMs, floatingDurationMs),
    );
    // Zwei Quellen statt einer (ADR-035). Sortiert, damit die Ausgabe
    // unabhängig davon geordnet bleibt, aus welcher Quelle ein Vorkommen kam —
    // `useEvent`s `expanded[0]`-Fallback liest sonst je nach Exception-Lage ein
    // anderes Vorkommen.
    const occurrences = [
      ...ruleOccurrences,
      ...movedExceptionOccurrences(row, exceptionRows, ruleOccurrences, rangeStart, rangeEnd),
    ].sort((a, b) => a.getTime() - b.getTime());
    // Der Abbruch steht bewusst NACH der Kandidatenberechnung: Eine Serie, die
    // im Fenster kein Regel-Vorkommen hat, kann trotzdem eine hierher
    // verschobene Occurrence haben.
    if (!occurrences.length) continue;

    const typeRow = row.event_types;
    const slug = typeRow?.slug ?? "family";
    const labels = readLabel(slug, typeRow?.label ?? null);
    const color = eventColorFor(slug, typeRow?.color ?? "primary", theme);
    const iconName = eventIconFor(slug, typeRow?.icon ?? "");

    const exceptions = new Map(exceptionRows.map((ex) => [ex.occurrence_date, ex]));
    const rrule = {
      freq: row.rrule_freq,
      interval: row.rrule_interval,
      byweekday: row.rrule_byweekday,
      count: row.rrule_count,
      until: row.rrule_until,
    };

    for (const occurrenceStart of occurrences) {
      // Der Schlüssel der Exception-Zeile: das Regel-Datum in der Zone des
      // Termins. `format` läse hier in der Zone des Lesers und griffe auf einem
      // Gerät westlich des Termins einen Tag daneben (ADR-034).
      const occurrenceKey = zonedDateKey(occurrenceStart, row.timezone);
      const ex = exceptions.get(occurrenceKey);
      if (ex?.action === "cancelled") continue;

      let resolved: Resolved = {
        title: row.title,
        description: row.description,
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

      // Das Anzeigedatum folgt dem aufgelösten Start und der Zone des Lesers:
      // es beantwortet, an welchem Tag der Termin hier im Raster erscheint.
      // Der Schlüssel oben tut das ausdrücklich nicht.
      const occurrenceDate = format(resolved.startAt, "yyyy-MM-dd");

      out.push({
        eventId: row.id,
        occurrenceKey,
        occurrenceDate,
        timezone: row.timezone,
        startAt: resolved.startAt,
        endAt: resolved.endAt,
        title: resolved.title,
        description: resolved.description,
        location: resolved.location,
        allDay: row.all_day,
        childId: row.child_id,
        parentId: row.parent_id,
        isException: !!ex,
        isRecurring: !!row.rrule_freq,
        version: occurrenceVersion(row, occurrenceKey),
        rrule,
        type: { slug, color, iconName, labelDe: labels.de, labelEn: labels.en },
      });
    }
  }
  return out;
}
