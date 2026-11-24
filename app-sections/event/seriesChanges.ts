import { anchorChangesToDate, type EventChanges } from "@/features/calendar/recurrence";
import { instantToFloating } from "@/features/calendar/timezone";

const DAY_MS = 86_400_000;

/**
 * Was unter Scope „Alle" in die Serie geht: nur, was der Nutzer gegenüber dem
 * geöffneten Stand geändert hat. Jedes unveränderte Feld behält den Wert des
 * Masters — mit oder ohne Regeländerung (Spec 2026-11-19, B5). Sonst trüge
 * eine per „Nur diesen" verschobene Occurrence ihren Override (Titel, Ort,
 * 18:00 am Dienstag) in die ganze Serie, nur weil jemand die Anzahl ändert.
 *
 * - `opened` ist das Formular beim Öffnen, genauso normalisiert wie `form`
 *   (ganztägig: geschnappt wie `finalRange`) — sonst zählte schon die
 *   Normalisierung als Änderung.
 * - `rule` ist die Regel-Occurrence (`initial.ruleOccurrence`): die Werte des
 *   Masters am Tag dieser Occurrence. Auf einer unverschobenen Occurrence
 *   gleicht sie `opened`, und es ändert sich nichts gegenüber früher.
 *
 * Die Uhrzeit ist **eine** Einheit aus Start-Tageszeit und Wandzeit-Dauer in
 * `timeZone`; eine reine Datumsänderung zählt nicht, das Datum hält
 * `anchoredChanges` (`recurrence.ts`) ohnehin am Master fest. Eine geänderte
 * Uhrzeit wird am Tag der Regel-Occurrence verankert, nicht am Master: Dann
 * liegt `start_at` weiter auf dem `occurrenceKey`, `canApplyOptimistically`
 * bleibt wahr, und optimistische Anzeige, Konflikt-Dialog und Schreibpfad
 * lesen dasselbe `vars.changes`.
 *
 * `literal` (Serie wird Einzeltermin, `recurrence.rrule_freq === null`): Dann
 * verankert der Schreibpfad nichts mehr, also zählt auch das Datum, und eine
 * geänderte Zeit gilt wörtlich aus dem Formular.
 */
export function seriesChanges(input: {
  form: EventChanges;
  opened: EventChanges;
  rule: EventChanges;
  timeZone: string;
  literal: boolean;
}): EventChanges {
  const { form, opened, rule, timeZone, literal } = input;
  const pick = <K extends "title" | "location" | "description">(key: K): EventChanges[K] =>
    form[key] === opened[key] ? rule[key] : form[key];
  const times = !timeChanged(form, opened, timeZone, literal)
    ? rule
    : literal
      ? form
      : anchorChangesToDate(new Date(rule.start_at), form, timeZone);
  return {
    title: pick("title"),
    start_at: times.start_at,
    end_at: times.end_at,
    location: pick("location"),
    description: pick("description"),
  };
}

function timeChanged(
  form: EventChanges,
  opened: EventChanges,
  timeZone: string,
  literal: boolean,
): boolean {
  if (literal) return form.start_at !== opened.start_at || form.end_at !== opened.end_at;
  const a = wallClock(form, timeZone);
  const b = wallClock(opened, timeZone);
  return a.timeOfDay !== b.timeOfDay || a.durationMs !== b.durationMs;
}

/** Start-Tageszeit und Dauer als Wandzeit in `timeZone`, ohne das Datum. */
function wallClock(changes: EventChanges, timeZone: string) {
  const start = instantToFloating(new Date(changes.start_at), timeZone).getTime();
  const end = instantToFloating(new Date(changes.end_at), timeZone).getTime();
  return { timeOfDay: start % DAY_MS, durationMs: end - start };
}
