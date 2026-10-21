import { fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import type { MealPlanDay, MealSlot } from "@/features/meals";

import { renderScreen } from "@/testing/renderScreen";

import { WeekPlanGrid } from "./WeekPlanGrid";

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

describe("WeekPlanGrid — leere Tage", () => {
  it("rendert bei sieben leeren Tagen sieben Zeilen", async () => {
    await renderScreen(<WeekPlanGrid days={emptyWeek} />);
    expect(screen.getAllByText("Noch nichts geplant")).toHaveLength(7);
  });

  it("öffnet die Auswahl mit Datum und Slot des Abendessen-Tabs", async () => {
    await renderScreen(<WeekPlanGrid days={emptyWeek} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Abendessen" }));
    await fireEvent.press(screen.getByLabelText("Abendessen am Mittwoch planen"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/meal/pick",
      params: { date: "2026-10-28", slot: "dinner" },
    });
  });
});
