import { DS } from "@/design-system";
import { themes, lightTheme, darkTheme } from "@/design-system/themes";

describe("design-system themes", () => {
  it("exposes light and dark themes", () => {
    expect(Object.keys(themes).sort()).toEqual(["dark", "light"]);
  });

  it("every theme defines the full semantic role surface", () => {
    const requiredKeys: (keyof typeof lightTheme)[] = [
      "bg",
      "bgRaised",
      "card",
      "cardSubtle",
      "overlay",
      "ink",
      "inkSecondary",
      "inkTertiary",
      "onMint",
      "onOrange",
      "primary",
      "primarySoft",
      "primaryStrong",
      "accent",
      "accentSoft",
      "accentStrong",
      "success",
      "successSoft",
      "warning",
      "warningSoft",
      "danger",
      "dangerSoft",
      "line",
      "lineStrong",
      "fabFrom",
      "fabTo",
    ];
    for (const key of requiredKeys) {
      expect(lightTheme[key]).toBeTruthy();
      expect(darkTheme[key]).toBeTruthy();
    }
  });

  it("DS barrel exposes the expected token groups", () => {
    expect(DS.palette).toBeDefined();
    expect(DS.brand.primary).toBe("#4ECDC4");
    expect(DS.type.textStyles.body).toBeDefined();
    expect(DS.layout.space[4]).toBe(16);
    expect(DS.components.micFab.size).toBe(60);
  });
});
