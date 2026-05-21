import { vars } from "nativewind";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Platform, View, type ViewStyle } from "react-native";

import { themes, type Theme, type ThemeName } from "./themes";
import { useThemeStore } from "./themeStore";

interface ThemeContextValue {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  toggle: () => void;
  // Re-apply on roots of native modals (formSheet/modal/card) — react-native-screens
  // hosts modal content in a separate UIViewController, so style inheritance from
  // the provider's root View doesn't reach them. Spread onto the modal's root View.
  nativeVars: ViewStyle;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function themeToCssVars(theme: Theme): Record<string, string> {
  return {
    "--bg": theme.bg,
    "--bg-raised": theme.bgRaised,
    "--card": theme.card,
    "--card-subtle": theme.cardSubtle,
    "--overlay": theme.overlay,

    "--ink": theme.ink,
    "--ink-secondary": theme.inkSecondary,
    "--ink-tertiary": theme.inkTertiary,
    "--on-mint": theme.onMint,
    "--on-orange": theme.onOrange,

    "--primary": theme.primary,
    "--primary-soft": theme.primarySoft,
    "--primary-strong": theme.primaryStrong,
    "--accent": theme.accent,
    "--accent-soft": theme.accentSoft,
    "--accent-strong": theme.accentStrong,

    "--success": theme.success,
    "--success-soft": theme.successSoft,
    "--warning": theme.warning,
    "--warning-soft": theme.warningSoft,
    "--danger": theme.danger,
    "--danger-soft": theme.dangerSoft,

    "--line": theme.line,
    "--line-strong": theme.lineStrong,
    "--fab-from": theme.fabFrom,
    "--fab-to": theme.fabTo,
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeName = useThemeStore((s) => s.themeName);
  const setTheme = useThemeStore((s) => s.setTheme);
  const toggle = useThemeStore((s) => s.toggle);
  const theme = themes[themeName];

  const cssVars = useMemo(() => themeToCssVars(theme), [theme]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(cssVars)) {
      root.style.setProperty(key, value);
    }
    root.classList.toggle("dark", themeName === "dark");
  }, [cssVars, themeName]);

  const nativeVars = useMemo(() => vars(cssVars) as ViewStyle, [cssVars]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, themeName, setTheme, toggle, nativeVars }),
    [theme, themeName, setTheme, toggle, nativeVars],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, nativeVars]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return ctx;
}
