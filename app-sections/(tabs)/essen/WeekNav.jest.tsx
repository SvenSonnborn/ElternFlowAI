import { fireEvent, screen } from "@testing-library/react-native";

import { shiftWeek, weekStartFor } from "@/features/meals";
import { renderScreen } from "@/testing/renderScreen";

import { WeekNav } from "./WeekNav";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));

const weekStart = new Date(2026, 9, 26);

describe("WeekNav", () => {
  it("› meldet die nächste Woche", async () => {
    const onChange = jest.fn();
    await renderScreen(<WeekNav weekStart={weekStart} isCurrentWeek={false} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText("Nächste Woche"));
    expect(onChange).toHaveBeenCalledWith(shiftWeek(weekStart, 1));
  });

  it("‹ meldet die vorige Woche", async () => {
    const onChange = jest.fn();
    await renderScreen(<WeekNav weekStart={weekStart} isCurrentWeek={false} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText("Vorherige Woche"));
    expect(onChange).toHaveBeenCalledWith(shiftWeek(weekStart, -1));
  });

  it("Diese Woche springt zurück zur aktuellen Woche", async () => {
    const onChange = jest.fn();
    await renderScreen(<WeekNav weekStart={weekStart} isCurrentWeek={false} onChange={onChange} />);
    await fireEvent.press(screen.getByText("Diese Woche"));
    expect(onChange).toHaveBeenCalledWith(weekStartFor(new Date()));
  });

  it("zeigt Diese Woche nicht, solange die aktuelle Woche offen ist", async () => {
    await renderScreen(<WeekNav weekStart={weekStart} isCurrentWeek onChange={jest.fn()} />);
    expect(screen.queryByText("Diese Woche")).toBeNull();
  });
});
