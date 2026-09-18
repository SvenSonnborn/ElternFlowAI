import type { ConflictRow } from "@/app-sections/shared/conflictStore";
import type { RecurrenceChanges } from "@/features/calendar/recurrence";
import type { CalendarOccurrence, OccurrenceRrule } from "@/features/calendar/types";
import type { Translate } from "@/features/shared";

// Direkt aus dem Modul, nicht aus dem Barrel `@/features/calendar`: Der zieht
// Hooks, die unter `bun test` nicht laden, und dieser Helfer existiert gerade,
// damit seine Zweige testbar sind.
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
