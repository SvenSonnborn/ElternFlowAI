import { create } from "zustand";

import type { ThemeName } from "./themes";

interface ThemeState {
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeName: "light",
  setTheme: (name) => set({ themeName: name }),
  toggle: () => set((state) => ({ themeName: state.themeName === "light" ? "dark" : "light" })),
}));
