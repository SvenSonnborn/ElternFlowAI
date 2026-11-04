import { render, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { Text } from "react-native";

import { GateFrame } from "./AuthGate";

let mounts = 0;

function Probe() {
  useEffect(() => {
    mounts++;
  }, []);
  return <Text>Darunter</Text>;
}

describe("GateFrame", () => {
  beforeEach(() => {
    mounts = 0;
  });

  it("mountet die Kinder beim Wechsel der Deckfläche nicht neu (ADR-040)", async () => {
    const { rerender } = await render(
      <GateFrame covered={false}>
        <Probe />
      </GateFrame>,
    );
    await rerender(
      <GateFrame covered>
        <Probe />
      </GateFrame>,
    );
    await rerender(
      <GateFrame covered={false}>
        <Probe />
      </GateFrame>,
    );
    expect(mounts).toBe(1);
  });

  it("versteckt die Kinder nativ vor Screenreadern, solange die Deckfläche liegt", async () => {
    const { rerender } = await render(
      <GateFrame covered>
        <Probe />
      </GateFrame>,
    );
    expect(screen.queryByText("Darunter")).toBeNull();
    expect(screen.getByText("Darunter", { includeHiddenElements: true })).toBeTruthy();

    await rerender(
      <GateFrame covered={false}>
        <Probe />
      </GateFrame>,
    );
    expect(screen.getByText("Darunter")).toBeTruthy();
  });
});
