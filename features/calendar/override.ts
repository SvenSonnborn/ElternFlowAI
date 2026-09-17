import type { Json } from "@/features/supabase/database.types";

/**
 * Der Vertrag von `event_exceptions.override`.
 *
 * Die Spalte ist freies `jsonb`; ihr Comment in
 * [20260529091933_calendar.sql](../../supabase/migrations/20260529091933_calendar.sql)
 * nennt seit der ersten Migration fünf anerkannte Keys — `title`,
 * `description`, `start_at`, `end_at`, `location`. Wer sie liest, muss mit
 * allem rechnen, was tatsächlich darinsteht: Der einzige App-seitige Schreiber
 * ist `modifyOccurrence` ([recurrence.ts](./recurrence.ts)) mit ISO-Strings,
 * aber direkte DB-Schreibzugriffe, ein künftiger serverseitiger Writer und
 * Migrationen sind es nicht.
 *
 * Eigenes Modul, weil der Vertrag seit ADR-035 zwei Leser hat: `applyOverride`
 * ([expand.ts](./expand.ts)) löst eine Occurrence auf, `eventLookupWindow`
 * ([eventWindow.ts](./eventWindow.ts)) weitet sein Suchfenster um das vom
 * Override beanspruchte Intervall. Beide brauchen dieselbe Antwort auf „ist
 * das überhaupt ein Datum?", und zwei Antworten darauf liefen beim nächsten
 * Fix auseinander.
 */

/** Ein JSON-Objekt (kein Array, kein `null`) — der Türsteher vor jedem Key-Zugriff. */
export function isJsonObject(j: Json | null | undefined): j is { [k: string]: Json | undefined } {
  return typeof j === "object" && j !== null && !Array.isArray(j);
}

/**
 * Das Datumspräfix eines ISO-Strings — nur die drei Kalenderkomponenten, ohne
 * Uhrzeit oder Offset. `new Date(...)` prüft den Monat (`"2026-13-01"` wird zu
 * `Invalid Date`), den Tag aber nicht: `"2026-02-30"` normalisiert still zum
 * 2. März. Dieses Muster zieht die drei Zifferngruppen für den Rundlauf-Check
 * unten aus dem **String**, nicht aus dem geparsten `Date` — siehe die
 * Begründung dort.
 */
const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Ein Datumswert aus dem Override-JSON, oder `null`.
 *
 * Ein nicht parsbarer String ergab bis ADR-035 eine `Invalid Date`, die
 * `format(resolved.startAt, …)` in `expandEvents` mit `RangeError: Invalid time
 * value` quittierte — und weil dort alle Zeilen des Fensters in einer Schleife
 * laufen, blieb der **gesamte** Kalenderbereich leer statt nur der eine Termin
 * (nachgemessen, Spec §6.9). Dieselbe Schadensklasse wie eine unbekannte Zone
 * (Befund D, ADR-033) und dieselbe Antwort: verwerfen, damit der Rest steht.
 *
 * **Ein Kalenderüberlauf wird seither ebenfalls verworfen.** `event_exceptions.override`
 * ist freies `jsonb` ohne Inhaltsprüfung; ein direkter DB-Schreibzugriff oder
 * ein künftiger serverseitiger Writer kann `"2026-02-30T07:00:00.000Z"`
 * ablegen. `new Date(...)` normalisiert das still auf den 2. März (nachgemessen)
 * statt zu werfen — die Occurrence wanderte sonst unbemerkt auf einen anderen
 * Kalendertag. Geprüft wird das Datumspräfix **so, wie es im String steht**
 * (`ISO_DATE_PREFIX`), nicht gegen die UTC-Komponenten des geparsten `Date`:
 * Ein Override darf legitim einen Offset tragen (`"2026-06-15T00:30:00+02:00"`
 * ist UTC bereits der 14.06.) — ein Rundlauf gegen `getUTCDate()` würde einen
 * solchen, gültigen Wert fälschlich verwerfen. Trägt der String kein
 * ISO-Datumspräfix, entscheidet weiterhin `new Date` allein.
 */
export function overrideDate(value: Json | undefined): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const match = value.match(ISO_DATE_PREFIX);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    // Derselbe Rundlauf wie in `zonedDayBounds` (`timezone.ts`): `setUTCFullYear`
    // normalisiert einen Überlauf ebenso still wie `Date.UTC`, meldet ihn
    // danach aber über abweichende Getter zurück.
    const probe = new Date(0);
    probe.setUTCFullYear(year, month - 1, day);
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      return null;
    }
  }

  return parsed;
}

/**
 * Das Intervall, das ein Override beansprucht — oder `null`, wenn er keines
 * beansprucht.
 *
 * Ohne brauchbares `start_at` gibt es kein Intervall: Ein Override, der nur
 * Titel oder Beschreibung ändert, verschiebt nichts, erzeugt also weder einen
 * Kandidaten (§6.2) noch eine Fensterweitung (§6.9 Nr. 2).
 *
 * Fehlt oder bricht `end_at`, gilt der Start auch als Ende. Das macht die
 * Vorprüfung in `expandEvents` in diesem einen Fall **strenger** als den
 * Fensterfilter dahinter, der stattdessen das Regel-Ende der Occurrence
 * heranzieht. Über den App-Schreibpfad ist der Fall nicht erreichbar —
 * `modifyOccurrence` schreibt `EventChanges` vollständig, also immer beide
 * Felder. Ein Override nur mit `start_at` kann heute nur von außen entstehen;
 * die Abweichung steht als Grenze in `docs/TODO.md`.
 */
export function overrideInterval(override: Json | null): { start: Date; end: Date } | null {
  if (!isJsonObject(override)) return null;
  const start = overrideDate(override.start_at);
  if (!start) return null;
  return { start, end: overrideDate(override.end_at) ?? start };
}
