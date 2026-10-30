import { act, screen, waitFor, within } from "@testing-library/react-native";
import { addDays, endOfMonth, startOfMonth } from "date-fns";
import { useEffect } from "react";
import { Text, View } from "react-native";

import type { Database } from "@/features/supabase/database.types";

import { usePendingDeleteStore } from "@/features/shared";
import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import type { CreateEventVars } from "./createMutation";
import type { ApplyEventChange } from "./eventChange";
import type { EventWithRelations } from "./expand";
import type { DeleteEventVars, UpdateEventVars } from "./mutations";

import { useEvent, useFamilyEvents } from "./hooks";
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from "./mutations";
import { useOptimisticEventsStore } from "./optimisticEvents";
import { calendarKeys, fetchEventById, fetchEventsInRange } from "./queries";
import { occurrenceVersion } from "./version";

// Die Mutationen laufen gegen gemockte Server-Funktionen. Die `useEvent`-Tests
// lesen nur den vorbefüllten Cache und rufen keine davon.
const mockUpsert = jest.fn<Promise<UpsertAnswer>, []>();
const mockApplyChange = jest.fn<ReturnType<ApplyEventChange>, Parameters<ApplyEventChange>>();

jest.mock("./queries", () => ({
  ...jest.requireActual<typeof import("./queries")>("./queries"),
  fetchEventsInRange: jest.fn(),
  fetchEventById: jest.fn(),
}));

jest.mock("./eventChange", () => ({
  ...jest.requireActual<typeof import("./eventChange")>("./eventChange"),
  createSupabaseApplyEventChange: () => mockApplyChange,
}));

// Überschreibt den werfenden Stub aus `testing/jest.setup.ts` mit genau der
// Kette, die `createEvent` ruft. Jeder andere Zugriff scheitert weiter laut.
jest.mock("@/features/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "events") throw new Error(`unerwartete Tabelle ${table}`);
      return { upsert: () => ({ select: () => mockUpsert() }) };
    },
  },
}));

interface UpsertAnswer {
  data: { id: string }[] | null;
  error: { message: string; code: string } | null;
}

/** Wöchentliche Serie ab Do 01.10.2026 19:00 Berlin; Einzeltermin über `rrule_freq: null`. */
function row(overrides: Partial<EventWithRelations> = {}): EventWithRelations {
  return {
    id: "e1",
    family_id: "f1",
    type_id: "t1",
    child_id: null,
    parent_id: null,
    title: "Elternabend",
    description: null,
    location: null,
    start_at: "2026-10-01T17:00:00.000Z",
    end_at: "2026-10-01T18:30:00.000Z",
    all_day: false,
    timezone: "Europe/Berlin",
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: null,
    rrule_count: null,
    rrule_until: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-10-01T08:00:00.000Z",
    event_types: null,
    event_exceptions: [],
    ...overrides,
  };
}

function Probe({ occ }: { occ?: string }) {
  const { data } = useEvent("e1", occ);
  return <Text>{data ? data.occurrenceKey : "keine"}</Text>;
}

async function renderProbe(event: EventWithRelations, occ?: string) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(calendarKeys.one("e1"), event);
  return renderScreen(<Probe occ={occ} />, { queryClient });
}

describe("useEvent", () => {
  it("Serie, unbekannter occ: keine Occurrence statt der ersten", async () => {
    const view = await renderProbe(row(), "2026-10-02");
    expect(view.getByText("keine")).toBeTruthy();
  });

  it("Serie, gültiger occ: genau diese Occurrence", async () => {
    const view = await renderProbe(row(), "2026-10-08");
    expect(view.getByText("2026-10-08")).toBeTruthy();
  });

  it("Einzeltermin, veralteter occ: seine Occurrence", async () => {
    const view = await renderProbe(row({ rrule_freq: null }), "2026-09-01");
    expect(view.getByText("2026-10-01")).toBeTruthy();
  });
});

type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];

const OCTOBER = new Date(2026, 9, 1);
const NOVEMBER = new Date(2026, 10, 1);
const SERVER_ID = "0d4c6f0e-5a8e-4c1a-9a51-6a2b0f3c9e11";
const OCCURRENCE_KEY = "2026-10-30";
const offline = new Error("Netzwerk weg");

const familyType: EventTypeRow = {
  id: "t1",
  family_id: "f1",
  slug: "family",
  color: "primary",
  icon: "calendar",
  label: { de: "Familie", en: "Family" },
  created_at: "2026-01-01T00:00:00.000Z",
};

/**
 * Einzeltermin Fr 30.10.2026 19:00 Berlin — liegt in der Range von Oktober
 * (bis 07.11.) und von November (ab 25.10.).
 */
function single(overrides: Partial<EventWithRelations> = {}): EventWithRelations {
  return row({
    rrule_freq: null,
    start_at: "2026-10-30T18:00:00.000Z",
    end_at: "2026-10-30T19:30:00.000Z",
    ...overrides,
  });
}

/** Was der Server nach dem Anlegen liefert: die Zeile unter `vars.id`. */
function created(): EventWithRelations {
  return single({ id: SERVER_ID, event_types: familyType });
}

function createVars(): CreateEventVars {
  return {
    id: SERVER_ID,
    familyId: "f1",
    typeId: "t1",
    childId: null,
    parentId: null,
    title: "Elternabend",
    startAt: "2026-10-30T18:00:00.000Z",
    endAt: "2026-10-30T19:30:00.000Z",
    allDay: false,
    timezone: "Europe/Berlin",
    location: null,
    description: null,
    recurrence: "none",
    recurrenceCount: null,
    createdBy: null,
  };
}

function deleteVars(event: EventWithRelations): DeleteEventVars {
  return {
    scope: "all",
    eventId: event.id,
    occurrenceKey: OCCURRENCE_KEY,
    isRecurring: false,
    baseVersion: occurrenceVersion(event, OCCURRENCE_KEY),
    requestId: "a7f1c2d4-3b5e-4f60-8a9b-0c1d2e3f4a5b",
  };
}

function updateVars(event: EventWithRelations): UpdateEventVars {
  return {
    ...deleteVars(event),
    changes: {
      title: "Elternabend neu",
      start_at: event.start_at,
      end_at: event.end_at,
      location: null,
      description: null,
    },
    timezone: event.timezone,
  };
}

/**
 * Die Range, die `useFamilyEvents` für `month` lädt — nachgebaut, weil die
 * Tests ihren Cache-Schlüssel vorbefüllen und ihr Laden einzeln beantworten.
 */
function rangeOf(month: Date): { start: Date; end: Date } {
  return { start: addDays(startOfMonth(month), -7), end: addDays(endOfMonth(month), 7) };
}

function rangeKey(month: Date) {
  const { start, end } = rangeOf(month);
  return calendarKeys.range(start.toISOString(), end.toISOString());
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Ein Makrotask: Bis er läuft, sind alle Mikrotasks durch — auch das Laden,
 * das eine Mutation angestoßen hat und das ein Mock sofort beantwortet.
 */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface Mutations {
  create: ReturnType<typeof useCreateEvent>;
  update: ReturnType<typeof useUpdateEvent>;
  remove: ReturnType<typeof useDeleteEvent>;
}

/** Eine Monatsansicht als Titelliste; reicht auf Wunsch die drei Mutationen heraus. */
function MonthProbe({
  month,
  onMutations,
}: {
  month: Date;
  onMutations?: (mutations: Mutations) => void;
}) {
  const { data, hasData } = useFamilyEvents(month);
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const remove = useDeleteEvent();
  useEffect(() => {
    onMutations?.({ create, update, remove });
  });
  return (
    <>
      <Text testID={`hasdata-${month.getMonth() + 1}`}>{String(hasData)}</Text>
      <View testID={`monat-${month.getMonth() + 1}`}>
        {data.map((occurrence) => (
          <Text key={`${occurrence.eventId}|${occurrence.occurrenceKey}`}>{occurrence.title}</Text>
        ))}
      </View>
    </>
  );
}

/** Rendert eine Probe pro Monat; jeder Monat startet mit `rows` im Cache. */
async function renderMonths(rows: EventWithRelations[], months: readonly Date[] = [OCTOBER]) {
  const queryClient = createTestQueryClient();
  // Ohne `gcTime: Infinity` startet jede Mutation einen 5-Minuten-GC-Timer,
  // der einen Einzellauf von jest so lange offen hält.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    ...defaults,
    mutations: { ...defaults.mutations, gcTime: Infinity },
  });
  queryClient.setQueryData(calendarKeys.types, [familyType]);
  for (const month of months) queryClient.setQueryData(rangeKey(month), rows);
  const handed: Mutations[] = [];
  await renderScreen(
    <>
      {months.map((month, index) => (
        <MonthProbe
          key={month.toISOString()}
          month={month}
          onMutations={index === 0 ? (mutations) => handed.push(mutations) : undefined}
        />
      ))}
    </>,
    { queryClient },
  );
  const mutations = handed.at(-1);
  if (!mutations) throw new Error("Die Probe hat keine Mutationen herausgereicht");
  return { queryClient, mutations };
}

/** Die angezeigten Zeilen mit genau dem Titel „Elternabend" in einem Monat. */
function elternabende(month: Date) {
  return within(screen.getByTestId(`monat-${month.getMonth() + 1}`)).queryAllByText("Elternabend");
}

/**
 * Die drei Mutationen bestätigen ihren Overlay-Eintrag, statt auf das Neuladen
 * zu warten ([ADR-051](../../docs/decision-log.md) Decision 1, 5 und 4).
 * Scheitert das Neuladen, bleibt die gespeicherte Änderung sichtbar.
 */
describe("Kalender-Mutationen: Overlay bis zur bestätigten Serverprojektion", () => {
  beforeEach(() => {
    jest.mocked(fetchEventsInRange).mockReset();
    jest.mocked(fetchEventById).mockReset();
    mockUpsert.mockReset();
    mockApplyChange.mockReset();
    mockUpsert.mockResolvedValue({ data: [{ id: SERVER_ID }], error: null });
    mockApplyChange.mockResolvedValue("applied");
  });

  afterEach(async () => {
    // Der Store lebt auf Modulebene und überdauerte sonst den Test. In `act`,
    // weil die Proben noch gemountet sind und auf das Leeren neu rendern.
    await act(() => useOptimisticEventsStore.getState().clear());
  });

  it("Anlegen, Neuladen scheitert: Termin bleibt", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const { queryClient, mutations } = await renderMonths([]);
    jest.mocked(fetchEventsInRange).mockRejectedValue(offline);

    await act(async () => {
      await mutations.create.mutateAsync(createVars());
      await tick();
    });

    expect(fetchEventsInRange).toHaveBeenCalledTimes(1);
    expect(queryClient.isFetching()).toBe(0);
    expect(errors.mock.calls).toEqual([["Query fehlgeschlagen:", offline]]);
    expect(elternabende(OCTOBER)).toHaveLength(1);
  });

  it("Bearbeiten, Neuladen scheitert: Änderung bleibt", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const event = single();
    const { queryClient, mutations } = await renderMonths([event]);
    jest.mocked(fetchEventById).mockResolvedValue(event);
    jest.mocked(fetchEventsInRange).mockRejectedValue(offline);

    await act(async () => {
      await mutations.update.mutateAsync(updateVars(event));
      await tick();
    });

    expect(mockApplyChange).toHaveBeenCalledTimes(1);
    expect(fetchEventsInRange).toHaveBeenCalledTimes(1);
    expect(queryClient.isFetching()).toBe(0);
    expect(errors.mock.calls).toEqual([["Query fehlgeschlagen:", offline]]);
    const october = within(screen.getByTestId("monat-10"));
    expect(october.queryAllByText("Elternabend neu")).toHaveLength(1);
    expect(october.queryAllByText("Elternabend")).toHaveLength(0);
  });

  it("Löschen, Neuladen scheitert: Termin bleibt weg", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const event = single();
    const { queryClient, mutations } = await renderMonths([event]);
    jest.mocked(fetchEventById).mockResolvedValue(event);
    const refetch = deferred<EventWithRelations[]>();
    jest.mocked(fetchEventsInRange).mockReturnValue(refetch.promise);
    const vars = deleteVars(event);
    const store = usePendingDeleteStore.getState();

    // Derselbe Weg wie `useUndoableDelete`: vormerken, dann ausführen.
    const pendingId = await act(() =>
      store.schedule(
        "event",
        { eventId: vars.eventId, occurrenceKey: vars.occurrenceKey, scope: vars.scope },
        () => mutations.remove.mutateAsync(vars),
      ),
    );
    const commit = { done: false };
    await act(async () => {
      void store.commit(pendingId).then(() => {
        commit.done = true;
      });
      await tick();
    });

    // Das DELETE ist durch, das Neuladen hängt noch.
    expect(mockApplyChange).toHaveBeenCalledTimes(1);
    expect(fetchEventsInRange).toHaveBeenCalledTimes(1);
    expect(elternabende(OCTOBER)).toHaveLength(0);
    const releasedBeforeRefetch = usePendingDeleteStore.getState().entries.length === 0;

    await act(async () => {
      refetch.reject(offline);
      await tick();
    });
    await waitFor(() => expect(commit.done).toBe(true));

    expect(queryClient.isFetching()).toBe(0);
    expect(errors.mock.calls).toEqual([["Query fehlgeschlagen:", offline]]);
    expect(elternabende(OCTOBER)).toHaveLength(0);
    // Der Pending-Delete-Store hatte schon vor dem gescheiterten Neuladen
    // freigegeben: Die Lücke dazwischen ist oben geprüft, nicht übersprungen.
    expect(releasedBeforeRefetch).toBe(true);
  });

  it("Zwei Monate, Antworten zu verschiedenen Zeiten", async () => {
    const { queryClient, mutations } = await renderMonths([], [OCTOBER, NOVEMBER]);
    const fetches = new Map<string, Deferred<EventWithRelations[]>>();
    jest.mocked(fetchEventsInRange).mockImplementation((rangeStart) => {
      const answer = deferred<EventWithRelations[]>();
      fetches.set(rangeStart.toISOString(), answer);
      return answer.promise;
    });
    const answer = (month: Date, rows: EventWithRelations[]) => {
      const pending = fetches.get(rangeOf(month).start.toISOString());
      if (!pending) throw new Error(`Kein Laden für ${month.toISOString()}`);
      pending.resolve(rows);
    };

    const save = { done: false };
    await act(async () => {
      void mutations.create.mutateAsync(createVars()).then(() => {
        save.done = true;
      });
      await tick();
    });
    expect(fetches.size).toBe(2);

    await act(async () => {
      answer(NOVEMBER, [created()]);
      await tick();
    });
    expect(elternabende(OCTOBER)).toHaveLength(1);
    expect(elternabende(NOVEMBER)).toHaveLength(1);
    // Oktober hat noch nicht geantwortet, das Speichern ist trotzdem durch:
    // Keine Mutation wartet auf das Neuladen (ADR-051, Consequences zum Warten).
    expect(save.done).toBe(true);

    await act(async () => {
      answer(OCTOBER, [created()]);
      await tick();
    });
    expect(queryClient.isFetching()).toBe(0);
    expect(elternabende(OCTOBER)).toHaveLength(1);
    expect(elternabende(NOVEMBER)).toHaveLength(1);
    expect(useOptimisticEventsStore.getState().entries).toEqual([]);
  });

  it("Fehler beim Anlegen: Eintrag weg, kein Neuladen", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const { mutations } = await renderMonths([]);
    const failure = { message: "permission denied", code: "42501" };
    const upsert = deferred<UpsertAnswer>();
    mockUpsert.mockReturnValue(upsert.promise);

    const save: { error?: unknown } = {};
    await act(async () => {
      void mutations.create.mutateAsync(createVars()).catch((error: unknown) => {
        save.error = error;
      });
      await tick();
    });
    // Unterwegs steht der Termin schon im Kalender.
    expect(elternabende(OCTOBER)).toHaveLength(1);

    await act(async () => {
      upsert.resolve({ data: null, error: failure });
      await tick();
    });

    expect(save.error).toBe(failure);
    expect(errors.mock.calls).toEqual([["Mutation fehlgeschlagen:", failure]]);
    expect(elternabende(OCTOBER)).toHaveLength(0);
    expect(fetchEventsInRange).not.toHaveBeenCalled();
    expect(useOptimisticEventsStore.getState().entries).toEqual([]);
  });

  it("Abmelden während des Anlegens: Termin kommt nicht zurück", async () => {
    const { queryClient, mutations } = await renderMonths([]);
    const upsert = deferred<UpsertAnswer>();
    mockUpsert.mockReturnValue(upsert.promise);
    // Das Neuladen des nächsten Kontos hängt: Bis es antwortet, zeigt der
    // Monat dessen älteren Datenstand, und genau dort gälte ein neu angelegter
    // gespeicherter Eintrag.
    const refetch = deferred<EventWithRelations[]>();
    jest.mocked(fetchEventsInRange).mockReturnValue(refetch.promise);

    const save = { done: false };
    await act(async () => {
      void mutations.create.mutateAsync(createVars()).then(() => {
        save.done = true;
      });
      await tick();
    });
    expect(elternabende(OCTOBER)).toHaveLength(1);

    // Dieselben zwei Schritte wie `useSignOut`, ohne auf die Mutation zu
    // warten; danach lädt das nächste Konto denselben Range-Key.
    await act(() => {
      queryClient.clear();
      useOptimisticEventsStore.getState().clear();
      queryClient.setQueryData(rangeKey(OCTOBER), []);
    });
    expect(elternabende(OCTOBER)).toHaveLength(0);

    await act(async () => {
      upsert.resolve({ data: [{ id: SERVER_ID }], error: null });
      await tick();
    });

    expect(save.done).toBe(true);
    expect(fetchEventsInRange).toHaveBeenCalledTimes(1);
    expect(elternabende(OCTOBER)).toHaveLength(0);
    expect(useOptimisticEventsStore.getState().entries).toEqual([]);

    await act(async () => {
      refetch.resolve([]);
      await tick();
    });
  });
});

/**
 * `hasData` trennt „der Server hat nie geantwortet“ von „das Neuladen ist
 * gescheitert“ ([ADR-051](../../docs/decision-log.md) Decision 7).
 */
describe("useFamilyEvents: hasData", () => {
  beforeEach(() => {
    jest.mocked(fetchEventsInRange).mockReset();
  });

  it("hasData bleibt nach gescheitertem Refetch", async () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const { queryClient } = await renderMonths([single()]);
    jest.mocked(fetchEventsInRange).mockRejectedValue(offline);

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: rangeKey(OCTOBER) });
    });
    await waitFor(() => expect(queryClient.getQueryState(rangeKey(OCTOBER))?.status).toBe("error"));

    expect(fetchEventsInRange).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls).toEqual([["Query fehlgeschlagen:", offline]]);
    expect(screen.getByTestId("hasdata-10").props.children).toBe("true");
    expect(elternabende(OCTOBER)).toHaveLength(1);
  });

  it("hasData ohne Daten: false", async () => {
    jest.mocked(fetchEventsInRange).mockReturnValue(new Promise(() => {}));
    await renderScreen(<MonthProbe month={OCTOBER} />);

    expect(screen.getByTestId("hasdata-10").props.children).toBe("false");
  });
});
