import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import { lightTheme } from "@/design-system/themes";

import type { EventWithRelations } from "./expand";

import { expandEvents } from "./expand";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

function makeRow(overrides: Partial<EventRow> = {}): EventWithRelations {
  const row: EventRow = {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Sommerurlaub",
    description: null,
    location: null,
    start_at: new Date("2026-06-10T09:00:00").toISOString(),
    end_at: new Date("2026-06-10T10:00:00").toISOString(),
    all_day: false,
    timezone: "Europe/Berlin",
    rrule_freq: null,
    rrule_interval: 1,
    rrule_byweekday: null,
    rrule_count: null,
    rrule_until: null,
    created_at: new Date("2026-01-01T00:00:00").toISOString(),
    created_by: null,
    updated_at: new Date("2026-01-01T00:00:00").toISOString(),
    ...overrides,
  };
  return { ...row, event_types: null, event_exceptions: [] };
}

const WINDOW_START = new Date("2026-06-01T00:00:00");
const WINDOW_END = new Date("2026-06-30T23:59:59");

describe("expandEvents window", () => {
  test("keeps an event that starts before the window but runs into it", () => {
    const row = makeRow({
      start_at: new Date("2026-05-20T09:00:00").toISOString(),
      end_at: new Date("2026-06-05T14:00:00").toISOString(),
    });
    const out = expandEvents([row], WINDOW_START, WINDOW_END, lightTheme);
    expect(out).toHaveLength(1);
    expect(out[0].occurrenceDate).toBe("2026-05-20");
  });

  test("drops an event whose span ends before the window", () => {
    const row = makeRow({
      start_at: new Date("2026-04-01T09:00:00").toISOString(),
      end_at: new Date("2026-04-03T14:00:00").toISOString(),
    });
    expect(expandEvents([row], WINDOW_START, WINDOW_END, lightTheme)).toEqual([]);
  });

  test("keeps a recurring occurrence that started before the window and runs into it", () => {
    // Weekly series from Mon 2026-05-25, each occurrence lasting three days.
    // Explicit UTC timestamps, like `recurrence.test.ts` — these are absolute
    // instants; `rrule.ts` evaluates them against `row.timezone` (Europe/Berlin
    // from `makeRow`'s default), not against the runner's timezone.
    const row = makeRow({
      start_at: "2026-05-25T09:00:00.000Z",
      end_at: "2026-05-27T14:00:00.000Z",
      rrule_freq: "weekly",
    });
    const out = expandEvents(
      [row],
      new Date("2026-06-02T00:00:00.000Z"),
      new Date("2026-06-30T23:59:59.000Z"),
      lightTheme,
    );
    // 06-01 → 06-03 straddles the window start and must survive.
    expect(out.map((o) => o.occurrenceDate)).toContain("2026-06-01");
  });

  test("a plain in-window event is unaffected", () => {
    const out = expandEvents([makeRow()], WINDOW_START, WINDOW_END, lightTheme);
    expect(out).toHaveLength(1);
    expect(out[0].occurrenceDate).toBe("2026-06-10");
  });
});

describe("Serienanker", () => {
  test("die verankerte Fassung behält alle Vorkommen, die naive verliert sie", () => {
    // Wöchentliche Serie ab Montag, 01.06.2026, 18:00 Ortszeit.
    const series = makeRow({
      start_at: new Date(2026, 5, 1, 18, 0).toISOString(),
      end_at: new Date(2026, 5, 1, 19, 0).toISOString(),
      rrule_freq: "weekly",
    });
    const windowStart = new Date(2026, 5, 1);
    const windowEnd = new Date(2026, 7, 31, 23, 59, 59);

    const before = expandEvents([series], windowStart, windowEnd, lightTheme);

    // Was ein unbedingtes `updateMaster` geschrieben hätte: das Datum der am
    // 03.08. bearbeiteten Occurrence wandert in `start_at` und damit in dtstart.
    const naive = expandEvents(
      [
        {
          ...series,
          start_at: new Date(2026, 7, 3, 19, 0).toISOString(),
          end_at: new Date(2026, 7, 3, 20, 0).toISOString(),
        },
      ],
      windowStart,
      windowEnd,
      lightTheme,
    );

    // Was `anchoredChanges` schreibt: Datum des Masters, Uhrzeit der Eingabe.
    const anchored = expandEvents(
      [
        {
          ...series,
          start_at: new Date(2026, 5, 1, 19, 0).toISOString(),
          end_at: new Date(2026, 5, 1, 20, 0).toISOString(),
        },
      ],
      windowStart,
      windowEnd,
      lightTheme,
    );

    expect(naive.length).toBeLessThan(before.length);
    expect(anchored.length).toBe(before.length);
    // Und die neue Uhrzeit ist tatsächlich angekommen.
    expect(anchored[0].startAt.getHours()).toBe(19);
  });
});

describe("Dauer über eine Zeitumstellung", () => {
  test("ein mehrtägiges Vorkommen behält seine Wandzeit-Dauer", () => {
    // Wöchentlich ab Freitag 16.10.2026, 09:00 Berlin bis Montag 19.10., 14:00.
    // Das Vorkommen ab Freitag 23.10. läuft über die Umstellung am 25.10.
    const row = makeRow({
      start_at: "2026-10-16T07:00:00.000Z",
      end_at: "2026-10-19T12:00:00.000Z",
      rrule_freq: "weekly",
      timezone: "Europe/Berlin",
    });
    const out = expandEvents(
      [row],
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-27T00:00:00.000Z"),
      lightTheme,
    );
    expect(out).toHaveLength(1);
    // Start bleibt 09:00 Wandzeit (07:00Z, noch Sommerzeit), Ende 14:00 Wandzeit
    // — und das ist nach der Umstellung 13:00Z, nicht 12:00Z.
    expect(out[0].startAt.toISOString()).toBe("2026-10-23T07:00:00.000Z");
    expect(out[0].endAt.toISOString()).toBe("2026-10-26T13:00:00.000Z");
  });
});

describe("Suchfenster deckt die tatsächliche Vorkommen-Dauer ab (Befund A)", () => {
  test("ein Vorkommen, dessen absolutes Ende erst durch die Wandzeit-Dauer ins Fenster fällt, wird gefunden", () => {
    // Wöchentliche Serie ab Fr 27.03.2026 09:00 Berlin (CET, 08:00Z) bis
    // Mo 30.03. 14:00 Berlin (CEST, 12:00Z) — der Master selbst läuft über die
    // Frühjahrs-Umstellung am 29.03.: absolut 76 h, in Wandzeit 77 h.
    const row = makeRow({
      start_at: "2026-03-27T08:00:00.000Z",
      end_at: "2026-03-30T12:00:00.000Z",
      rrule_freq: "weekly",
      timezone: "Europe/Berlin",
    });
    // Das Vorkommen der Folgewoche (03.04.–06.04.) liegt komplett nach der
    // Umstellung; seine Wandzeit-Dauer (77 h, uniform für die ganze Serie)
    // schiebt sein Ende auf 06.04. 14:00 Berlin = 12:00Z. rangeStart liegt
    // knapp davor — nur ein Suchfenster, das um die Wandzeit-Dauer (nicht nur
    // die absolute) geweitet ist, holt den Start (03.04. 09:00 = 07:00Z) noch
    // herein.
    const out = expandEvents(
      [row],
      new Date("2026-04-06T11:30:00.000Z"),
      new Date("2026-04-06T23:59:59.000Z"),
      lightTheme,
    );
    const occ = out.find((o) => o.occurrenceDate === "2026-04-03");
    expect(occ).toBeDefined();
    expect(occ?.startAt.toISOString()).toBe("2026-04-03T07:00:00.000Z");
    expect(occ?.endAt.toISOString()).toBe("2026-04-06T12:00:00.000Z");
  });

  test("eine spätere Occurrence kann absolut länger sein als max(durationMs, floatingDurationMs) — Oktober-Rückstellung", () => {
    // Der Master selbst läuft über KEINE Umstellung: Sa 05.09.2026 09:00
    // Berlin bis So 06.09. 09:00 Berlin, 24 h absolut wie in Wandzeit —
    // durationMs === floatingDurationMs, das Maximum der beiden bringt hier
    // also nichts zusätzlich.
    const row = makeRow({
      start_at: "2026-09-05T07:00:00.000Z",
      end_at: "2026-09-06T07:00:00.000Z",
      rrule_freq: "weekly",
      timezone: "Europe/Berlin",
    });
    // Sieben Wochen später fällt ein Vorkommen auf Sa 24.10., 09:00 Berlin
    // (noch CEST) — dieselbe uniforme 24h-Wandzeit-Dauer landet auf So 25.10.,
    // 09:00 Berlin, nach der Rückstellung (CET). Dieses eine Vorkommen läuft
    // also über die Umstellung und dauert absolut 25 h — eine Stunde mehr als
    // sowohl durationMs als auch floatingDurationMs (beide 24 h, am Master
    // gemessen, der keine Umstellung sieht). rangeStart liegt knapp vor dem
    // absoluten Ende (25.10. 08:00Z); nur ein zusätzlicher DST-Puffer im
    // Suchfenster holt den Start (24.10. 07:00Z) noch herein.
    const out = expandEvents(
      [row],
      new Date("2026-10-25T07:30:00.000Z"),
      new Date("2026-10-25T23:59:59.000Z"),
      lightTheme,
    );
    const occ = out.find((o) => o.occurrenceDate === "2026-10-24");
    expect(occ).toBeDefined();
    expect(occ?.startAt.toISOString()).toBe("2026-10-24T07:00:00.000Z");
    expect(occ?.endAt.toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });
});
describe("Kaputte Zone reißt nicht den ganzen Kalender mit (Befund D)", () => {
  test("eine Zeile mit unbekannter Zone wirft nicht — die intakte Nachbarzeile erscheint weiterhin", () => {
    const broken = makeRow({
      id: "evt-broken",
      start_at: "2026-06-10T09:00:00.000Z",
      end_at: "2026-06-10T10:00:00.000Z",
      timezone: "Foo/Bar",
    });
    const healthy = makeRow({
      id: "evt-healthy",
      start_at: "2026-06-11T09:00:00.000Z",
      end_at: "2026-06-11T10:00:00.000Z",
      timezone: "Europe/Berlin",
    });
    let out: ReturnType<typeof expandEvents> = [];
    expect(() => {
      out = expandEvents([broken, healthy], WINDOW_START, WINDOW_END, lightTheme);
    }).not.toThrow();
    expect(out.map((o) => o.eventId)).toContain("evt-healthy");

    // Befund F: der Zweck des Fixes ist ein UTC-Fallback für die kaputte Zeile
    // selbst, nicht nur, dass die Nachbarzeile überlebt — ein stillschweigend
    // verworfenes `evt-broken` bestünde den obigen Assert ebenso. UTC-Fallback
    // heißt Offset 0: Wandzeit und Instant fallen zusammen, die Occurrence
    // trägt also exakt die `start_at`/`end_at`-Instants der Fixture, ungeraten
    // aus ihr abgeleitet.
    const brokenOcc = out.find((o) => o.eventId === "evt-broken");
    expect(brokenOcc).toBeDefined();
    expect(brokenOcc?.startAt.toISOString()).toBe(new Date(broken.start_at).toISOString());
    expect(brokenOcc?.endAt.toISOString()).toBe(new Date(broken.end_at).toISOString());
  });
});
