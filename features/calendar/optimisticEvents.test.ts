import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { lightTheme } from "@/design-system";

import type { EventWithRelations } from "./expand";
import type { EventsView, OptimisticEvent, OptimisticUpdate } from "./optimisticEvents";
import type { PendingEventDelete } from "./pendingDeletes";
import type { EventChanges, RecurrenceChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

import { expandEvents } from "./expand";
import {
  appliesToView,
  applyOptimisticChanges,
  canApplyOptimistically,
  confirmEventSave,
  isOptimisticEventId,
  patchesOccurrence,
  useOptimisticEventsStore,
  visibleOccurrences,
} from "./optimisticEvents";
import { withoutPendingDeletes } from "./pendingDeletes";
import { calendarKeys } from "./queries";
import { instantToFloating } from "./timezone";

function occ(partial: Partial<CalendarOccurrence> = {}): CalendarOccurrence {
  return {
    eventId: "e1",
    occurrenceKey: "2026-09-10",
    occurrenceDate: "2026-09-10",
    timezone: "Europe/Berlin",
    startAt: new Date("2026-09-10T16:00:00"),
    endAt: new Date("2026-09-10T17:30:00"),
    title: "Fußballtraining",
    description: "Trikot einpacken",
    location: "Sportplatz",
    allDay: false,
    childId: null,
    parentId: null,
    isException: false,
    isRecurring: true,
    version: "v1",
    rrule: { freq: "weekly", interval: 1, byweekday: [3], count: null, until: null },
    type: {
      slug: "sport",
      color: "#000",
      iconName: "ball",
      labelDe: "Sport",
      labelEn: "Sport",
    },
    ...partial,
  };
}

function changes(partial: Partial<EventChanges> = {}): EventChanges {
  return {
    title: "Fußballtraining",
    start_at: new Date("2026-09-10T18:00:00").toISOString(),
    end_at: new Date("2026-09-10T19:30:00").toISOString(),
    location: "Sportplatz",
    description: "Trikot einpacken",
    ...partial,
  };
}

function recurrenceChanges(partial: Partial<RecurrenceChanges> = {}): RecurrenceChanges {
  return {
    rrule_freq: "weekly",
    rrule_interval: 2,
    rrule_byweekday: [3],
    rrule_count: null,
    rrule_until: null,
    ...partial,
  };
}

describe("patchesOccurrence", () => {
  const entry = { eventId: "e1", occurrenceKey: "2026-09-10", scope: "this" as const };

  test("`this` trifft genau diese Occurrence", () => {
    expect(patchesOccurrence(entry, { eventId: "e1", occurrenceKey: "2026-09-10" })).toBe(true);
    expect(patchesOccurrence(entry, { eventId: "e1", occurrenceKey: "2026-09-17" })).toBe(false);
  });

  test("`forward` schließt den Stichtag ein und lässt alles davor", () => {
    const fwd = { ...entry, scope: "forward" as const };
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceKey: "2026-09-10" })).toBe(true);
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceKey: "2026-09-17" })).toBe(true);
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceKey: "2026-09-03" })).toBe(false);
  });

  test("`all` trifft jede Occurrence des Events", () => {
    const all = { ...entry, scope: "all" as const };
    expect(patchesOccurrence(all, { eventId: "e1", occurrenceKey: "2020-01-01" })).toBe(true);
    expect(patchesOccurrence(all, { eventId: "e1", occurrenceKey: "2030-12-31" })).toBe(true);
  });

  test("kein Scope greift auf ein fremdes Event über", () => {
    for (const scope of ["this", "forward", "all"] as const) {
      expect(
        patchesOccurrence({ ...entry, scope }, { eventId: "e2", occurrenceKey: "2026-09-10" }),
      ).toBe(false);
    }
  });
});

describe("applyOptimisticChanges · Serie mit Scope `all`", () => {
  // Zonenexplizit gebaut (UTC-Strings, nicht lokale Date-Komponenten):
  // `mergeDateAndTimeOfDay` (`timezone.ts`) rechnet seit ADR-034 in `occurrence.timezone`, eine
  // ambiente Fixture (ohne "Z") ließe die Erwartung mit der Runner-Zone
  // wandern — genau das hat diese beiden Tests unter `TZ=America/New_York`
  // reißen lassen, bevor sie zonenexplizit wurden. Gelesen wird das Ergebnis
  // deshalb über `instantToFloating(…, "Europe/Berlin")`, nicht über lokale
  // Getter.

  test("verschiebt die Tageszeit und behält das Datum jeder Occurrence", () => {
    // Die naheliegende Fehlimplementierung schreibt `changes.start_at` stumpf in
    // jede Occurrence — dann zöge sich die ganze Serie auf einen Tag zusammen.
    const later = occ({
      occurrenceDate: "2026-09-17",
      startAt: new Date("2026-09-17T14:00:00.000Z"), // 16:00 Europe/Berlin
      endAt: new Date("2026-09-17T15:30:00.000Z"), // 17:30 Europe/Berlin
    });
    const out = applyOptimisticChanges(
      later,
      "all",
      changes({
        start_at: "2026-09-10T16:00:00.000Z", // 18:00 Europe/Berlin
        end_at: "2026-09-10T17:30:00.000Z", // 19:30 Europe/Berlin
      }),
    );
    expect(out.occurrenceDate).toBe("2026-09-17");
    const berlinStart = instantToFloating(out.startAt, "Europe/Berlin");
    expect(berlinStart.getUTCHours()).toBe(18);
    expect(berlinStart.getUTCDate()).toBe(17);
  });

  test("erhält die Dauer und verankert endAt am Occurrence-Datum, nicht am changes-Datum", () => {
    // Occurrence auf 2026-09-17, changes auf 2026-09-10 datiert.
    // Eine falsche literale Übernahme würde endAt auf den 10. setzen — genau das,
    // das diese Behauptung reißt. Der korrekte Weg: Tageszeit aus newEnd übernehmen,
    // aber Datum von startAt bewahren.
    const later = occ({
      occurrenceDate: "2026-09-17",
      startAt: new Date("2026-09-17T14:00:00.000Z"), // 16:00 Europe/Berlin
      endAt: new Date("2026-09-17T15:30:00.000Z"), // 17:30 Europe/Berlin
    });
    const out = applyOptimisticChanges(
      later,
      "all",
      changes({
        start_at: "2026-09-10T16:00:00.000Z", // 18:00 Europe/Berlin
        end_at: "2026-09-10T17:30:00.000Z", // 19:30 Europe/Berlin
      }),
    );
    expect(out.endAt.getTime() - out.startAt.getTime()).toBe(90 * 60 * 1000);
    expect(instantToFloating(out.endAt, "Europe/Berlin").getUTCDate()).toBe(17);
  });

  test("patcht auch die Beschreibung — der Server schreibt sie auf den Master", () => {
    const out = applyOptimisticChanges(occ(), "all", changes({ description: "Neue Notiz" }));
    expect(out.description).toBe("Neue Notiz");
  });
});

// ── Schreibpfad rechnet in der Zone des Termins (ADR-034) ──────────────────
// `mergeDateAndTimeOfDay` (damals noch `withTimeOfDay`, inline in dieser Datei)
// nahm die Tageszeit bisher mit lokalen Gettern. Dieselbe
// Konstellation wie beim `anchoredChanges`-Pendant in `recurrence.test.ts`:
// die angezeigte Occurrence liegt am 27.10.2026 (nach Berlins
// Zeitumstellung, CET), die soeben gespeicherte Eingabe stammt vom 06.10.
// (davor, CEST) — beide 18:00 Ortszeit, „unveränderte Eingabe" beim
// Bearbeiten der ersten Occurrence mit Scope „alle". Unter
// `TZ=Europe/Berlin` blieb das zufällig richtig, unter
// `TZ=America/New_York` (kein Wechsel im Umrechnungszeitraum) rutschte die
// angezeigte Occurrence eine Stunde. Nachgerechnet und belegt (siehe
// `task-4-report.md`) — dieser Test hält nur noch die grüne (gefixte) Seite
// fest.
describe("applyOptimisticChanges · Serie mit Scope `all` über eine Zeitumstellung hinweg (ADR-034)", () => {
  test("die angezeigte Occurrence behält ihre Berliner Wandzeit", () => {
    const displayed = occ({
      occurrenceDate: "2026-10-27",
      // Di, 27.10.2026, 18:00–19:00 Europe/Berlin (CET, +1 h — nach der
      // Umstellung).
      startAt: new Date("2026-10-27T17:00:00.000Z"),
      endAt: new Date("2026-10-27T18:00:00.000Z"),
    });
    // Der Nutzer hat die Occurrence vom 06.10. geöffnet und ohne Änderung mit
    // Scope „alle" gespeichert: 18:00–19:00 Europe/Berlin (CEST, +2 h — vor
    // der Umstellung).
    const out = applyOptimisticChanges(
      displayed,
      "all",
      changes({
        start_at: "2026-10-06T16:00:00.000Z",
        end_at: "2026-10-06T17:00:00.000Z",
      }),
    );
    // Datum bleibt das der angezeigten Occurrence (27.10.), Uhrzeit bleibt
    // 18:00–19:00 Berlin — unter jeder Runner-Zone. Vor dem Fix lieferte das
    // nur unter `TZ=Europe/Berlin` diesen Wert; unter `TZ=America/New_York`
    // kam `"2026-10-27T16:00:00.000Z"` (17:00 statt 18:00 Berlin) heraus.
    expect(out.occurrenceDate).toBe("2026-10-27");
    expect(out.startAt.toISOString()).toBe("2026-10-27T17:00:00.000Z");
    expect(out.endAt.toISOString()).toBe("2026-10-27T18:00:00.000Z");
  });
});

describe("applyOptimisticChanges · Serie mit Scope `this`", () => {
  test("übernimmt die Literalzeiten der Exception", () => {
    const out = applyOptimisticChanges(occ(), "this", changes());
    expect(out.startAt.getHours()).toBe(18);
    expect(out.isException).toBe(true);
  });

  test("patcht die Beschreibung — seit ADR-035 überlebt sie den Weg", () => {
    // Bis ADR-035 wurde sie hier bewusst verschluckt: `applyOverride` kannte
    // den Key nicht, `expandEvents` las `description` immer von der
    // Master-Zeile, und sie zu zeigen hieß, sie eine Sekunde später vom
    // Refetch wegnehmen zu lassen. Seit der Override-Vertrag das Feld führt,
    // zeigt der Refetch denselben Wert — die Ausnahme ist damit hinfällig.
    const out = applyOptimisticChanges(
      occ(),
      "this",
      changes({ title: "Neuer Titel", description: "Neue Notiz" }),
    );
    expect(out.title).toBe("Neuer Titel");
    expect(out.description).toBe("Neue Notiz");
  });
});

describe("applyOptimisticChanges · Einzeltermin", () => {
  const single = occ({
    isRecurring: false,
    rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
  });

  test("verschiebt sich auf ein neues Datum, statt auf dem alten zu bleiben", () => {
    // Beim Einzeltermin ändert `scope: "this"` die Master-Zeile; eine
    // Datumsänderung im Formular verschiebt den Termin also wirklich.
    const moved = changes({
      start_at: new Date("2026-09-24T18:00:00").toISOString(),
      end_at: new Date("2026-09-24T19:30:00").toISOString(),
    });
    const out = applyOptimisticChanges(single, "this", moved);
    expect(out.occurrenceDate).toBe("2026-09-24");
    expect(out.startAt.getDate()).toBe(24);
  });

  test("patcht die Beschreibung — es gibt keine Exception", () => {
    const out = applyOptimisticChanges(single, "this", changes({ description: "Neue Notiz" }));
    expect(out.description).toBe("Neue Notiz");
  });
});

/** Eine minimale Master-Zeile in der Form, die `fetchEventsInRange` liefert. */
function row(partial: Partial<EventWithRelations> = {}): EventWithRelations {
  return {
    id: "e9",
    family_id: "f1",
    type_id: "t1",
    child_id: null,
    parent_id: null,
    title: "Elternabend",
    description: null,
    location: null,
    start_at: new Date("2026-10-01T19:00:00").toISOString(),
    end_at: new Date("2026-10-01T20:30:00").toISOString(),
    all_day: false,
    timezone: "Europe/Berlin",
    rrule_freq: "weekly",
    rrule_interval: 1,
    // Bewusst `null`: Die Tests prüfen die Overlay-Komposition, nicht die
    // Wochentags-Konvention der Spalte (`rrule.ts` rechnet sie mit `n - 1`
    // um). Ohne Einschränkung wiederholt sich die Regel schlicht ab dem
    // Startdatum — 01.10. und 08.10., unabhängig davon.
    rrule_byweekday: null,
    rrule_count: 2,
    rrule_until: null,
    created_by: null,
    created_at: new Date("2026-09-01T00:00:00").toISOString(),
    updated_at: new Date("2026-09-01T00:00:00").toISOString(),
    event_types: null,
    event_exceptions: [],
    ...partial,
  };
}

/**
 * Ein Stub statt des echten `expandEvents`: Diese Tests prüfen, dass die
 * synthetische Zeile **durch** den Expander geht — nicht, was er daraus macht.
 * Der Test darunter benutzt dafür den echten.
 */
function expandStub(rows: EventWithRelations[]): CalendarOccurrence[] {
  return rows.flatMap((r) => [
    occ({ eventId: r.id, occurrenceKey: "2026-10-01", occurrenceDate: "2026-10-01" }),
    occ({ eventId: r.id, occurrenceKey: "2026-10-08", occurrenceDate: "2026-10-08" }),
  ]);
}

// `visibleOccurrences` ohne Löschungen und mit Einträgen „unterwegs" — die
// gelten in jeder Ansicht, der Datenstand spielt für die Tests darunter keine
// Rolle.
function overlay(
  expanded: CalendarOccurrence[],
  optimistic: readonly OptimisticEvent[],
  expand: (rows: EventWithRelations[]) => CalendarOccurrence[] = expandStub,
): CalendarOccurrence[] {
  return visibleOccurrences({
    expanded,
    view: { dataUpdatedAt: 0, rows: undefined },
    pending: [],
    optimistic,
    expand,
  });
}

describe("visibleOccurrences", () => {
  test("gibt bei leerer Liste dieselbe Referenz zurück", () => {
    const input = [occ()];
    expect(overlay(input, [])).toBe(input);
  });

  test("patcht eine betroffene Occurrence und lässt die übrigen unberührt", () => {
    const a = occ({ occurrenceDate: "2026-09-10" });
    const b = occ({ eventId: "e2", occurrenceDate: "2026-09-10" });
    const out = overlay(
      [a, b],
      [
        {
          id: "o1",
          kind: "update",
          eventId: "e1",
          occurrenceKey: "2026-09-10",
          scope: "this",
          changes: changes({ title: "Geändert" }),
          savedAt: null,
        },
      ],
    );
    expect(out[0].title).toBe("Geändert");
    expect(out[1]).toBe(b);
  });

  test("schickt eine Create-Zeile durch den Expander", () => {
    const out = overlay(
      [],
      [{ id: "o1", kind: "create", row: row(), serverId: "e-neu", savedAt: null }],
    );
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.occurrenceDate)).toEqual(["2026-10-01", "2026-10-08"]);
  });

  test("mehrere Update-Einträge auf derselben Occurrence wirken nacheinander", () => {
    // Vor ADR-034 matchte dieser Test über das (bei jedem Patch wandernde)
    // Anzeige-Datum: o1 verschob den Einzeltermin auf ein neues Datum, o2 trug
    // exakt dieses neue Datum und fand die Occurrence dadurch wieder. Das war
    // genau die Verwechslungsgefahr, die ADR-034 behebt — zwei verschiedene
    // Occurrences könnten zufällig auf demselben Anzeige-Datum landen.
    //
    // Jetzt tragen beide Einträge denselben `occurrenceKey` — dieselbe
    // Occurrence, zweimal bearbeitet, bevor die erste Mutation abgeschlossen
    // ist (derselbe Fall, den `EventEditScreen` erzeugt, wenn der Nutzer die
    // gerade optimistisch verschobene Occurrence sofort erneut öffnet: der
    // Route-Parameter `occ` trägt weiterhin ihren unveränderten Schlüssel).
    // o2 findet sie über die stabile Identität, nicht über die Position.
    const single = occ({
      isRecurring: false,
      rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
    });
    const out = overlay(
      [single],
      [
        {
          id: "o1",
          kind: "update",
          eventId: "e1",
          occurrenceKey: "2026-09-10",
          scope: "this",
          changes: changes({
            title: "Teste nach o1",
            start_at: new Date("2026-09-24T18:00:00").toISOString(),
            end_at: new Date("2026-09-24T19:30:00").toISOString(),
          }),
          savedAt: null,
        },
        {
          id: "o2",
          kind: "update",
          eventId: "e1",
          occurrenceKey: "2026-09-10",
          scope: "this",
          changes: changes({
            title: "o2 hat gematcht",
            start_at: new Date("2026-09-30T18:00:00").toISOString(),
            end_at: new Date("2026-09-30T19:30:00").toISOString(),
          }),
          savedAt: null,
        },
      ],
    );
    // Wenn sequenziell: o1 verschiebt auf den 24.09. und setzt den Titel, o2
    // findet dieselbe Occurrence über `occurrenceKey` wieder (unabhängig davon,
    // wohin o1 sie optisch verschoben hat) und verschiebt sie ein zweites Mal,
    // auf den 30.09. — ein falsches „nur den letzten anwenden" träfe hier
    // dieselbe Occurrence, ein falsches „o2 findet sie nicht mehr" ließe sie
    // am 24.09. stehen.
    const found = out.find((o) => o.eventId === "e1");
    expect(found?.title).toBe("o2 hat gematcht");
    expect(found?.occurrenceDate).toBe("2026-09-30");
  });
});

describe("visibleOccurrences mit dem echten expandEvents", () => {
  const theme = lightTheme;

  test("ein neu angelegter Serientermin erscheint mit allen Occurrences im Fenster", () => {
    // Trüge der Eintrag eine fertige Occurrence, erschiene die Serie nur mit
    // ihrer ersten, und der Rest poppte beim Refetch nach — genau das Flackern,
    // gegen das dieses Feature antritt.
    const start = new Date("2026-09-25T00:00:00");
    const end = new Date("2026-10-31T00:00:00");
    const out = overlay(
      [],
      [{ id: "o1", kind: "create", row: row(), serverId: "e-neu", savedAt: null }],
      (rows) => expandEvents(rows, start, end, theme),
    );
    // rrule_count: 2 → zwei wöchentliche Termine ab dem 01.10.
    expect(out.map((o) => o.occurrenceDate)).toEqual(["2026-10-01", "2026-10-08"]);
  });

  test("ein Termin außerhalb des Fensters erscheint nicht", () => {
    // Die Range-Grenze fällt aus `expandEvents` ab; der Test hält sie fest,
    // damit eine spätere Umstellung sie nicht verliert.
    const start = new Date("2026-11-01T00:00:00");
    const end = new Date("2026-11-30T00:00:00");
    const out = overlay(
      [],
      [{ id: "o1", kind: "create", row: row(), serverId: "e-neu", savedAt: null }],
      (rows) => expandEvents(rows, start, end, theme),
    );
    expect(out).toHaveLength(0);
  });
});

describe("Reihenfolge der beiden Overlays", () => {
  test("eine zugleich bearbeitete und gelöschte Occurrence ist weg (scope: all)", () => {
    // Ein Update kann eine bereits gefilterte Occurrence nicht zurückbringen,
    // weil der Patch-Schritt von `visibleOccurrences` jede Occurrence höchstens
    // durch ihre gepatchte Fassung ersetzt und nie Einträge hinzufügt. Daher ist die
    // Reihenfolge (Patch vor Delete oder umgekehrt) folgenlos — das Ergebnis
    // ist in beiden Fällen leer. Wir halten diesen Test trotzdem, weil die
    // Aussage („eine Löschung gewinnt gegen eine gleichzeitige Bearbeitung")
    // richtig ist und diese Eigenschaft wert, festgehalten zu werden.
    //
    // ABER: Bei `scope: "this"` auf einem Einzeltermin, der sich verschiebt,
    // wird dieses Testen kritisch — siehe Test unten.
    const patched = overlay(
      [occ()],
      [
        {
          id: "o1",
          kind: "update",
          eventId: "e1",
          occurrenceKey: "2026-09-10",
          scope: "all",
          changes: changes({ title: "Geändert" }),
          savedAt: null,
        },
      ],
    );
    expect(patched).toHaveLength(1);
    const out = withoutPendingDeletes(patched, [
      { eventId: "e1", occurrenceKey: "2026-09-10", scope: "all" },
    ]);
    expect(out).toHaveLength(0);
  });

  test("eine verschobene und gleichzeitig gelöschte Occurrence bleibt verdeckt, gleich in welcher Reihenfolge", () => {
    // Vor ADR-034 verglich `hidesOccurrence` gegen das aufgelöste Anzeigedatum,
    // und ein `this`-Scope-Update, das den Termin verschiebt, schrieb genau
    // dieses Feld neu — der Filter musste deshalb **vor** dem Patch laufen,
    // sonst hätte er das neue Datum gegen das alte verglichen, das die offene
    // Löschung trägt, und die Löschung hätte nicht mehr gegriffen.
    //
    // Seit `hidesOccurrence` und `patchesOccurrence` beide gegen `occurrenceKey`
    // vergleichen — ein Wert, den `applyOptimisticChanges` nie neu berechnet —
    // kommutieren Filter und Patch für diesen Fall: beide Reihenfolgen kommen
    // zum selben Ergebnis. `visibleOccurrences` filtert trotzdem weiterhin vor
    // dem Patchen (eine Löschung gewinnt gegen ein gleichzeitiges Update,
    // ADR-027 Decision 9) — dieser Test hält beide Reihenfolgen als Regression
    // fest, nicht nur die, die die Pipeline tatsächlich fährt.

    const single = occ({
      isRecurring: false,
      rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
    });
    const pending = [{ eventId: "e1", occurrenceKey: "2026-09-10", scope: "this" as const }];
    const optimistic = [
      {
        id: "o1",
        kind: "update" as const,
        eventId: "e1",
        occurrenceKey: "2026-09-10",
        scope: "this" as const,
        changes: changes({
          start_at: new Date("2026-09-20T18:00:00").toISOString(),
          end_at: new Date("2026-09-20T19:30:00").toISOString(),
        }),
        savedAt: null,
      },
    ];

    // Tatsächliche Pipeline (Filter vor Patch) — über `visibleOccurrences`.
    const result = visibleOccurrences({
      expanded: [single],
      view: { dataUpdatedAt: 0, rows: undefined },
      pending,
      optimistic,
      expand: expandStub,
    });
    expect(result).toHaveLength(0);

    // Umgekehrte Reihenfolge (Patch vor Filter) — kommt seit ADR-034 zum
    // selben Ergebnis, weil `occurrenceKey` den Patch unverändert übersteht.
    const patchedFirst = overlay([single], optimistic);
    // Belegt die Step-3-Invariante direkt an dieser Stelle: der Patch hat das
    // Anzeigedatum verschoben, aber `occurrenceKey` unangetastet gelassen —
    // ohne das wäre der Filter-Aufruf direkt darunter kein Beleg für
    // Kommutativität, sondern liefe blind ins Leere, falls der Patch-Schritt
    // aus irgendeinem Grund gar nichts mehr patchte.
    expect(patchedFirst[0].occurrenceDate).toBe("2026-09-20");
    expect(patchedFirst[0].occurrenceKey).toBe("2026-09-10");
    const patchedThenFiltered = withoutPendingDeletes(patchedFirst, pending);
    expect(patchedThenFiltered).toHaveLength(0);
  });
});

// ── Regel pro Ansicht (Spec 3.2) ───────────────────────────────────────────
// Gespeicherte Einträge tragen `savedAt: 1000`; eine Ansicht ist „älter" mit
// `dataUpdatedAt: 500`, „neuer" mit `2000`.
const SAVED_AT = 1000;
const OLDER = 500;
const NEWER = 2000;

// Ein Einzeltermin am 01.10., zonenexplizit gebaut: Sein `occurrenceKey`
// (Zone des Termins) bleibt unter jeder Runner-Zone `2026-10-01`, die
// Einträge unten treffen ihn dadurch verlässlich.
function singleRow(partial: Partial<EventWithRelations> = {}): EventWithRelations {
  return row({
    start_at: "2026-10-01T17:00:00.000Z", // 19:00 Europe/Berlin
    end_at: "2026-10-01T18:30:00.000Z", // 20:30 Europe/Berlin
    rrule_freq: null,
    rrule_count: null,
    ...partial,
  });
}

// Destrukturierte Defaults statt `??`: `savedAt: null` („unterwegs") muss
// durchkommen und darf nicht auf `SAVED_AT` fallen.
function createEntry({
  savedAt = SAVED_AT,
  row: overlayRow = singleRow({ id: "optimistic-1" }),
}: { savedAt?: number | null; row?: EventWithRelations } = {}): OptimisticEvent {
  return { id: "o1", kind: "create", row: overlayRow, serverId: "e-neu", savedAt };
}

function updateEntry({
  eventId = "e9",
  savedAt = SAVED_AT,
}: { eventId?: string; savedAt?: number | null } = {}): OptimisticEvent {
  return {
    id: "o2",
    kind: "update",
    eventId,
    occurrenceKey: "2026-10-01",
    scope: "this",
    changes: changes({
      title: "Elternabend neu",
      start_at: "2026-10-01T17:00:00.000Z",
      end_at: "2026-10-01T18:30:00.000Z",
      location: null,
      description: null,
    }),
    savedAt,
  };
}

function deleteEntry({
  eventId = "e9",
  savedAt = SAVED_AT,
}: { eventId?: string; savedAt?: number | null } = {}): OptimisticEvent {
  return { id: "o3", kind: "delete", eventId, occurrenceKey: "2026-10-01", scope: "this", savedAt };
}

// Die Range-Fenster von Oktober und November, wie `useFamilyEvents` sie
// aufspannt (Monat ± 7 Tage). Der 30.10. liegt in beiden.
const expandOctober = (rows: EventWithRelations[]) =>
  expandEvents(
    rows,
    new Date("2026-09-24T00:00:00.000Z"),
    new Date("2026-11-08T00:00:00.000Z"),
    lightTheme,
  );
const expandNovember = (rows: EventWithRelations[]) =>
  expandEvents(
    rows,
    new Date("2026-10-25T00:00:00.000Z"),
    new Date("2026-12-08T00:00:00.000Z"),
    lightTheme,
  );

// Baut nur die Eingabe einer Ansicht — `expanded` aus ihren eigenen Zeilen,
// wie der Hook es tut. Die Pipeline darunter ist die echte.
function show(
  view: EventsView,
  optimistic: readonly OptimisticEvent[],
  pending: readonly PendingEventDelete[] = [],
  expand: (rows: EventWithRelations[]) => CalendarOccurrence[] = expandOctober,
): CalendarOccurrence[] {
  return visibleOccurrences({
    expanded: view.rows ? expand([...view.rows]) : [],
    view,
    pending,
    optimistic,
    expand,
  });
}

const titles = (occurrences: CalendarOccurrence[]) => occurrences.map((o) => o.title);

describe("appliesToView", () => {
  // Alle drei Arten: Bis auf die Zuordnung über die echte Id hängt die Regel
  // nicht an der Art des Eintrags.
  const allKinds = (savedAt: number | null) => [
    createEntry({ savedAt }),
    updateEntry({ savedAt }),
    deleteEntry({ savedAt }),
  ];
  // Serverdaten, die den neuen Termin (`e-neu`) noch nicht kennen.
  const rows = [singleRow()];

  test("unterwegs gilt ein Eintrag in jeder Ansicht", () => {
    for (const entry of allKinds(null)) {
      expect(appliesToView(entry, { dataUpdatedAt: OLDER, rows })).toBe(true);
      expect(appliesToView(entry, { dataUpdatedAt: NEWER, rows })).toBe(true);
      expect(appliesToView(entry, { dataUpdatedAt: 0, rows: undefined })).toBe(true);
    }
  });

  test("gespeichert gilt er in einer Ansicht ohne Serverdaten", () => {
    for (const entry of allKinds(SAVED_AT)) {
      expect(appliesToView(entry, { dataUpdatedAt: 0, rows: undefined })).toBe(true);
    }
  });

  test("gespeichert gilt er, bis die Ansicht Daten von nach dem Speichern hat", () => {
    for (const entry of allKinds(SAVED_AT)) {
      expect(appliesToView(entry, { dataUpdatedAt: 999, rows })).toBe(true);
      // Gleichstand zählt als älter: Daten aus derselben Millisekunde stammen
      // aus einem Laden, das vor dem Speichern begann.
      expect(appliesToView(entry, { dataUpdatedAt: 1000, rows })).toBe(true);
      expect(appliesToView(entry, { dataUpdatedAt: 1001, rows })).toBe(false);
    }
  });

  test("ein Create weicht der Serverzeile mit seiner echten Id, in jeder Phase", () => {
    // Deckt ein Laden ab, das den Termin schon trägt, aber vor dem Speichern
    // ankam — etwa vom eigenen Realtime-Echo angestoßen.
    const withServerRow = { dataUpdatedAt: OLDER, rows: [singleRow(), singleRow({ id: "e-neu" })] };
    expect(appliesToView(createEntry({ savedAt: null }), withServerRow)).toBe(false);
    expect(appliesToView(createEntry({ savedAt: SAVED_AT }), withServerRow)).toBe(false);
  });
});

describe("visibleOccurrences · Regel pro Ansicht", () => {
  test("gespeicherter Create: die ältere Ansicht zeigt die Overlay-Zeile, die neuere die Serverzeile", () => {
    const older = show({ dataUpdatedAt: OLDER, rows: [] }, [createEntry()]);
    expect(older).toHaveLength(1);
    expect(older[0].eventId).toMatch(/^optimistic-/);

    const newer = show({ dataUpdatedAt: NEWER, rows: [singleRow({ id: "e-neu" })] }, [
      createEntry(),
    ]);
    expect(newer).toHaveLength(1);
    expect(newer[0].eventId).toBe("e-neu");
  });

  test("gespeichertes Update: die ältere Ansicht zeigt die Änderung, die neuere den Server", () => {
    // Die neuere Ansicht trägt bewusst den alten Titel, etwa weil jemand ihn
    // danach zurückgeändert hat: Dort überstimmt der Eintrag nichts mehr.
    expect(titles(show({ dataUpdatedAt: OLDER, rows: [singleRow()] }, [updateEntry()]))).toEqual([
      "Elternabend neu",
    ]);
    expect(titles(show({ dataUpdatedAt: NEWER, rows: [singleRow()] }, [updateEntry()]))).toEqual([
      "Elternabend",
    ]);
  });

  test("gespeichertes Delete: die ältere Ansicht blendet aus, in der neueren gewinnt der Server", () => {
    expect(show({ dataUpdatedAt: OLDER, rows: [singleRow()] }, [deleteEntry()])).toEqual([]);
    expect(titles(show({ dataUpdatedAt: NEWER, rows: [singleRow()] }, [deleteEntry()]))).toEqual([
      "Elternabend",
    ]);
  });

  test("ein Delete mit der echten Id blendet die Overlay-Zeile eines gespeicherten Creates aus", () => {
    // Spec 3.2: in der Überlappung angelegt, vom November aus gelöscht, zurück
    // auf den Oktober, dessen Daten noch von vor dem Anlegen stammen.
    const out = show({ dataUpdatedAt: OLDER, rows: [] }, [
      createEntry(),
      deleteEntry({ eventId: "e-neu" }),
    ]);
    expect(out).toEqual([]);
  });

  test("ein Update mit der echten Id patcht die Overlay-Zeile, ihre angezeigte Id bleibt", () => {
    const out = show({ dataUpdatedAt: OLDER, rows: [] }, [
      createEntry(),
      updateEntry({ eventId: "e-neu" }),
    ]);
    expect(titles(out)).toEqual(["Elternabend neu"]);
    expect(out[0].eventId).toMatch(/^optimistic-/);
  });

  test("eine Löschung im Undo-Fenster trifft die Overlay-Zeile über die echte Id", () => {
    const out = show(
      { dataUpdatedAt: OLDER, rows: [] },
      [createEntry()],
      [{ eventId: "e-neu", occurrenceKey: "2026-10-01", scope: "this" }],
    );
    expect(out).toEqual([]);
  });

  test("Delete und Update auf dieselbe Occurrence: erst filtern, dann patchen, sie bleibt weg", () => {
    // Das Update steht im Store vor dem Delete — die Löschung gewinnt trotzdem.
    const out = show({ dataUpdatedAt: OLDER, rows: [singleRow()] }, [updateEntry(), deleteEntry()]);
    expect(out).toEqual([]);
  });

  test("ein Eintrag, zwei Ansichten mit verschiedenem Datenstand: jede zeigt den Termin genau einmal", () => {
    // Die Doppelanzeige aus Spec 1.2: Der Termin am 30.10. liegt in den Ranges
    // beider Monate. Der Kalender auf November hat nach dem Speichern neu
    // geladen und trägt die Serverzeile, das Dashboard auf Oktober wartet noch.
    const at = { start_at: "2026-10-30T17:00:00.000Z", end_at: "2026-10-30T18:30:00.000Z" };
    const entry = createEntry({ row: singleRow({ id: "optimistic-1", ...at }) });

    const october = show({ dataUpdatedAt: OLDER, rows: [] }, [entry], [], expandOctober);
    const november = show(
      { dataUpdatedAt: NEWER, rows: [singleRow({ id: "e-neu", ...at })] },
      [entry],
      [],
      expandNovember,
    );
    expect(october).toHaveLength(1);
    expect(november).toHaveLength(1);
  });

  test("gilt kein Eintrag und ist keine Löschung offen, kommt dieselbe Referenz zurück", () => {
    // „Kein Eintrag" heißt hier: keiner, der in **dieser** Ansicht gilt. Der
    // Fall ganz ohne Einträge steht oben unter `visibleOccurrences`.
    const view = { dataUpdatedAt: NEWER, rows: [singleRow()] };
    const expanded = expandOctober([singleRow()]);
    const out = visibleOccurrences({
      expanded,
      view,
      pending: [],
      optimistic: [updateEntry(), deleteEntry()],
      expand: expandOctober,
    });
    expect(out).toBe(expanded);
  });
});

describe("useOptimisticEventsStore", () => {
  // Über `clear()` statt `setState`: das räumt auch die Watchdog-Timer ab, die
  // sonst als offene Handles im Testlauf stehen blieben.
  afterEach(() => useOptimisticEventsStore.getState().clear());

  test("add gibt eine Id zurück, remove nimmt den Eintrag wieder heraus", () => {
    const store = () => useOptimisticEventsStore.getState();
    const id = store().add({
      kind: "update",
      eventId: "e1",
      occurrenceKey: "2026-09-10",
      scope: "all",
      changes: changes(),
    });
    expect(store().entries).toHaveLength(1);
    expect(store().entries[0]).toMatchObject({ id, kind: "update", eventId: "e1", savedAt: null });
    store().remove(id);
    expect(store().entries).toHaveLength(0);
  });

  test("zwei Einträge stören einander nicht", () => {
    const store = () => useOptimisticEventsStore.getState();
    const first = store().add({
      kind: "update",
      eventId: "e1",
      occurrenceKey: "2026-09-10",
      scope: "all",
      changes: changes(),
    });
    const second = store().add({
      kind: "update",
      eventId: "e2",
      occurrenceKey: "2026-09-10",
      scope: "all",
      changes: changes(),
    });
    expect(first).not.toBe(second);
    store().remove(first);
    expect(store().entries).toHaveLength(1);
    expect(store().entries[0].id).toBe(second);
    store().remove(second);
  });
});

// Aus UTC-Strings gebaut, nicht aus lokalen Date-Komponenten wie im Rest
// dieser Datei — seit Befund C (PR #121) vergleicht `canApplyOptimistically`
// in der übergebenen Terminzone (`Europe/Berlin` unten), nicht mehr in der
// Zone des Runners. Ein `new Date("2026-10-07T19:00:00")`-Literal (Wandzeit
// der **Runner**-Zone) ließe die Erwartung deshalb mit der Runner-Zone
// wandern — dasselbe Muster wie die Serienanker-Fixtures in
// `recurrence.test.ts`.
describe("canApplyOptimistically", () => {
  const base = { isRecurring: true, occurrenceKey: "2026-10-05", timezone: "Europe/Berlin" };

  test("`all` mit geändertem Datum bekommt keinen Eintrag", () => {
    // Der Server schreibt `changes.start_at` als neues `dtstart` — die ganze
    // Serie wandert. Das Overlay könnte nur die Tageszeit neu verankern und
    // zeigte damit die Nicht-Änderung genau der Eigenschaft, die der Nutzer
    // gerade geändert hat.
    const moved = changes({
      start_at: "2026-10-07T17:00:00.000Z", // 19:00 Europe/Berlin, 07.10.
      end_at: "2026-10-07T18:30:00.000Z", // 20:30 Europe/Berlin, 07.10.
    });
    expect(canApplyOptimistically({ ...base, scope: "all", changes: moved })).toBe(false);
    expect(canApplyOptimistically({ ...base, scope: "forward", changes: moved })).toBe(false);
  });

  test("`all` mit reiner Uhrzeit-Änderung bleibt optimistisch", () => {
    const retimed = changes({
      start_at: "2026-10-05T18:00:00.000Z", // 20:00 Europe/Berlin, 05.10.
      end_at: "2026-10-05T19:30:00.000Z", // 21:30 Europe/Berlin, 05.10.
    });
    expect(canApplyOptimistically({ ...base, scope: "all", changes: retimed })).toBe(true);
    expect(canApplyOptimistically({ ...base, scope: "forward", changes: retimed })).toBe(true);
  });

  // Befund C, PR #121: Der Vergleich muss in der **Terminzone** laufen, nicht
  // in der des Geräts/Runners — genau der Fall, in dem beide auseinanderfallen
  // können. Die Occurrence liegt Montagabend spät in Los Angeles; die neue
  // Uhrzeit bleibt in `America/Los_Angeles` auf demselben Kalendertag, fällt
  // in UTC (und in jeder Zone östlich davon — UTC, Berlin, New York) aber
  // schon auf den Folgetag. Ein Vergleich in irgendeiner dieser drei
  // Geräte-/Runner-Zonen verfehlte den Schlüssel "2026-09-10" unter jeder von
  // ihnen — der Test bleibt trotzdem unter allen dreien identisch grün, weil
  // die Implementierung die Runner-Zone gar nicht mehr liest.
  test("Terminzone ungleich Geräte-/Runner-Zone: reine Uhrzeit-Änderung in der Terminzone bleibt optimistisch", () => {
    const retimedInLA = changes({
      start_at: "2026-09-11T05:00:00.000Z", // 22:00 America/Los_Angeles, 10.09.
      end_at: "2026-09-11T06:00:00.000Z", // 23:00 America/Los_Angeles, 10.09.
    });
    expect(
      canApplyOptimistically({
        isRecurring: true,
        occurrenceKey: "2026-09-10",
        timezone: "America/Los_Angeles",
        scope: "all",
        changes: retimedInLA,
      }),
    ).toBe(true);
  });

  test("`this` und Einzeltermin dürfen auch das Datum verschieben", () => {
    // Beide schreiben Literalzeiten — die Exception bzw. die Master-Zeile —,
    // `applyOptimisticChanges` bildet die Verschiebung dort korrekt ab.
    const moved = changes({
      start_at: "2026-10-07T17:00:00.000Z", // 19:00 Europe/Berlin, 07.10.
      end_at: "2026-10-07T18:30:00.000Z", // 20:30 Europe/Berlin, 07.10.
    });
    expect(canApplyOptimistically({ ...base, scope: "this", changes: moved })).toBe(true);
    expect(
      canApplyOptimistically({ ...base, isRecurring: false, scope: "all", changes: moved }),
    ).toBe(true);
  });

  test("eine mitgeschickte Regeländerung bekommt keinen Eintrag", () => {
    // Der Server schreibt eine neue RRULE — welche Occurrences danach
    // existieren, kann das Overlay nicht vorhersagen. Selbst wenn `changes`
    // sonst harmlos ist (reine Uhrzeit, gleiches Datum), muss `recurrence`
    // allein schon blocken.
    const retimed = changes({
      start_at: "2026-10-05T18:00:00.000Z", // 20:00 Europe/Berlin, 05.10.
      end_at: "2026-10-05T19:30:00.000Z", // 21:30 Europe/Berlin, 05.10.
    });
    expect(
      canApplyOptimistically({
        ...base,
        scope: "all",
        changes: retimed,
        recurrence: recurrenceChanges(),
      }),
    ).toBe(false);
  });

  test("fehlendes oder `null` `recurrence` blockt nicht", () => {
    const retimed = changes({
      start_at: "2026-10-05T18:00:00.000Z", // 20:00 Europe/Berlin, 05.10.
      end_at: "2026-10-05T19:30:00.000Z", // 21:30 Europe/Berlin, 05.10.
    });
    expect(canApplyOptimistically({ ...base, scope: "all", changes: retimed })).toBe(true);
    expect(
      canApplyOptimistically({ ...base, scope: "all", changes: retimed, recurrence: null }),
    ).toBe(true);
  });
});

describe("isOptimisticEventId", () => {
  test("erkennt die synthetische Id eines Creates und keine echte", () => {
    expect(isOptimisticEventId("optimistic-7")).toBe(true);
    expect(isOptimisticEventId("6f1c0f0e-6b1a-4c2f-9d1a-9a1b2c3d4e5f")).toBe(false);
  });
});

describe("Watchdog", () => {
  afterEach(() => useOptimisticEventsStore.getState().clear());

  test("ein Eintrag, den niemand abräumt, verfällt von selbst", async () => {
    // Der Ausgang, den `onSettled` nicht abdeckt: Hinter einem Captive Portal
    // settelt der POST weder, noch lehnt er ab — `remove(id)` liefe nie, und der
    // nie gespeicherte Termin stünde für den Rest der Sitzung im Kalender.
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      useOptimisticEventsStore.getState().add(
        {
          kind: "update",
          eventId: "e1",
          occurrenceKey: "2026-09-10",
          scope: "all",
          changes: changes(),
        },
        5,
      );
      expect(useOptimisticEventsStore.getState().entries).toHaveLength(1);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(useOptimisticEventsStore.getState().entries).toHaveLength(0);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("`remove` räumt den Timer mit ab — kein Log im Normalfall", async () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const id = useOptimisticEventsStore.getState().add(
        {
          kind: "update",
          eventId: "e1",
          occurrenceKey: "2026-09-10",
          scope: "all",
          changes: changes(),
        },
        5,
      );
      useOptimisticEventsStore.getState().remove(id);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("`clear` leert den Store und lässt keinen Timer zurück", async () => {
    // Das ist der Abmelde-Pfad: `useSignOut` räumt Query-Cache, Pending-Deletes
    // und diesen Store, damit der Termin des Vorgängers nicht im Kalender des
    // nächsten Familienmitglieds steht.
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const store = useOptimisticEventsStore.getState();
      store.add({ kind: "create", row: row(), serverId: "e-neu" }, 5);
      store.add(
        {
          kind: "update",
          eventId: "e1",
          occurrenceKey: "2026-09-10",
          scope: "all",
          changes: changes(),
        },
        5,
      );
      expect(useOptimisticEventsStore.getState().entries).toHaveLength(2);
      useOptimisticEventsStore.getState().clear();
      expect(useOptimisticEventsStore.getState().entries).toHaveLength(0);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

// ── Phase „gespeichert" (§3.1 und §3.3 in
// docs/superpowers/specs/2026-10-29-kalender-cache-design.md) ──────────────
// Ein echter `QueryClient` statt eines Stubs: Ob ein Eintrag den Store verlässt,
// hängt an den Ereignissen des Query-Caches und an `cancelQueries`, und genau
// deren Verhalten in TanStack 5.105 sollen diese Tests festhalten.
const OCTOBER = calendarKeys.range("2026-09-24T00:00:00.000Z", "2026-11-08T00:00:00.000Z");
const NOVEMBER = calendarKeys.range("2026-10-25T00:00:00.000Z", "2026-12-08T00:00:00.000Z");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function updatePayload(): OptimisticUpdate {
  return {
    kind: "update",
    eventId: "e9",
    occurrenceKey: "2026-10-01",
    scope: "this",
    changes: changes({ title: "Elternabend neu" }),
  };
}

/** Ein Promise, das der Test von außen auflöst — das Laden „unterwegs". */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Phase „gespeichert"', () => {
  const store = () => useOptimisticEventsStore.getState();
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  // Erst der Store, dann der Cache: `clear()` beendet die Abos, bevor
  // `qc.clear()` seine „removed"-Ereignisse verschickt.
  afterEach(() => {
    store().clear();
    qc.clear();
  });

  test("Erfolg: gespeichert, Watchdog aus, Position bleibt", async () => {
    // Offline länger als der Watchdog: Ein gespeicherter Eintrag zeigt, was
    // gespeichert ist, und darf nicht nach 30 s verfallen.
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: Date.now() - 100 });
      const id = store().add(updatePayload(), 10);
      const other = store().add({ kind: "create", row: row(), serverId: "e-neu" });
      store().confirm(updatePayload(), qc.getQueryCache(), id);
      await sleep(20);
      expect(store().entries.map((entry) => entry.id)).toEqual([id, other]);
      expect(store().entries[0].savedAt).not.toBeNull();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("später Erfolg nach dem Watchdog: der Eintrag kommt gespeichert zurück", async () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: Date.now() - 100 });
      const id = store().add(updatePayload(), 10);
      await sleep(20);
      expect(store().entries).toEqual([]);

      store().confirm(updatePayload(), qc.getQueryCache(), id);
      expect(store().entries).toHaveLength(1);
      expect(store().entries[0].savedAt).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  test("später Erfolg nach `clear()`: nichts kommt zurück, kein Abo", () => {
    // Das Abmelden, während das Speichern unterwegs ist: `useSignOut` wartet
    // nicht auf laufende Mutationen, und die Range-Keys tragen keine Familie.
    // Käme der Eintrag zurück, stünde der Termin des Vorgängers im Kalender des
    // nächsten Kontos.
    qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: Date.now() - 100 });
    const id = store().add(updatePayload());
    store().clear();

    store().confirm(updatePayload(), qc.getQueryCache(), id);
    expect(store().entries).toEqual([]);
    expect(qc.getQueryCache().hasListeners()).toBe(false);
  });

  test("später Erfolg nach `remove(id)`: nichts kommt zurück, kein Abo", () => {
    qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: Date.now() - 100 });
    const id = store().add(updatePayload());
    store().remove(id);

    store().confirm(updatePayload(), qc.getQueryCache(), id);
    expect(store().entries).toEqual([]);
    expect(qc.getQueryCache().hasListeners()).toBe(false);
  });

  test("später Erfolg nach Watchdog und `clear()`: nichts kommt zurück", async () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: Date.now() - 100 });
      const id = store().add(updatePayload(), 10);
      await sleep(20);
      store().clear();

      store().confirm(updatePayload(), qc.getQueryCache(), id);
      expect(store().entries).toEqual([]);
      expect(qc.getQueryCache().hasListeners()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  test("später Erfolg nach Watchdog und `remove(id)`: nichts kommt zurück", async () => {
    // `remove` nach dem Watchdog ist `onError` einer Mutation, die doch noch
    // gescheitert ist.
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: Date.now() - 100 });
      const id = store().add(updatePayload(), 10);
      await sleep(20);
      store().remove(id);

      store().confirm(updatePayload(), qc.getQueryCache(), id);
      expect(store().entries).toEqual([]);
      expect(qc.getQueryCache().hasListeners()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  test("verlässt den Store erst, wenn keine Range-Query mehr alte Daten trägt", () => {
    // Ein Delete, das ohne `id` direkt gespeichert in den Store kommt.
    const before = Date.now() - 100;
    qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: before });
    qc.setQueryData(NOVEMBER, [singleRow()], { updatedAt: before });
    store().confirm(
      { kind: "delete", eventId: "e9", occurrenceKey: "2026-10-01", scope: "this" },
      qc.getQueryCache(),
    );
    const savedAt = store().entries[0]?.savedAt ?? Number.NaN;

    qc.setQueryData(NOVEMBER, [singleRow()], { updatedAt: savedAt + 100 });
    expect(store().entries).toHaveLength(1);

    qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: savedAt + 100 });
    expect(store().entries).toEqual([]);
  });

  test("eine Range-Query ohne Daten hält ihn, bis sie verworfen wird", () => {
    // Etwa ein erstes Laden, das scheiterte. `removeQueries` steht für `gcTime`.
    qc.getQueryCache().build(qc, { queryKey: OCTOBER });
    expect(
      qc
        .getQueryCache()
        .findAll({ queryKey: calendarKeys.eventsRoot })
        .map((query) => query.state.data),
    ).toEqual([undefined]);

    store().confirm(updatePayload(), qc.getQueryCache());
    expect(store().entries).toHaveLength(1);

    qc.removeQueries({ queryKey: OCTOBER });
    expect(store().entries).toEqual([]);
  });

  test("eine inaktive Range-Query mit alten Daten hält ihn, bis sie verworfen wird", () => {
    // Der Monat, in den der Nutzer nie zurückkehrt: kein Beobachter, also auch
    // kein Neuladen über `invalidateQueries`.
    qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: Date.now() - 100 });
    store().confirm(updatePayload(), qc.getQueryCache());
    expect(store().entries).toHaveLength(1);

    qc.removeQueries({ queryKey: OCTOBER });
    expect(store().entries).toEqual([]);
  });

  test("Create: eine ältere Ansicht mit der echten Id gibt ihn frei", () => {
    const before = Date.now() - 100;
    qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: before });
    store().confirm(
      { kind: "create", row: singleRow({ id: "optimistic-1" }), serverId: "e-neu" },
      qc.getQueryCache(),
    );
    expect(store().entries).toHaveLength(1);

    // Weiter älter als das Speichern, aber mit der Serverzeile — etwa vom
    // eigenen Realtime-Echo angestoßen.
    qc.setQueryData(OCTOBER, [singleRow(), singleRow({ id: "e-neu" })], { updatedAt: before });
    expect(store().entries).toEqual([]);
  });

  test("keine Range-Query im Cache: sofort weg, ohne Abo", () => {
    // Andere Kalender-Queries zählen nicht, nur die unter `eventsRoot`.
    qc.setQueryData(calendarKeys.types, []);
    qc.setQueryData(calendarKeys.one("e9"), singleRow());
    store().confirm(updatePayload(), qc.getQueryCache());
    expect(store().entries).toEqual([]);
    expect(qc.getQueryCache().hasListeners()).toBe(false);
  });

  test("`remove` beendet das Abo", () => {
    qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: Date.now() - 100 });
    store().confirm(updatePayload(), qc.getQueryCache());
    store().remove(store().entries[0].id);
    expect(qc.getQueryCache().hasListeners()).toBe(false);
  });

  test("`clear()` beendet die Abos: ein späteres Cache-Ereignis bringt nichts zurück", () => {
    // Das Abmelden mit gespeicherten Einträgen.
    qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: Date.now() - 100 });
    store().confirm(updatePayload(), qc.getQueryCache());
    expect(store().entries).toHaveLength(1);

    store().clear();
    expect(qc.getQueryCache().hasListeners()).toBe(false);
    expect(() => qc.setQueryData(NOVEMBER, [singleRow()])).not.toThrow();
    expect(store().entries).toEqual([]);
  });
});

describe("confirmEventSave", () => {
  const store = () => useOptimisticEventsStore.getState();
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => {
    store().clear();
    qc.clear();
  });

  test("ein vor dem Speichern begonnenes erstes Laden zählt nicht", async () => {
    // Kaltstart oder frisch gewischter Monat: Das Laden begann vor dem
    // Speichern und kann den Stand davor tragen. Ohne `cancelQueries` landete
    // es danach, zählte als „neuer" und gäbe den Eintrag frei.
    const first = deferred<EventWithRelations[]>();
    const loading = qc
      .fetchQuery({ queryKey: OCTOBER, queryFn: () => first.promise })
      .catch(() => undefined);
    const id = store().add(updatePayload());
    confirmEventSave(qc, { payload: updatePayload(), id });
    await sleep(5);
    first.resolve([singleRow()]);
    await loading;
    expect(qc.getQueryState(OCTOBER)?.data).toBeUndefined();
    expect(store().entries).toHaveLength(1);

    // Ein Beobachter lädt den Monat neu, nach dem Speichern: Das gibt frei.
    const observer = new QueryObserver(qc, {
      queryKey: OCTOBER,
      queryFn: () => Promise.resolve([singleRow()]),
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await sleep(5);
      expect(qc.getQueryState(OCTOBER)?.data).toHaveLength(1);
      expect(store().entries).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  test("ein vor dem Speichern begonnener Refetch schreibt nichts und zählt nicht", async () => {
    const before = Date.now() - 100;
    const oldRows = [singleRow()];
    qc.setQueryData(OCTOBER, oldRows, { updatedAt: before });
    const refetch = deferred<EventWithRelations[]>();
    const loading = qc
      .fetchQuery({ queryKey: OCTOBER, queryFn: () => refetch.promise })
      .catch(() => undefined);
    const id = store().add(updatePayload());
    confirmEventSave(qc, { payload: updatePayload(), id });
    await sleep(5);
    refetch.resolve([singleRow({ title: "Stand vor dem Speichern" })]);
    await loading;
    expect(qc.getQueryState(OCTOBER)?.dataUpdatedAt).toBe(before);
    expect(qc.getQueryState(OCTOBER)?.data).toBe(oldRows);
    expect(store().entries).toHaveLength(1);
  });

  // Diese beiden halten die Reihenfolge Abbrechen → Invalidieren fest: Vertauscht
  // bräche `cancelQueries` das Laden ab, das `invalidateQueries` gerade für die
  // aktive Ansicht gestartet hat, und der sichtbare Monat bliebe alt.
  test("eine aktive Ansicht mit alten Daten lädt nach dem Speichern neu", async () => {
    qc.setQueryData(OCTOBER, [singleRow()], { updatedAt: Date.now() - 100 });
    let calls = 0;
    const observer = new QueryObserver(qc, {
      queryKey: OCTOBER,
      queryFn: async () => {
        calls += 1;
        // Landet sicher nach `savedAt`, auch wenn alles in einer Millisekunde läuft.
        await sleep(2);
        return [singleRow({ title: "Stand nach dem Speichern" })];
      },
      // Kein eigenes Laden beim Abonnieren: Neu laden soll hier nur `confirmEventSave`.
      refetchOnMount: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      const id = store().add(updatePayload());
      confirmEventSave(qc, { payload: updatePayload(), id });
      const savedAt = store().entries[0]?.savedAt ?? Number.NaN;
      await sleep(10);
      expect(calls).toBe(1);
      expect(qc.getQueryState(OCTOBER)?.dataUpdatedAt).toBeGreaterThan(savedAt);
      expect(store().entries).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  test("eine aktive Ansicht mitten im ersten Laden lädt nach dem Speichern neu", async () => {
    const first = deferred<EventWithRelations[]>();
    let calls = 0;
    const observer = new QueryObserver(qc, {
      queryKey: OCTOBER,
      queryFn: async () => {
        calls += 1;
        if (calls === 1) return first.promise;
        await sleep(2);
        return [singleRow({ title: "Stand nach dem Speichern" })];
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      expect(qc.getQueryState(OCTOBER)?.fetchStatus).toBe("fetching");
      const id = store().add(updatePayload());
      confirmEventSave(qc, { payload: updatePayload(), id });
      const savedAt = store().entries[0]?.savedAt ?? Number.NaN;
      first.resolve([singleRow({ title: "Stand vor dem Speichern" })]);
      await sleep(10);
      expect(calls).toBe(2);
      expect(qc.getQueryState(OCTOBER)?.dataUpdatedAt).toBeGreaterThan(savedAt);
      expect(qc.getQueryData<EventWithRelations[]>(OCTOBER)?.[0]?.title).toBe(
        "Stand nach dem Speichern",
      );
      expect(store().entries).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  test("invalidiert `eventsRoot` und `oneRoot`, nicht `types` und `reminders`", () => {
    qc.setQueryData(OCTOBER, [singleRow()]);
    qc.setQueryData(calendarKeys.one("e9"), singleRow());
    qc.setQueryData(calendarKeys.types, []);
    qc.setQueryData(calendarKeys.reminders("e9"), []);
    confirmEventSave(qc, { payload: updatePayload() });
    expect(qc.getQueryState(OCTOBER)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(calendarKeys.one("e9"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(calendarKeys.types)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(calendarKeys.reminders("e9"))?.isInvalidated).toBe(false);
  });

  test("ohne Eintrag lädt es nur neu und gibt nichts zurück", () => {
    // Etwa ein Update ohne Overlay-Eintrag (`canApplyOptimistically` war falsch).
    qc.setQueryData(OCTOBER, [singleRow()]);
    store().add(updatePayload());
    const entries = store().entries;
    expect(confirmEventSave(qc, undefined)).toBeUndefined();
    expect(store().entries).toBe(entries);
    expect(qc.getQueryState(OCTOBER)?.isInvalidated).toBe(true);
  });
});
