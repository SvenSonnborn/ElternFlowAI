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
    await renderScreen(<Field label="Datum" value="heute" onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button", { name: "Datum" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
