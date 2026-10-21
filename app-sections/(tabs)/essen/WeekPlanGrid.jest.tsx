import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { useState } from "react";

import type { MealPlanDay, MealPlanEntryWithRecipe, MealSlot, RecipeRow } from "@/features/meals";

import {
  mealKeys,
  normalizeRecipeFilter,
  shiftWeek,
  slotForTime,
  toDateKey,
  weekDayKeys,
  weekStartFor,
} from "@/features/meals";
import { usePendingDeleteStore } from "@/features/shared";
import { createTestQueryClient, renderScreen } from "@/testing/renderScreen";

import { EssenScreen } from "./EssenScreen";
import { WeekPlanGrid } from "./WeekPlanGrid";

const mockRemove = jest.fn();

jest.mock("@/features/meals", () => ({
  ...jest.requireActual<typeof import("@/features/meals")>("@/features/meals"),
  useRemoveMeal: () => ({ mutateAsync: mockRemove }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

/** Sieben leere Tage: Mo 26.10. bis So 01.11.2026. */
const emptyWeek: MealPlanDay[] = [
  "2026-10-26",
  "2026-10-27",
  "2026-10-28",
  "2026-10-29",
  "2026-10-30",
  "2026-10-31",
  "2026-11-01",
].map((date) => ({
  date,
  isToday: false,
  slots: Object.fromEntries(SLOTS.map((s) => [s, null])) as MealPlanDay["slots"],
}));

/** Hält Slot und offenes Menü wie `EssenScreen`, damit das Raster allein testbar bleibt. */
function Grid({ days }: { days: MealPlanDay[] }) {
  const [slot, setSlot] = useState<MealSlot>(() => slotForTime(new Date()));
  const [openMenuDate, setOpenMenuDate] = useState<string | null>(null);
  return (
    <WeekPlanGrid
      days={days}
      slot={slot}
      onSlotChange={setSlot}
      openMenuDate={openMenuDate}
      onOpenMenuChange={setOpenMenuDate}
    />
  );
}

describe("WeekPlanGrid — leere Tage", () => {
  it("rendert bei sieben leeren Tagen sieben Zeilen", async () => {
    await renderScreen(<Grid days={emptyWeek} />);
    expect(screen.getAllByText("Noch nichts geplant")).toHaveLength(7);
  });

  it("öffnet die Auswahl mit Datum und Slot des Abendessen-Tabs", async () => {
    await renderScreen(<Grid days={emptyWeek} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Abendessen" }));
    await fireEvent.press(screen.getByLabelText("Abendessen am Mittwoch, 28.10. planen"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/meal/pick",
      params: { date: "2026-10-28", slot: "dinner" },
    });
  });
});

const nudeln: RecipeRow = {
  id: "r1",
  title: { de: "Nudeln mit Tomatensoße", en: "Pasta" },
  description: null,
  ingredients: [],
  instructions: [],
  contains_allergens: [],
  created_at: "2026-09-01T00:00:00.000Z",
  created_by_family_id: null,
  diet_tags: [],
  difficulty: null,
  duration_min: 20,
  fetched_at: "2026-09-01T00:00:00.000Z",
  image_url: null,
  keywords: [],
  recipe_dedup_hash: "h1",
  servings: 4,
  source: "user_custom",
  source_external_id: null,
  source_url: null,
};

function entry(overrides: Partial<MealPlanEntryWithRecipe> = {}): MealPlanEntryWithRecipe {
  return {
    id: "e1",
    family_id: "f1",
    date: "2026-10-28",
    meal_slot: "dinner",
    recipe_id: "r1",
    servings_override: null,
    notes: null,
    created_by: null,
    created_at: "2026-10-01T00:00:00.000Z",
    recipe: nudeln,
    ...overrides,
  };
}

function weekWith(e: MealPlanEntryWithRecipe): MealPlanDay[] {
  return emptyWeek.map((day) =>
    day.date === e.date ? { ...day, slots: { ...day.slots, [e.meal_slot]: e } } : day,
  );
}

async function openMenu() {
  await fireEvent.press(screen.getByRole("tab", { name: "Abendessen" }));
  await fireEvent.press(screen.getByLabelText("Aktionen für Mittwoch"));
}

describe("WeekPlanGrid — Zeilen-Menü", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemove.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(() => usePendingDeleteStore.getState().flush());
  });

  it("zeigt Ersetzen und Löschen erst nach dem Öffnen und meldet expanded", async () => {
    await renderScreen(<Grid days={weekWith(entry())} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Abendessen" }));
    expect(screen.queryByText("Anderes Rezept wählen")).toBeNull();
    const toggle = screen.getByLabelText("Aktionen für Mittwoch");
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(toggle);
    expect(screen.getByText("Anderes Rezept wählen")).toBeTruthy();
    expect(screen.getByText("Löschen")).toBeTruthy();
    expect(screen.getByLabelText("Aktionen für Mittwoch").props.accessibilityState).toMatchObject({
      expanded: true,
    });
  });

  it("Anderes Rezept wählen pusht die Auswahl mit Ersetzen-Ziel", async () => {
    await renderScreen(<Grid days={weekWith(entry())} />);
    await openMenu();
    await fireEvent.press(screen.getByText("Anderes Rezept wählen"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/meal/pick",
      params: { date: "2026-10-28", slot: "dinner", entryId: "e1", seenRecipeId: "r1" },
    });
  });

  it("Löschen führt die Mutation erst nach dem Undo-Fenster aus", async () => {
    await renderScreen(<Grid days={weekWith(entry())} />);
    await openMenu();
    await fireEvent.press(screen.getByText("Löschen"));
    expect(mockRemove).not.toHaveBeenCalled();
    await act(() => usePendingDeleteStore.getState().flush());
    expect(mockRemove).toHaveBeenCalledWith({
      entryId: "e1",
      seenRecipeId: "r1",
      date: "2026-10-28",
      slot: "dinner",
    });
  });

  it("öffnet immer nur ein Menü, und ein Slot-Wechsel schließt es", async () => {
    const days = weekWith(entry());
    const second = entry({ id: "e2", date: "2026-10-29" });
    const both = days.map((d) =>
      d.date === second.date ? { ...d, slots: { ...d.slots, dinner: second } } : d,
    );
    await renderScreen(<Grid days={both} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Abendessen" }));
    await fireEvent.press(screen.getByLabelText("Aktionen für Mittwoch"));
    await fireEvent.press(screen.getByLabelText("Aktionen für Donnerstag"));
    expect(screen.getAllByText("Löschen")).toHaveLength(1);
    await fireEvent.press(screen.getByRole("tab", { name: "Mittag" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Abendessen" }));
    expect(screen.queryByText("Löschen")).toBeNull();
  });

  it("hat bei einer optimistischen Zeile kein bedienbares Menü", async () => {
    await renderScreen(<Grid days={weekWith(entry({ id: "optimistic:2026-10-28:dinner" }))} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Abendessen" }));
    expect(screen.queryByLabelText("Aktionen für Mittwoch")).toBeNull();
  });
});

describe("EssenScreen — gelöschte Zeile", () => {
  afterEach(async () => {
    await act(() => usePendingDeleteStore.getState().flush());
  });

  it("zeigt nach dem Löschen wieder Noch nichts geplant", async () => {
    mockRemove.mockResolvedValue(undefined);
    const start = weekStartFor(new Date());
    const wednesday = weekDayKeys(start)[2];
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(mealKeys.plan(toDateKey(start)), [entry({ date: wednesday })]);
    queryClient.setQueryData(mealKeys.recipes(normalizeRecipeFilter({ search: "" })), [nudeln]);

    await renderScreen(<EssenScreen />, { queryClient });
    await fireEvent.press(screen.getByRole("tab", { name: "Abendessen" }));
    expect(screen.getAllByText("Noch nichts geplant")).toHaveLength(6);
    await fireEvent.press(screen.getByLabelText(/^Aktionen für /));
    await fireEvent.press(screen.getByText("Löschen"));
    expect(screen.getAllByText("Noch nichts geplant")).toHaveLength(7);
  });
});

describe("EssenScreen — Blättern", () => {
  const start = weekStartFor(new Date());
  const next = shiftWeek(start, 1);

  function seeded() {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(mealKeys.recipes(normalizeRecipeFilter({ search: "" })), [nudeln]);
    return queryClient;
  }

  it("behält den Slot-Tab, während die neue Woche lädt", async () => {
    const queryClient = seeded();
    queryClient.setQueryData(mealKeys.plan(toDateKey(start)), [] as MealPlanEntryWithRecipe[]);
    // Die nächste Woche lädt schon und antwortet erst auf Zuruf: Der Screen
    // hängt sich an diesen Abruf, statt einen eigenen (gegen den Supabase-Stub)
    // zu starten, und zeigt solange den Spinner statt des Rasters.
    let answer: (entries: MealPlanEntryWithRecipe[]) => void = () => {};
    void queryClient.prefetchQuery({
      queryKey: mealKeys.plan(toDateKey(next)),
      queryFn: () =>
        new Promise<MealPlanEntryWithRecipe[]>((resolve) => {
          answer = resolve;
        }),
    });

    await renderScreen(<EssenScreen />, { queryClient });
    await fireEvent.press(screen.getByRole("tab", { name: "Snack" }));
    await fireEvent.press(screen.getByLabelText("Nächste Woche"));
    // Das Raster ist abgebaut — genau hier ging der Tab früher verloren.
    expect(screen.queryByRole("tab", { name: "Snack" })).toBeNull();

    await act(async () => {
      answer([]);
      await Promise.resolve();
    });
    expect(screen.getByRole("tab", { name: "Snack" }).props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it("schließt ein offenes Menü beim Blättern, auch beim Zurückblättern", async () => {
    const queryClient = seeded();
    const wednesday = weekDayKeys(start)[2];
    queryClient.setQueryData(mealKeys.plan(toDateKey(start)), [entry({ date: wednesday })]);
    queryClient.setQueryData(mealKeys.plan(toDateKey(next)), [] as MealPlanEntryWithRecipe[]);

    await renderScreen(<EssenScreen />, { queryClient });
    await fireEvent.press(screen.getByRole("tab", { name: "Abendessen" }));
    await fireEvent.press(screen.getByLabelText(/^Aktionen für /));
    expect(screen.getByText("Löschen")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Nächste Woche"));
    expect(screen.queryByText("Löschen")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Vorherige Woche"));
    expect(screen.getByLabelText(/^Aktionen für /)).toBeTruthy();
    expect(screen.queryByText("Löschen")).toBeNull();
  });
});
