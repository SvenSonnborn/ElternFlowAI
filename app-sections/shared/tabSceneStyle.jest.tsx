import { Stack } from "expo-router";
import { fireEvent, renderRouter, screen, testRouter } from "expo-router/testing-library";
import { StyleSheet, Text } from "react-native";

import TabsLayout from "@/app/(tabs)/_layout";
import { ThemeProvider } from "@/design-system/ThemeProvider";
import i18n from "@/features/i18n";

// Unter jest-expo ist `Platform.OS` "ios", dort versteckt `tabSceneStyle` nie
// etwas. Gerechnet wird deshalb wie auf Web; geprüft wird, ob das Tab-Layout
// die richtige fokussierte Route hineinreicht.
jest.mock("./tabSceneStyle", () => {
  const actual = jest.requireActual<typeof import("./tabSceneStyle")>("./tabSceneStyle");
  return {
    tabSceneStyle: (input: Parameters<typeof actual.tabSceneStyle>[0]) =>
      actual.tabSceneStyle({ ...input, os: "web" }),
  };
});

/** Liegt über dem Text eine Szene mit `visibility: hidden`? */
function isInHiddenScene(text: string): boolean {
  let node: ReturnType<typeof screen.getByText> | null = screen.getByText(text, {
    includeHiddenElements: true,
  });
  while (node) {
    const style = StyleSheet.flatten(node.props.style) as { visibility?: string } | undefined;
    if (style?.visibility === "hidden") return true;
    node = node.parent;
  }
  return false;
}

async function renderTabs() {
  await i18n.changeLanguage("de");
  await renderRouter(
    {
      _layout: () => <Stack screenOptions={{ headerShown: false }} />,
      einstellungen: () => <Text>Einstellungen-Inhalt</Text>,
      "(tabs)/_layout": TabsLayout,
      "(tabs)/index": () => <Text>Dashboard-Inhalt</Text>,
      "(tabs)/kalender": () => <Text>Kalender-Inhalt</Text>,
      "(tabs)/essen": () => null,
      "(tabs)/aufgaben": () => null,
      "(tabs)/familie": () => null,
    },
    { initialUrl: "/", wrapper: ThemeProvider },
  );
}

describe("Tab-Layout: auf Web ist genau die fokussierte Szene sichtbar", () => {
  it("nach einem Tab-Wechsel ist der neue Tab sichtbar und der alte versteckt", async () => {
    await renderTabs();
    expect(isInHiddenScene("Dashboard-Inhalt")).toBe(false);

    await fireEvent.press(screen.getByText(i18n.t("nav.calendar")));

    expect(isInHiddenScene("Kalender-Inhalt")).toBe(false);
    expect(isInHiddenScene("Dashboard-Inhalt")).toBe(true);
  });

  it("ein Root-Screen über den Tabs lässt die fokussierte Szene sichtbar, auch nach dem Schließen", async () => {
    await renderTabs();
    await fireEvent.press(screen.getByText(i18n.t("nav.calendar")));

    await testRouter.push("/einstellungen");
    expect(isInHiddenScene("Kalender-Inhalt")).toBe(false);

    await testRouter.back("/kalender");
    expect(isInHiddenScene("Kalender-Inhalt")).toBe(false);
    expect(isInHiddenScene("Dashboard-Inhalt")).toBe(true);
  });
});
