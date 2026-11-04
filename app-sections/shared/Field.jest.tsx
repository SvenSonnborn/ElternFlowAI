import { fireEvent, screen } from "@testing-library/react-native";

import { renderScreen } from "@/testing/renderScreen";

import { Field } from "./Field";

describe("Field: das Label ist der Name des Eingabefelds", () => {
  it("beschriftet das TextInput mit dem Label", async () => {
    await renderScreen(<Field label="Titel" value="" onChangeText={() => {}} />);
    expect(screen.getByLabelText("Titel")).toBeTruthy();
  });

  it("nimmt das sichtbare Label aus dem Baum, damit es nicht doppelt angesagt wird", async () => {
    await renderScreen(<Field label="Titel" value="" onChangeText={() => {}} />);
    expect(screen.queryByText("Titel")).toBeNull();
    expect(screen.getByText("Titel", { includeHiddenElements: true })).toBeTruthy();
  });

  it("die onPress-Variante bleibt als Knopf mit Namen auffindbar", async () => {
    const onPress = jest.fn();
    await renderScreen(<Field label="Datum" value="" onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button", { name: "Datum" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("die onPress-Variante sagt den gewählten Wert an", async () => {
    await renderScreen(<Field label="Datum" value="4. Nov. 2026" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Datum, 4. Nov. 2026" })).toBeTruthy();
  });

  it("die onPress-Variante hat genau ein Element mit dem Label, das innere Feld ist ausgeblendet", async () => {
    await renderScreen(<Field label="Datum" value="4. Nov. 2026" onPress={() => {}} />);
    const named = screen.getAllByLabelText(/^Datum/);
    expect(named).toHaveLength(1);
    expect(named[0]).toBe(screen.getByRole("button", { name: /^Datum/ }));
    const hidden = screen.getByDisplayValue("4. Nov. 2026", { includeHiddenElements: true });
    expect(screen.queryByDisplayValue("4. Nov. 2026")).toBeNull();
    expect(hidden.props.focusable).toBe(false);
  });

  it("das einzeilige Eingabefeld füllt die Zeilenhöhe, damit die ganze Zeile antippbar ist", async () => {
    await renderScreen(<Field label="Titel" value="" onChangeText={() => {}} />);
    expect(screen.getByLabelText("Titel")).toHaveStyle({ alignSelf: "stretch" });
  });
});
