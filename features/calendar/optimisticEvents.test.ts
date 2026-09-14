import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { lightTheme } from "@/design-system";

import type { EventWithRelations } from "./expand";
import type { EventChanges, RecurrenceChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

import { expandEvents } from "./expand";
import {
  applyOptimisticChanges,
  canApplyOptimistically,
  isOptimisticEventId,
  patchesOccurrence,
  useOptimisticEventsStore,
  visibleOccurrences,
  withOptimistic,
} from "./optimisticEvents";
import { withoutPendingDeletes } from "./pendingDeletes";
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
  // `withTimeOfDay` rechnet seit ADR-034 in `occurrence.timezone`, eine
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
// `withTimeOfDay` nahm die Tageszeit bisher mit lokalen Gettern. Dieselbe
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

  test("lässt die Beschreibung stehen, obwohl der Server sie schreibt", () => {
    // `expandEvents` liest `description` immer von der Master-Zeile, auch bei
    // einer `modified`-Exception — `applyOverride` kennt das Feld nicht. Ein
    // Patch, der sie zeigte, nähme der Refetch eine Sekunde später wieder weg:
    // genau das Flackern, das dieses Feature abstellen soll.
    const out = applyOptimisticChanges(
      occ(),
      "this",
      changes({ title: "Neuer Titel", description: "Neue Notiz" }),
    );
    expect(out.title).toBe("Neuer Titel");
    expect(out.description).toBe("Trikot einpacken");
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

describe("withOptimistic", () => {
  test("gibt bei leerer Liste dieselbe Referenz zurück", () => {
    const input = [occ()];
    expect(withOptimistic(input, [], expandStub)).toBe(input);
  });

  test("patcht eine betroffene Occurrence und lässt die übrigen unberührt", () => {
    const a = occ({ occurrenceDate: "2026-09-10" });
    const b = occ({ eventId: "e2", occurrenceDate: "2026-09-10" });
    const out = withOptimistic(
      [a, b],
      [
        {
          id: "o1",
          kind: "update",
          eventId: "e1",
          occurrenceKey: "2026-09-10",
          scope: "this",
          changes: changes({ title: "Geändert" }),
        },
      ],
      expandStub,
    );
    expect(out[0].title).toBe("Geändert");
    expect(out[1]).toBe(b);
  });

  test("schickt eine Create-Zeile durch den Expander", () => {
    const out = withOptimistic([], [{ id: "o1", kind: "create", row: row() }], expandStub);
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
    const out = withOptimistic(
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
        },
      ],
      expandStub,
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

describe("withOptimistic mit dem echten expandEvents", () => {
  const theme = lightTheme;

  test("ein neu angelegter Serientermin erscheint mit allen Occurrences im Fenster", () => {
    // Trüge der Eintrag eine fertige Occurrence, erschiene die Serie nur mit
    // ihrer ersten, und der Rest poppte beim Refetch nach — genau das Flackern,
    // gegen das dieses Feature antritt.
    const start = new Date("2026-09-25T00:00:00");
    const end = new Date("2026-10-31T00:00:00");
    const out = withOptimistic([], [{ id: "o1", kind: "create", row: row() }], (rows) =>
      expandEvents(rows, start, end, theme),
    );
    // rrule_count: 2 → zwei wöchentliche Termine ab dem 01.10.
    expect(out.map((o) => o.occurrenceDate)).toEqual(["2026-10-01", "2026-10-08"]);
  });

  test("ein Termin außerhalb des Fensters erscheint nicht", () => {
    // Die Range-Grenze fällt aus `expandEvents` ab; der Test hält sie fest,
    // damit eine spätere Umstellung sie nicht verliert.
    const start = new Date("2026-11-01T00:00:00");
    const end = new Date("2026-11-30T00:00:00");
    const out = withOptimistic([], [{ id: "o1", kind: "create", row: row() }], (rows) =>
      expandEvents(rows, start, end, theme),
    );
    expect(out).toHaveLength(0);
  });
});

describe("Reihenfolge der beiden Overlays", () => {
  test("eine zugleich bearbeitete und gelöschte Occurrence ist weg (scope: all)", () => {
    // Ein Update kann eine bereits gefilterte Occurrence nicht zurückbringen,
    // weil der Patch-Zweig von `withOptimistic` nur per `.map()` über die
    // bestehende Liste arbeitet und nie Einträge hinzufügt. Daher ist die
    // Reihenfolge (Patch vor Delete oder umgekehrt) folgenlos — das Ergebnis
    // ist in beiden Fällen leer. Wir halten diesen Test trotzdem, weil die
    // Aussage („eine Löschung gewinnt gegen eine gleichzeitige Bearbeitung")
    // richtig ist und diese Eigenschaft wert, festgehalten zu werden.
    //
    // ABER: Bei `scope: "this"` auf einem Einzeltermin, der sich verschiebt,
    // wird dieses Testen kritisch — siehe Test unten.
    const patched = withOptimistic(
      [occ()],
      [
        {
          id: "o1",
          kind: "update",
          eventId: "e1",
          occurrenceKey: "2026-09-10",
          scope: "all",
          changes: changes({ title: "Geändert" }),
        },
      ],
      expandStub,
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
    // dem Patchen (ein optimistischer **Create**-Eintrag umgeht den Filter
    // strukturell, siehe der Test oben) — dieser Test hält beide Reihenfolgen
    // als Regression fest, nicht nur die, die die Pipeline tatsächlich fährt.

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
      },
    ];

    // Tatsächliche Pipeline (Filter vor Patch) — über `visibleOccurrences`.
    const result = visibleOccurrences({
      expanded: [single],
      pending,
      optimistic,
      expand: expandStub,
    });
    expect(result).toHaveLength(0);

    // Umgekehrte Reihenfolge (Patch vor Filter) — kommt seit ADR-034 zum
    // selben Ergebnis, weil `occurrenceKey` den Patch unverändert übersteht.
    const patchedFirst = withOptimistic([single], optimistic, expandStub);
    // Belegt die Step-3-Invariante direkt an dieser Stelle: der Patch hat das
    // Anzeigedatum verschoben, aber `occurrenceKey` unangetastet gelassen —
    // ohne das wäre der Filter-Aufruf direkt darunter kein Beleg für
    // Kommutativität, sondern liefe blind ins Leere, falls `withOptimistic`
    // aus irgendeinem Grund gar nichts mehr patchte.
    expect(patchedFirst[0].occurrenceDate).toBe("2026-09-20");
    expect(patchedFirst[0].occurrenceKey).toBe("2026-09-10");
    const patchedThenFiltered = withoutPendingDeletes(patchedFirst, pending);
    expect(patchedThenFiltered).toHaveLength(0);
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
    expect(store().entries[0]).toMatchObject({ id, kind: "update", eventId: "e1" });
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

describe("canApplyOptimistically", () => {
  const base = { isRecurring: true, occurrenceKey: "2026-10-05" };

  test("`all` mit geändertem Datum bekommt keinen Eintrag", () => {
    // Der Server schreibt `changes.start_at` als neues `dtstart` — die ganze
    // Serie wandert. Das Overlay könnte nur die Tageszeit neu verankern und
    // zeigte damit die Nicht-Änderung genau der Eigenschaft, die der Nutzer
    // gerade geändert hat.
    const moved = changes({
      start_at: new Date("2026-10-07T19:00:00").toISOString(),
      end_at: new Date("2026-10-07T20:30:00").toISOString(),
    });
    expect(canApplyOptimistically({ ...base, scope: "all", changes: moved })).toBe(false);
    expect(canApplyOptimistically({ ...base, scope: "forward", changes: moved })).toBe(false);
  });

  test("`all` mit reiner Uhrzeit-Änderung bleibt optimistisch", () => {
    const retimed = changes({
      start_at: new Date("2026-10-05T20:00:00").toISOString(),
      end_at: new Date("2026-10-05T21:30:00").toISOString(),
    });
    expect(canApplyOptimistically({ ...base, scope: "all", changes: retimed })).toBe(true);
    expect(canApplyOptimistically({ ...base, scope: "forward", changes: retimed })).toBe(true);
  });

  test("`this` und Einzeltermin dürfen auch das Datum verschieben", () => {
    // Beide schreiben Literalzeiten — die Exception bzw. die Master-Zeile —,
    // `applyOptimisticChanges` bildet die Verschiebung dort korrekt ab.
    const moved = changes({
      start_at: new Date("2026-10-07T19:00:00").toISOString(),
      end_at: new Date("2026-10-07T20:30:00").toISOString(),
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
      start_at: new Date("2026-10-05T20:00:00").toISOString(),
      end_at: new Date("2026-10-05T21:30:00").toISOString(),
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
      start_at: new Date("2026-10-05T20:00:00").toISOString(),
      end_at: new Date("2026-10-05T21:30:00").toISOString(),
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
      store.add({ kind: "create", row: row() }, 5);
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
