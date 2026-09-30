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
 * `ruleConflicts` hat einen echten Konflikt gemeldet (über
 * `differingEventFields` oder, ohne `theirs`, über
 * `recurrenceRowsWithoutOccurrence`); ein Dialog, der ihn meldet und nichts
 * zeigt, wäre schlechter als zwei gleiche Werte.
 *
 * `theirs.startAt` ist der Wochentag-Anker der fremden Regel, den beide
 * Aufrufer aus `ruleAnchor` nehmen — nicht der per Override aufgelöste Start
 * der fremden Occurrence.
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
 * Der Wochentag-Anker der fremden Regel: die erste Occurrence ohne Exception
 * in `expanded` — der frisch gelesenen Zeile, expandiert im Suchfenster von
 * `showConflict` —, sonst der Serienanker `row.start_at`.
 *
 * Bei einer wöchentlichen Regel mit einem Wochentag erkennt
 * `rruleToRecurrence` „Wöchentlich" nur, wenn dieser Tag der Wochentag des
 * Ankers ist; sonst zeigt die fremde Options-Zeile „—". Eine Occurrence, die
 * die fremde Regel selbst erzeugt hat, liegt auf dem richtigen Tag. Zwei
 * naheliegende Anker tun das nicht:
 *
 * - `row.start_at` bleibt bei einer Regeländerung stehen (ADR-032):
 *   „wöchentlich am Mittwoch" kann auf einer Serie liegen, die an einem
 *   Montag begann.
 * - `theirs.startAt` ist der per Override aufgelöste Start. Hat die andere
 *   Seite die bearbeitete Occurrence per „Nur diesen" auf einen anderen
 *   Wochentag verschoben und die Serie hinter ihr gekürzt, bleibt die
 *   Exception stehen, und ihr Start liegt neben der Regel.
 *
 * Keine Occurrence mit Exception (`isException`) zählt, auch keine, deren
 * Override nur den Titel ändert: Das Flag sagt nicht, ob der Override den
 * Start verschoben hat. Nur wenn das Fenster keine reguläre Occurrence
 * enthält, bleibt `row.start_at`.
 *
 * Beide Zweige von `showConflict` verankern hierüber, mit und ohne `theirs` —
 * dieselbe fremde Regel wird so nicht je nach Zweig verschieden beschriftet.
 */
export function ruleAnchor(
  row: Pick<EventWithRelations, "start_at">,
  expanded: readonly Pick<CalendarOccurrence, "isException" | "startAt">[],
): Date {
  return expanded.find((o) => !o.isException)?.startAt ?? new Date(row.start_at);
}

/**
 * Die Regel-Zeilen für den Fall, dass die fremde Fassung die bearbeitete
 * Occurrence nicht mehr enthält (`theirs === null`).
 *
 * `theirs` fehlt in der Praxis aus zwei Gründen: Die andere Seite hat genau
 * diese Occurrence abgesagt („Nur diesen" löschen — `expandEvents`
 * überspringt `cancelled`), oder ihre Regel erzeugt sie nicht mehr. Der
 * zweite ist häufig, nicht exotisch: Stellt die andere Seite von wöchentlich
 * auf monatlich oder auf alle zwei Wochen, begrenzt sie die Serie auf weniger
 * Termine oder schneidet sie per „ab hier löschen" ab, fällt die Occurrence,
 * an der dieses Formular hängt, oft heraus. Der Dialog erschien dann seit
 * ADR-031 — aber ohne jede Zeile, und änderte die eigene Seite die Regel mit,
 * überschrieb „Deine Fassung speichern" eine Regel, die der Nutzer nie
 * gesehen hatte. Die fremde Regel ist über `err.row` bekannt; nur die
 * Occurrence fehlt (ADR-038). Ein Suchfenster, das die Occurrence verfehlt,
 * ist dagegen praktisch kein Grund: `eventLookupWindow` deckt den Tag des
 * Schlüssels in `row.timezone` immer ab, nur ein kaputter Schlüssel fiele auf
 * das Standardfenster zurück.
 *
 * Der Wochentag der fremden Regel kommt aus `ruleAnchor`, demselben Anker wie
 * im Zweig mit `theirs`.
 *
 * Zeilen entstehen nur, wenn alle drei Bedingungen gelten: Die eigene Seite
 * ändert die Regel ebenfalls (`mine` gesetzt), die Basis ist hydriert
 * (`baseRule` gesetzt), und die fremde Regel weicht von Basis und eigener ab
 * (`ruleConflicts`). Sonst ist die Liste leer, und der Dialog bleibt ohne
 * Zeilen. Ändert die eigene Seite an einer weggefallenen Occurrence nur den
 * Titel, ist das mit „Nur diesen" und „alle Termine" richtig: Ihr
 * Schreibvorgang fasst die Regel dann nicht an. Mit „dieser und folgende"
 * fasst er sie doch an, außer am ersten Termin der Serie: Der Schnitt
 * schreibt das Serienende der fremden Regel neu (`setRruleUntil` bzw.
 * `setRruleCount`), ohne dass der Dialog etwas davon zeigt (`docs/TODO.md`).
 *
 * Hat die andere Seite die Regel-Spalten nicht geändert, bleibt in der Praxis
 * nur der erste Grund für das fehlende `theirs`: Sie hat genau diese
 * Occurrence abgesagt. Ein Randfall bleibt: „dieser und folgende" am ersten
 * Termin schreibt die Änderungen wörtlich (`updateMaster` ohne
 * `anchoredChanges`), eine Datumsänderung verschiebt dann den Serienanker
 * und kann die Schlüssel verschieben, ohne dass sich eine Regel-Spalte
 * ändert.
 *
 * Entstehen Zeilen, zeigen sie nur die Regel. Hat die andere Seite zugleich
 * ein Feld wie Titel oder Ort geändert (Scope „alle"), fehlt dafür eine Zeile
 * — `differingEventFields` braucht eine fremde Occurrence, und die gibt es
 * hier nicht —, und „Deine Fassung speichern" überschreibt es still. Nicht
 * schlechter als vorher, da gab es gar keine Zeile.
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
  return recurrenceConflictRows(
    { rrule: theirsRule, startAt: ruleAnchor(row, expanded), timezone: row.timezone },
    mine,
    t,
  );
}
