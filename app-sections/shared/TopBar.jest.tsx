import type { ComponentProps } from "react";

import { fireEvent, screen } from "@testing-library/react-native";

import { touchTarget } from "@/design-system";
import i18n from "@/features/i18n";
import { renderScreen } from "@/testing/renderScreen";

import { TopBar } from "./TopBar";

describe("TopBar: Knöpfe mit Namen und 44er-Tippfläche", () => {
  it("benennt das Zahnrad mit dem übersetzten Titel der Einstellungen", async () => {
    await renderScreen(<TopBar title="Kalender" />);
    expect(screen.getByRole("button", { name: i18n.t("set.title") })).toBeTruthy();
  });

  it("benennt den Plus-Knopf mit addLabel und ruft onAdd", async () => {
    const onAdd = jest.fn();
    await renderScreen(<TopBar title="Kalender" onAdd={onAdd} addLabel="Termin anlegen" />);
    await fireEvent.press(screen.getByRole("button", { name: "Termin anlegen" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("gibt beiden Knöpfen eine Box von touchTarget.min", async () => {
    await renderScreen(<TopBar title="Kalender" onAdd={() => {}} addLabel="Termin anlegen" />);
    const box = { width: touchTarget.min, height: touchTarget.min };
    expect(screen.getByRole("button", { name: "Termin anlegen" })).toHaveStyle(box);
    expect(screen.getByRole("button", { name: i18n.t("set.title") })).toHaveStyle(box);
  });

  it("verlangt zu onAdd ein addLabel", () => {
    // @ts-expect-error -- ohne addLabel bliebe der Plus-Knopf für Screenreader namenlos
    const props: ComponentProps<typeof TopBar> = { title: "Kalender", onAdd: () => {} };
    expect(props.title).toBe("Kalender");
  });
});
