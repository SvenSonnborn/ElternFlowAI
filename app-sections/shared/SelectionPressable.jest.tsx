import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import { SelectionPressable } from "./SelectionPressable";

// Ohne `renderScreen`: dessen ThemeProvider schreibt bei `Platform.OS === "web"`
// CSS-Variablen ins `document`, das es unter jest-expo nicht gibt.

function keyDown(key: string, repeat = false) {
  return { nativeEvent: { key, repeat }, preventDefault: jest.fn() };
}

describe("SelectionPressable: die Leertaste wählt auf Web aus", () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, "OS", "web");
  });

  it("die Leertaste löst onPress aus und scrollt die Seite nicht", async () => {
    const onPress = jest.fn();
    await render(
      <SelectionPressable
        accessibilityRole="radio"
        accessibilityLabel="Rot"
        aria-checked={false}
        onPress={onPress}
      />,
    );
    const event = keyDown(" ");
    await fireEvent(screen.getByRole("radio", { name: "Rot" }), "keyDown", event);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("andere Tasten und eine gehaltene Leertaste lösen nichts aus", async () => {
    const onPress = jest.fn();
    await render(
      <SelectionPressable
        accessibilityRole="checkbox"
        accessibilityLabel="Nüsse"
        aria-checked={false}
        onPress={onPress}
      />,
    );
    const box = screen.getByRole("checkbox", { name: "Nüsse" });
    await fireEvent(box, "keyDown", keyDown("a"));
    await fireEvent(box, "keyDown", keyDown(" ", true));
    expect(onPress).not.toHaveBeenCalled();
  });

  // RNTL feuert auf deaktivierten Elementen ohnehin nicht; geprüft wird deshalb
  // der Handler selbst. Auf Web käme ein Tastendruck sonst durch (TaskRow sperrt
  // sich während des Schreibens, ein zweites Leerzeichen schriebe doppelt).
  it("deaktiviert hängt sie keinen Handler an", async () => {
    await render(
      <SelectionPressable
        accessibilityRole="switch"
        accessibilityLabel="Ganztägig"
        aria-checked={false}
        disabled
        onPress={() => {}}
      />,
    );
    expect(screen.getByRole("switch", { name: "Ganztägig" }).props.onKeyDown).toBeUndefined();
  });

  it("bei Rolle button löst react-native-web die Leertaste selbst aus, ein zweiter Handler fehlt", async () => {
    await render(
      <SelectionPressable
        accessibilityRole="button"
        accessibilityLabel="Weiter"
        onPress={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Weiter" }).props.onKeyDown).toBeUndefined();
  });
});

describe("SelectionPressable: nativ", () => {
  it("hängt keinen Tastatur-Handler an", async () => {
    await render(
      <SelectionPressable
        accessibilityRole="radio"
        accessibilityLabel="Rot"
        aria-checked={false}
        onPress={() => {}}
      />,
    );
    expect(screen.getByRole("radio", { name: "Rot" }).props.onKeyDown).toBeUndefined();
  });
});
