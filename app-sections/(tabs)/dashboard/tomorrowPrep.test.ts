import type { TFunction } from "i18next";

import { describe, expect, test } from "bun:test";

import type { CalendarOccurrence } from "@/features/calendar/types";
import type { TaskWithType } from "@/features/tasks/types";

import { lightTheme } from "@/design-system/themes";
import { toDaySegments } from "@/features/calendar/spans";

import { buildTomorrowPrep } from "./tomorrowPrep";

/** Echoes key and params so a test can assert which branch was taken. */
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${JSON.stringify(params)})` : key) as unknown as TFunction;

const TOMORROW = "2026-06-11";
const WINDOW_START = new Date("2026-06-01T00:00:00");
const WINDOW_END = new Date("2026-06-30T23:59:59");

function makeOccurrence(
  startIso: string,
  endIso: string,
  overrides: Partial<CalendarOccurrence> = {},
): CalendarOccurrence {
  return {
    eventId: `evt-${startIso}`,
    occurrenceDate: startIso.slice(0, 10),
    startAt: new Date(startIso),
    endAt: new Date(endIso),
    title: "Elternabend",
    description: null,
    location: null,
    allDay: false,
    childId: null,
    parentId: null,
    isException: false,
    isRecurring: false,
    rrule: { freq: null, interval: 1, byweekday: null, count: null, until: null },
    type: {
      slug: "schule",
      color: "#4ECDC4",
      iconName: "school",
      labelDe: "Schule",
      labelEn: "School",
    },
    ...overrides,
  };
}

function segmentsOf(...occurrences: CalendarOccurrence[]) {
  return toDaySegments(occurrences, WINDOW_START, WINDOW_END);
}

function makeTask(overrides: Partial<TaskWithType> = {}): TaskWithType {
  return {
    id: "task-1",
    title: "Schwimmsachen einpacken",
    due_date: TOMORROW,
    due_time: null,
    is_done: false,
    child_id: null,
    completed_at: null,
    completed_by: null,
    created_at: "2026-06-01T08:00:00Z",
    created_by: null,
    description: null,
    family_id: "fam-1",
    subject: null,
    type_id: "type-1",
    updated_at: "2026-06-01T08:00:00Z",
    task_types: {
      id: "type-1",
      slug: "besorgung",
      icon: "shopping-bag",
      color: "primary",
      label: { de: "Besorgung" },
      family_id: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    ...overrides,
  };
}

function build(
  args: Partial<Parameters<typeof buildTomorrowPrep>[0]> = {},
): ReturnType<typeof buildTomorrowPrep> {
  return buildTomorrowPrep({
    tasks: [],
    segments: [],
    date: TOMORROW,
    people: [],
    theme: lightTheme,
    lang: "de",
    t,
    ...args,
  });
}

describe("buildTomorrowPrep · Auswahl", () => {
  test("nothing to prepare yields an empty list", () => {
    expect(build()).toEqual({ visible: [], overflow: 0, overflowTarget: null });
  });

  test("keeps only tasks due on the requested day", () => {
    const result = build({
      tasks: [
        makeTask({ id: "tomorrow", due_date: TOMORROW }),
        makeTask({ id: "today", due_date: "2026-06-10" }),
        makeTask({ id: "next-week", due_date: "2026-06-18" }),
      ],
    });

    expect(result.visible.map((e) => e.id)).toEqual(["tomorrow"]);
  });

  test("drops tasks that are already done", () => {
    const result = build({
      tasks: [
        makeTask({ id: "open", is_done: false }),
        makeTask({ id: "done", is_done: true, completed_at: "2026-06-10T18:00:00Z" }),
      ],
    });

    expect(result.visible.map((e) => e.id)).toEqual(["open"]);
  });

  test("keeps only the segments painting on the requested day", () => {
    const result = build({
      segments: segmentsOf(
        makeOccurrence("2026-06-11T09:00:00", "2026-06-11T10:00:00", { eventId: "tomorrow" }),
        makeOccurrence("2026-06-12T09:00:00", "2026-06-12T10:00:00", { eventId: "later" }),
      ),
    });

    expect(result.visible.map((e) => e.id)).toEqual(["tomorrow"]);
  });

  test("includes a multi-day event on its continuation day", () => {
    const result = build({
      segments: segmentsOf(
        makeOccurrence("2026-06-10T09:00:00", "2026-06-13T17:00:00", { eventId: "klassenfahrt" }),
      ),
    });

    expect(result.visible.map((e) => e.id)).toEqual(["klassenfahrt"]);
  });
});

describe("buildTomorrowPrep · Reihenfolge", () => {
  test("puts entries without a time before timed ones", () => {
    const result = build({
      tasks: [
        makeTask({ id: "timed", due_time: "16:00:00" }),
        makeTask({ id: "untimed", due_time: null }),
      ],
    });

    expect(result.visible.map((e) => e.id)).toEqual(["untimed", "timed"]);
  });

  test("treats an all-day event as untimed", () => {
    const result = build({
      tasks: [makeTask({ id: "task-08", due_time: "08:00:00" })],
      segments: segmentsOf(
        makeOccurrence("2026-06-11T00:00:00", "2026-06-11T23:59:00", {
          eventId: "ganztags",
          allDay: true,
        }),
      ),
    });

    expect(result.visible.map((e) => e.id)).toEqual(["ganztags", "task-08"]);
  });

  test("orders timed entries chronologically across both sources", () => {
    const result = build({
      tasks: [
        makeTask({ id: "task-17", due_time: "17:30:00" }),
        makeTask({ id: "task-07", due_time: "07:15:00" }),
      ],
      segments: segmentsOf(
        makeOccurrence("2026-06-11T12:00:00", "2026-06-11T13:00:00", { eventId: "event-12" }),
      ),
    });

    expect(result.visible.map((e) => e.id)).toEqual(["task-07", "event-12", "task-17"]);
  });

  test("puts the event first when an event and a task share a time", () => {
    const result = build({
      tasks: [makeTask({ id: "task-09", due_time: "09:00:00" })],
      segments: segmentsOf(
        makeOccurrence("2026-06-11T09:00:00", "2026-06-11T10:00:00", { eventId: "event-09" }),
      ),
    });

    expect(result.visible.map((e) => e.id)).toEqual(["event-09", "task-09"]);
  });

  test("falls back to the title when two tasks share a time", () => {
    const ids = (tasks: TaskWithType[]) => build({ tasks }).visible.map((e) => e.id);
    const anton = makeTask({ id: "anton", title: "Anton abholen", due_time: "10:00:00" });
    const zelte = makeTask({ id: "zelte", title: "Zelte packen", due_time: "10:00:00" });

    expect(ids([anton, zelte])).toEqual(["anton", "zelte"]);
    expect(ids([zelte, anton])).toEqual(["anton", "zelte"]);
  });
});

describe("buildTomorrowPrep · Deckel", () => {
  test("shows every entry while they fit the limit", () => {
    const tasks = [1, 2, 3].map((n) => makeTask({ id: `t${n}`, due_time: `0${n}:00:00` }));

    expect(build({ tasks })).toMatchObject({ overflow: 0, overflowTarget: null });
    expect(build({ tasks }).visible).toHaveLength(3);
  });

  test("truncates to three and counts the rest as overflow", () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => makeTask({ id: `t${n}`, due_time: `0${n}:00:00` }));

    const result = build({ tasks });

    expect(result.visible.map((e) => e.id)).toEqual(["t1", "t2", "t3"]);
    expect(result.overflow).toBe(2);
  });

  test("accepts a custom limit", () => {
    const tasks = [1, 2, 3].map((n) => makeTask({ id: `t${n}`, due_time: `0${n}:00:00` }));

    expect(build({ tasks, limit: 1 })).toMatchObject({ overflow: 2 });
  });

  test("sends the overflow row to the calendar when only events are hidden", () => {
    const segments = segmentsOf(
      ...[1, 2, 3, 4].map((n) =>
        makeOccurrence(`2026-06-11T0${n}:00:00`, `2026-06-11T0${n}:30:00`, { eventId: `e${n}` }),
      ),
    );

    expect(build({ segments })).toMatchObject({ overflow: 1, overflowTarget: "/kalender" });
  });

  test("sends the overflow row to the tasks tab as soon as a task is hidden", () => {
    // Sichtbar bleiben drei Events, verborgen sind ein Event und eine Aufgabe:
    // die Aufgabe entscheidet, weil sie das ist, was man abhaken kann.
    const segments = segmentsOf(
      ...[1, 2, 3, 4].map((n) =>
        makeOccurrence(`2026-06-11T0${n}:00:00`, `2026-06-11T0${n}:30:00`, { eventId: `e${n}` }),
      ),
    );
    const tasks = [makeTask({ id: "spät", due_time: "23:00:00" })];

    expect(build({ segments, tasks })).toMatchObject({ overflow: 2, overflowTarget: "/aufgaben" });
  });
});

describe("buildTomorrowPrep · Zeilen", () => {
  test("carries a task's deep-link target and title", () => {
    const [entry] = build({ tasks: [makeTask({ id: "abc", title: "Milch kaufen" })] }).visible;

    expect(entry).toMatchObject({ kind: "task", id: "abc", title: "Milch kaufen" });
  });

  test("carries an event's series anchor for the occurrence deep-link", () => {
    const [entry] = build({
      segments: segmentsOf(
        makeOccurrence("2026-06-08T09:00:00", "2026-06-08T10:00:00", {
          eventId: "serie",
          occurrenceDate: "2026-06-11",
          startAt: new Date("2026-06-11T09:00:00"),
          endAt: new Date("2026-06-11T10:00:00"),
        }),
      ),
    }).visible;

    expect(entry).toMatchObject({ kind: "event", id: "serie", occurrenceDate: "2026-06-11" });
  });

  test("resolves a task's icon and colour from its type", () => {
    const [entry] = build({ tasks: [makeTask()] }).visible;

    // `shopping-bag` steht so im Seed, kennt die Icon-Map aber nicht.
    expect(entry).toMatchObject({ iconName: "shopping-cart", color: lightTheme.primary });
  });

  test("falls back to a neutral icon when the task type is not readable", () => {
    const [entry] = build({ tasks: [makeTask({ task_types: null })] }).visible;

    expect(entry).toMatchObject({ iconName: "check-square", color: lightTheme.primary });
  });

  test("takes an event's icon and colour from the expanded occurrence", () => {
    const [entry] = build({
      segments: segmentsOf(makeOccurrence("2026-06-11T09:00:00", "2026-06-11T10:00:00")),
    }).visible;

    expect(entry).toMatchObject({ iconName: "school", color: "#4ECDC4" });
  });
});

describe("buildTomorrowPrep · Meta-Zeile", () => {
  test("names time, person and type of a task", () => {
    const [entry] = build({
      tasks: [makeTask({ due_time: "16:30:00", child_id: "kid" })],
      people: [{ id: "kid", name: "Mia" }],
    }).visible;

    expect(entry.meta).toBe("16:30 · Mia · hw.type.besorgung");
  });

  test("omits the time for a task that has none", () => {
    const [entry] = build({
      tasks: [makeTask({ due_time: null, child_id: "kid" })],
      people: [{ id: "kid", name: "Mia" }],
    }).visible;

    expect(entry.meta).toBe("Mia · hw.type.besorgung");
  });

  test("omits the person when the task hangs on no child", () => {
    const [entry] = build({ tasks: [makeTask({ due_time: "07:00:00" })] }).visible;

    expect(entry.meta).toBe("07:00 · hw.type.besorgung");
  });

  test("omits the type when it is not readable", () => {
    const [entry] = build({
      tasks: [makeTask({ due_time: "07:00:00", task_types: null })],
    }).visible;

    expect(entry.meta).toBe("07:00");
  });

  test("uses the segment's own time label for an event", () => {
    const [entry] = build({
      segments: segmentsOf(makeOccurrence("2026-06-11T08:15:00", "2026-06-11T09:00:00")),
    }).visible;

    expect(entry.meta).toBe("08:15 · Schule");
  });

  test("says what a continuation day of a multi-day event does", () => {
    const [entry] = build({
      segments: segmentsOf(makeOccurrence("2026-06-10T09:00:00", "2026-06-13T17:00:00")),
    }).visible;

    expect(entry.meta).toBe("cal.span.through · Schule");
  });

  test("names the parent an event hangs on", () => {
    const [entry] = build({
      segments: segmentsOf(
        makeOccurrence("2026-06-11T08:15:00", "2026-06-11T09:00:00", { parentId: "dad" }),
      ),
      people: [{ id: "dad", name: "Tom" }],
    }).visible;

    expect(entry.meta).toBe("08:15 · Tom · Schule");
  });

  test("uses the English type label in the English UI", () => {
    const [entry] = build({
      lang: "en",
      segments: segmentsOf(makeOccurrence("2026-06-11T08:15:00", "2026-06-11T09:00:00")),
    }).visible;

    expect(entry.meta).toBe("08:15 · School");
  });
});

describe("buildTomorrowPrep · React-Keys", () => {
  test("gives two occurrences of the same series distinct keys", () => {
    // Der Deckel liegt bei drei, beide Occurrences müssen trotzdem
    // unterscheidbar sein — `id` allein ist es bei einer Serie nicht.
    const result = build({
      segments: segmentsOf(
        makeOccurrence("2026-06-11T09:00:00", "2026-06-11T10:00:00", {
          eventId: "serie",
          occurrenceDate: "2026-06-11",
        }),
        makeOccurrence("2026-06-11T15:00:00", "2026-06-11T16:00:00", {
          eventId: "serie",
          occurrenceDate: "2026-06-04",
        }),
      ),
    });

    const keys = result.visible.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("keeps a task's key apart from an event's of the same id", () => {
    const result = build({
      tasks: [makeTask({ id: "same" })],
      segments: segmentsOf(
        makeOccurrence("2026-06-11T09:00:00", "2026-06-11T10:00:00", { eventId: "same" }),
      ),
    });

    const keys = result.visible.map((e) => e.key);
    expect(new Set(keys).size).toBe(2);
  });
});
