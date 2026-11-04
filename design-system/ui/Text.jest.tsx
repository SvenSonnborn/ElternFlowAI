import { screen } from "@testing-library/react-native";
import { type StyleProp, StyleSheet, type TextStyle } from "react-native";

import { renderScreen } from "@/testing/renderScreen";

import { textStyles } from "../typography";
import { Text } from "./Text";

const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as StyleProp<TextStyle>) ?? {};

describe("Text", () => {
  it("setzt Inter als Basis", async () => {
    await renderScreen(<Text>Hallo</Text>);
    expect(flat(screen.getByText("Hallo")).fontFamily).toBe("Inter");
  });

  it("lässt den Aufrufer überschreiben", async () => {
    await renderScreen(<Text style={{ fontFamily: "Courier" }}>Hallo</Text>);
    expect(flat(screen.getByText("Hallo")).fontFamily).toBe("Courier");
  });

  it("behält Gewicht und Größe des Presets", async () => {
    await renderScreen(<Text variant="hero">Hallo</Text>);
    expect(flat(screen.getByText("Hallo"))).toMatchObject({
      fontFamily: "Inter",
      fontWeight: textStyles.hero.fontWeight,
      fontSize: textStyles.hero.fontSize,
    });
  });
});
