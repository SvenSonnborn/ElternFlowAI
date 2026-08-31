import { describe, expect, test } from "bun:test";

import type { Database } from "@/features/supabase/database.types";

import type { CreateEventVars } from "./createMutation";

import {
  optimisticEventRow,
  parseRecurrenceCount,
  recurrenceToRrule,
  rruleToRecurrence,
} from "./createMutation";

type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];

function vars(partial: Partial<CreateEventVars> = {}): CreateEventVars {
  return {
    familyId: "f1",
    typeId: "t1",
    childId: "c1",
    parentId: null,
    title: "Elternabend",
    startAt: "2026-10-01T19:00:00.000Z",
    endAt: "2026-10-01T20:30:00.000Z",
    allDay: false,
    location: "Schule",
    description: "Raum 12",
    recurrence: "weekly",
    recurrenceCount: 5,
    createdBy: "u1",
    ...partial,
  };
}

function type(partial: Partial<EventTypeRow> = {}): EventTypeRow {
  return {
    id: "t1",
    family_id: "f1",
    slug: "family",
    color: "primary",
    icon: "calendar",
    label: { de: "Familie", en: "Family" },
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("recurrenceToRrule", () => {
  test("none → all-null rrule", () => {
    const r = recurrenceToRrule("none", new Date("2026-06-03T16:00:00Z"));
    expect(r.rrule_freq).toBeNull();
    expect(r.rrule_interval).toBe(1);
    expect(r.rrule_byweekday).toBeNull();
  });

  test("daily → freq=daily, no byweekday filter", () => {
    const r = recurrenceToRrule("daily", new Date("2026-06-03T16:00:00Z"));
    expect(r.rrule_freq).toBe("daily");
    expect(r.rrule_byweekday).toBeNull();
  });

  test("weekdays → weekly with Mon–Fri (ISO 1..5)", () => {
    const r = recurrenceToRrule("weekdays", new Date("2026-06-03T16:00:00Z"));
    expect(r.rrule_freq).toBe("weekly");
    expect(r.rrule_byweekday).toEqual([1, 2, 3, 4, 5]);
  });

  test("weekly on a Wednesday (2026-06-03) → byweekday=[3]", () => {
    // 2026-06-03 is a Wednesday.
    const r = recurrenceToRrule("weekly", new Date("2026-06-03T16:00:00Z"));
    expect(r.rrule_freq).toBe("weekly");
    expect(r.rrule_byweekday).toEqual([3]);
  });

  test("weekly on a Sunday → byweekday=[7] (ISO Sunday=7, not 0)", () => {
    // 2026-06-07 is a Sunday.
    const r = recurrenceToRrule("weekly", new Date("2026-06-07T16:00:00Z"));
    expect(r.rrule_byweekday).toEqual([7]);
  });

  test("monthly → freq=monthly, no byweekday", () => {
    const r = recurrenceToRrule("monthly", new Date("2026-06-03T16:00:00Z"));
    expect(r.rrule_freq).toBe("monthly");
    expect(r.rrule_byweekday).toBeNull();
  });
});

// 2026-06-03 is a Wednesday, so a "weekly" rule off this start is byweekday=[3].
const WEDNESDAY = new Date("2026-06-03T16:00:00");

describe("rruleToRecurrence", () => {
  test("round-trips every option the create form can produce", () => {
    for (const opt of ["none", "daily", "weekdays", "weekly", "monthly"] as const) {
      expect(rruleToRecurrence(recurrenceToRrule(opt, WEDNESDAY), WEDNESDAY)).toBe(opt);
    }
  });

  test("a weekly rule without byweekday is the plain weekly option", () => {
    // rrule falls back to dtstart's weekday, which is what "weekly" means here.
    const opt = rruleToRecurrence(
      { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: null },
      WEDNESDAY,
    );
    expect(opt).toBe("weekly");
  });

  // Rules the radio has no name for must stay hidden rather than be rewritten
  // into the nearest option on the next save.

  test("interval > 1 is not representable", () => {
    expect(
      rruleToRecurrence(
        { rrule_freq: "weekly", rrule_interval: 2, rrule_byweekday: [3] },
        WEDNESDAY,
      ),
    ).toBeNull();
  });

  test("yearly is not representable", () => {
    expect(
      rruleToRecurrence(
        { rrule_freq: "yearly", rrule_interval: 1, rrule_byweekday: null },
        WEDNESDAY,
      ),
    ).toBeNull();
  });

  test("an arbitrary weekday set is not representable", () => {
    expect(
      rruleToRecurrence(
        { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: [2, 4] },
        WEDNESDAY,
      ),
    ).toBeNull();
  });

  test("a weekly rule on a day other than dtstart's is not representable", () => {
    expect(
      rruleToRecurrence(
        { rrule_freq: "weekly", rrule_interval: 1, rrule_byweekday: [1] },
        WEDNESDAY,
      ),
    ).toBeNull();
  });
});

describe("parseRecurrenceCount", () => {
  test("empty means unbounded", () => {
    expect(parseRecurrenceCount("")).toBeNull();
    expect(parseRecurrenceCount("   ")).toBeNull();
  });

  test("positive integers pass through", () => {
    expect(parseRecurrenceCount("10")).toBe(10);
    expect(parseRecurrenceCount(" 1 ")).toBe(1);
  });

  test("zero, negatives and fractions are rejected rather than treated as unbounded", () => {
    expect(parseRecurrenceCount("0")).toBe("invalid");
    expect(parseRecurrenceCount("-3")).toBe("invalid");
    expect(parseRecurrenceCount("2.5")).toBe("invalid");
    expect(parseRecurrenceCount("abc")).toBe("invalid");
  });
});

describe("optimisticEventRow", () => {
  test("spiegelt alle 19 Spalten von events.Row plus event_types/event_exceptions", () => {
    const v = vars();
    const t = type();
    const row = optimisticEventRow(v, t);

    // Deckt alle 19 Spalten von events.Row ab (id/created_at/updated_at unten
    // gesondert, weil sie nicht deterministisch sind) plus die beiden
    // Relationsfelder aus EventWithRelations. Weicht eine Spalte hier vom
    // `insert` in `createEvent` ab, zeigt der Kalender etwas anderes an, als
    // gleich gespeichert wird — und dieser Test ist die einzige Stelle, die
    // das merkt.
    expect(row).toMatchObject({
      family_id: v.familyId,
      type_id: v.typeId,
      child_id: v.childId,
      parent_id: v.parentId,
      title: v.title,
      description: v.description,
      location: v.location,
      start_at: v.startAt,
      end_at: v.endAt,
      all_day: v.allDay,
      rrule_freq: "weekly",
      rrule_interval: 1,
      // 2026-10-01 ist ein Donnerstag → ISO-Wochentag 4.
      rrule_byweekday: [4],
      rrule_count: v.recurrenceCount,
      rrule_until: null,
      created_by: v.createdBy,
      event_types: t,
      event_exceptions: [],
    });
    expect(row.id).toMatch(/^optimistic-\d+$/);
    expect(typeof row.created_at).toBe("string");
    expect(typeof row.updated_at).toBe("string");
  });

  test("liefert für zwei Aufrufe mit identischen vars unterschiedliche Ids", () => {
    // Regressionsschutz für den Bug, den eine aus `startAt`+`typeId`
    // abgeleitete Id hatte: Zwei Termine mit unveränderten Formularwerten
    // (z. B. `EventCreateScreen`s Default aus `initialRange` + Default-Typ)
    // erzeugten dieselbe Id, dasselbe `occurrenceDate` und kollidierten im
    // React-Key von KalenderScreen/DashboardScreen.
    const v = vars();
    const t = type();
    const first = optimisticEventRow(v, t);
    const second = optimisticEventRow(v, t);
    expect(first.id).not.toBe(second.id);
  });
});
