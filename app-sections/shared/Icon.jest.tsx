import { isHiddenFromAccessibility, render, screen } from "@testing-library/react-native";

import { Icon } from "./Icon";

describe("Icon", () => {
  it.each(["settings", "cake"] as const)(
    "versteckt die Glyphe von %s vor Screenreadern",
    async (name) => {
      await render(<Icon name={name} />);
      expect(isHiddenFromAccessibility(screen.root)).toBe(true);
    },
  );
});
