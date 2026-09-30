import type { ConflictRow } from "@/app-sections/shared/conflictStore";
import type { EventWithRelations } from "@/features/calendar/expand";
import type { RecurrenceChanges } from "@/features/calendar/recurrence";
import type { CalendarOccurrence, OccurrenceRrule } from "@/features/calendar/types";
import type { Translate } from "@/features/shared";

// Direkt aus dem Modul, nicht aus dem Barrel `@/features/calendar`: Der zieht
// Hooks, die unter `bun test` nicht laden, und dieser Helfer existiert gerade,
// damit seine Zweige testbar sind.
import { ruleConflicts } from "@/features/calendar/conflict";
import { rruleToRecurrence } from "@/features/calendar/createMutation";
import { ruleOf } from "@/features/calendar/rule";

/** Die eigene Seite: die Regel, die geschrieben würde, und wo ihr Wochentag gilt. */
interface MineSide {
  recurrence: RecurrenceChanges;
  /**
   * Der Start, mit dem `buildRecurrenceChanges` die Regel gebaut hat — die
   * Formular-Range (`range.startAt`), **nicht** `vars.changes.start_at`: Bei
   * einem ganztägigen Termin ist das bereits `toAllDayRange(range).startAt`,
   * auf Mitternacht in der Gerätezone geschnappt statt in `timezone`, und
   * hätte den Wochentag hier falsch verankert.
   */
  startAt: Date;
  /** Die Zone des Termins (`vars.timezone`) — dort prüft `rruleToRecurrence` den Wochentag. */
  timezone: string;
}

function optionText(rule: OccurrenceRrule, startAt: Date, timezone: string, t: Translate): string {
  const option = rruleToRecurrence(
    { rrule_freq: rule.freq, rrule_interval: rule.interval, rrule_byweekday: rule.byweekday },
    startAt,
    timezone,
  );
  return option == null ? "—" : t(`cal.recur.${option}`);
}

/**
 * „Unbegrenzt" nur ohne Anzahl **und** ohne Enddatum: Eine per „ab hier
 * löschen" an einem Datum beendete Serie hat keine Anzahl, ist aber nicht
 * unbegrenzt. Für ein Enddatum gibt es keinen Key — „—" ist dort karg, aber
 * nicht falsch (🎨-Eintrag in `docs/TODO.md`).
 *
 * Ohne Regel (`freq === null`, „Keine") gibt es gar kein Serienende zu
 * benennen — die Regel beschreibt dann einen Einzeltermin, für den das
 * Formular das Anzahl-Feld ohnehin ausblendet. „Unbegrenzt" wäre hier
 * inhaltlich falsch, nicht nur karg (Befund 2, Review-Runde 1), deshalb
 * kommt diese Prüfung vor den anderen beiden.
 */
function endText(rule: OccurrenceRrule, t: Translate): string {
  if (rule.freq == null) return "—";
  if (rule.count != null) return String(rule.count);
  if (rule.until != null) return "—";
  return t("cal.create.recurrenceCountUnlimited");
}

/**
 * Die Dialogzeilen für eine abweichende Wiederholungsregel — bis zu zwei, eine
 * je Bedienelement des Formulars: die Option („Wiederholung") und das
 * Serienende („Endet nach … Terminen"). Beide Beschriftungen existieren; eine
 * Zeile, die die ganze Regel beschreibt, bräuchte neue Copy-Keys (ADR-038).
 *
 * Eine Zeile erscheint nur, wenn sich ihre beiden **angezeigten** Texte
 * unterscheiden. Zeigt keine einen Unterschied — er liegt dann in einem Teil
 * der Regel, den das Formular nicht darstellt: Intervall, Wochentage, zwei
 * verschiedene Enddaten —, erscheint die Options-Zeile trotzdem.
 * `differingEventFields` hat einen echten Konflikt gemeldet; ein Dialog, der
 * ihn meldet und nichts zeigt, wäre schlechter als zwei gleiche Werte.
 *
 * Ein eigenes Modul statt Code in `showConflict`, weil `EventEditScreen` unter
 * `bun test` nicht ladbar ist und diese Zweige einen Test verdienen.
 */
export function recurrenceConflictRows(
  theirs: Pick<CalendarOccurrence, "rrule" | "startAt" | "timezone">,
  mine: MineSide,
  t: Translate,
): ConflictRow[] {
  const mineRule = ruleOf(mine.recurrence);
  const theirsOption = optionText(theirs.rrule, theirs.startAt, theirs.timezone, t);
  const mineOption = optionText(mineRule, mine.startAt, mine.timezone, t);
  const theirsEnd = endText(theirs.rrule, t);
  const mineEnd = endText(mineRule, t);

  const optionRow: ConflictRow = {
    label: t("cal.create.fieldRecurrence"),
    theirs: `${t("conflict.theirs")}: ${theirsOption}`,
    mine: `${t("conflict.mine")}: ${mineOption}`,
  };

  const rows: ConflictRow[] = [];
  if (theirsOption !== mineOption) rows.push(optionRow);
  if (theirsEnd !== mineEnd) {
    rows.push({
      label: t("cal.create.fieldRecurrenceCount"),
      theirs: `${t("conflict.theirs")}: ${theirsEnd}`,
      mine: `${t("conflict.mine")}: ${mineEnd}`,
    });
  }
  if (rows.length === 0) rows.push(optionRow);
  return rows;
}

/** Die Spalten der fremden Zeile, die die Regel-Zeilen brauchen. */
type ForeignRow = Pick<
  EventWithRelations,
  | "rrule_freq"
  | "rrule_interval"
  | "rrule_byweekday"
  | "rrule_count"
  | "rrule_until"
  | "start_at"
  | "timezone"
>;

/**
 * Die Regel-Zeilen für den Fall, dass die fremde Fassung die bearbeitete
 * Occurrence nicht mehr enthält (`theirs === null`).
 *
 * Häufig, nicht exotisch: Stellt die andere Seite von wöchentlich auf
 * monatlich, begrenzt sie die Serie auf weniger Termine oder schneidet sie per
 * „ab hier löschen" ab, erzeugt die neue Regel die Occurrence nicht mehr, an
 * der dieses Formular hängt. Der Dialog erschien dann schon immer — aber ohne
 * jede Zeile, und „Deine Fassung speichern" überschrieb eine Regel, die der
 * Nutzer nie gesehen hatte. Die fremde Regel ist über `err.row` bekannt; nur
 * die Occurrence fehlt (ADR-038).
 *
 * Der Wochentag der fremden Regel hängt an einer Occurrence, die sie
 * tatsächlich erzeugt — der ersten regulären im Suchfenster —, nicht an
 * `row.start_at`: Der Serienanker bleibt bei einer Regeländerung stehen
 * (ADR-032) und liegt dann nicht zwingend auf dem Wochentag der neuen Regel
 * („wöchentlich am Mittwoch" auf einer Serie, die an einem Montag begann).
 * Verschobene Exceptions zählen nicht, ihr Start sagt nichts über die Regel.
 * Nur wenn das Fenster keine reguläre Occurrence enthält, bleibt
 * `row.start_at`.
 *
 * Leer, wenn es keine Regel-Kollision gibt: Die eigene Seite fasst die Regel
 * nicht an, die andere hat sie nicht geändert, oder die Basis ist noch nicht
 * hydriert. Dann fehlt `theirs` aus einem anderen Grund, etwa weil die
 * Occurrence außerhalb des Suchfensters lag, und der Dialog bleibt ohne Zeilen.
 */
export function recurrenceRowsWithoutOccurrence(
  row: ForeignRow,
  expanded: readonly Pick<CalendarOccurrence, "isException" | "startAt">[],
  baseRule: OccurrenceRrule | null,
  mine: MineSide | null,
  t: Translate,
): ConflictRow[] {
  if (baseRule == null || mine == null) return [];
  const theirsRule = ruleOf(row);
  if (!ruleConflicts(theirsRule, baseRule, mine.recurrence)) return [];
  const anchor = expanded.find((o) => !o.isException)?.startAt ?? new Date(row.start_at);
  return recurrenceConflictRows(
    { rrule: theirsRule, startAt: anchor, timezone: row.timezone },
    mine,
    t,
  );
}
