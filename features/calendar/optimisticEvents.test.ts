import { afterEach, describe, expect, test } from "bun:test";

import { lightTheme } from "@/design-system";

import type { EventWithRelations } from "./expand";
import type { EventChanges } from "./recurrence";
import type { CalendarOccurrence } from "./types";

import { expandEvents } from "./expand";
import {
  applyOptimisticChanges,
  patchesOccurrence,
  useOptimisticEventsStore,
  withOptimistic,
} from "./optimisticEvents";
import { withoutPendingDeletes } from "./pendingDeletes";

function occ(partial: Partial<CalendarOccurrence> = {}): CalendarOccurrence {
  return {
    eventId: "e1",
    occurrenceDate: "2026-09-10",
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

describe("patchesOccurrence", () => {
  const entry = { eventId: "e1", occurrenceDate: "2026-09-10", scope: "this" as const };

  test("`this` trifft genau diese Occurrence", () => {
    expect(patchesOccurrence(entry, { eventId: "e1", occurrenceDate: "2026-09-10" })).toBe(true);
    expect(patchesOccurrence(entry, { eventId: "e1", occurrenceDate: "2026-09-17" })).toBe(false);
  });

  test("`forward` schließt den Stichtag ein und lässt alles davor", () => {
    const fwd = { ...entry, scope: "forward" as const };
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceDate: "2026-09-10" })).toBe(true);
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceDate: "2026-09-17" })).toBe(true);
    expect(patchesOccurrence(fwd, { eventId: "e1", occurrenceDate: "2026-09-03" })).toBe(false);
  });

  test("`all` trifft jede Occurrence des Events", () => {
    const all = { ...entry, scope: "all" as const };
    expect(patchesOccurrence(all, { eventId: "e1", occurrenceDate: "2020-01-01" })).toBe(true);
    expect(patchesOccurrence(all, { eventId: "e1", occurrenceDate: "2030-12-31" })).toBe(true);
  });

  test("kein Scope greift auf ein fremdes Event über", () => {
    for (const scope of ["this", "forward", "all"] as const) {
      expect(
        patchesOccurrence({ ...entry, scope }, { eventId: "e2", occurrenceDate: "2026-09-10" }),
      ).toBe(false);
    }
  });
});

describe("applyOptimisticChanges · Serie mit Scope `all`", () => {
  test("verschiebt die Tageszeit und behält das Datum jeder Occurrence", () => {
    // Die naheliegende Fehlimplementierung schreibt `changes.start_at` stumpf in
    // jede Occurrence — dann zöge sich die ganze Serie auf einen Tag zusammen.
    const later = occ({
      occurrenceDate: "2026-09-17",
      startAt: new Date("2026-09-17T16:00:00"),
      endAt: new Date("2026-09-17T17:30:00"),
    });
    const out = applyOptimisticChanges(later, "all", changes());
    expect(out.occurrenceDate).toBe("2026-09-17");
    expect(out.startAt.getHours()).toBe(18);
    expect(out.startAt.getDate()).toBe(17);
  });

  test("erhält die Dauer und verankert endAt am Occurrence-Datum, nicht am changes-Datum", () => {
    // Occurrence auf 2026-09-17, changes auf 2026-09-10 datiert.
    // Eine falsche literale Übernahme würde endAt auf den 10. setzen — genau das,
    // das diese Behauptung reißt. Der korrekte Weg: Tageszeit aus newEnd übernehmen,
    // aber Datum von startAt bewahren.
    const later = occ({
      occurrenceDate: "2026-09-17",
      startAt: new Date("2026-09-17T16:00:00"),
      endAt: new Date("2026-09-17T17:30:00"),
    });
    const out = applyOptimisticChanges(later, "all", changes());
    expect(out.endAt.getTime() - out.startAt.getTime()).toBe(90 * 60 * 1000);
    expect(out.endAt.getDate()).toBe(17);
  });

  test("patcht auch die Beschreibung — der Server schreibt sie auf den Master", () => {
    const out = applyOptimisticChanges(occ(), "all", changes({ description: "Neue Notiz" }));
    expect(out.description).toBe("Neue Notiz");
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
    occ({ eventId: r.id, occurrenceDate: "2026-10-01" }),
    occ({ eventId: r.id, occurrenceDate: "2026-10-08" }),
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
          occurrenceDate: "2026-09-10",
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

  test("mehrere Update-Einträge wirken nacheinander: spätere können Matches von früheren treffen", () => {
    // Eine Serie, wenn o1 sie auf allen Vorkommen ändert, verschiebt `occurrenceDate`
    // nicht — es behält das Datum jeder Occurrence. Bei einem Einzeltermin mit
    // `scope: "this"` aber ändert sich `occurrenceDate` ins neue Datum.
    //
    // Deshalb: o1 verschiebt den Einzeltermin vom 10.09. auf den 24.09., o2 mit
    // `occurrenceDate: "2026-09-24"` matcht die verschobene Occurrence und ändert
    // den Titel. Ein falsches „nur den letzten anwenden" findet o2 nicht, weil die
    // ursprüngliche Occurrence noch am 10.09. liegt.
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
          occurrenceDate: "2026-09-10",
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
          occurrenceDate: "2026-09-24",
          scope: "this",
          changes: changes({ title: "o2 hat gematcht" }),
        },
      ],
      expandStub,
    );
    // Wenn sequenziell: o1 setzt Titel auf "Teste nach o1", o2 findet und ändert
    // auf "o2 hat gematcht", occurrenceDate wird "2026-09-24".
    // Wenn nur o2: o2 findet die Occurrence nicht (sie ist noch am 10.09.), Titel
    // bleibt "Fußballtraining", occurrenceDate bleibt "2026-09-10".
    const found = out.find((o) => o.eventId === "e1");
    expect(found?.title).toBe("o2 hat gematcht");
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
  test("eine zugleich bearbeitete und gelöschte Occurrence ist weg", () => {
    // Ein Update kann eine bereits gefilterte Occurrence nicht zurückbringen,
    // weil der Patch-Zweig von `withOptimistic` nur per `.map()` über die
    // bestehende Liste arbeitet und nie Einträge hinzufügt. Daher ist die
    // Reihenfolge (Patch vor Delete oder umgekehrt) folgenlos — das Ergebnis
    // ist in beiden Fällen leer. Wir halten diesen Test trotzdem, weil die
    // Aussage („eine Löschung gewinnt gegen eine gleichzeitige Bearbeitung")
    // richtig ist und diese Eigenschaft wert, festgehalten zu werden.
    const patched = withOptimistic(
      [occ()],
      [
        {
          id: "o1",
          kind: "update",
          eventId: "e1",
          occurrenceDate: "2026-09-10",
          scope: "all",
          changes: changes({ title: "Geändert" }),
        },
      ],
      expandStub,
    );
    expect(patched).toHaveLength(1);
    const out = withoutPendingDeletes(patched, [
      { eventId: "e1", occurrenceDate: "2026-09-10", scope: "all" },
    ]);
    expect(out).toHaveLength(0);
  });
});

describe("useOptimisticEventsStore", () => {
  afterEach(() => useOptimisticEventsStore.setState({ entries: [] }));

  test("add gibt eine Id zurück, remove nimmt den Eintrag wieder heraus", () => {
    const store = () => useOptimisticEventsStore.getState();
    const id = store().add({
      kind: "update",
      eventId: "e1",
      occurrenceDate: "2026-09-10",
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
      occurrenceDate: "2026-09-10",
      scope: "all",
      changes: changes(),
    });
    const second = store().add({
      kind: "update",
      eventId: "e2",
      occurrenceDate: "2026-09-10",
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
