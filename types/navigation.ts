export type TabKey = "dashboard" | "calendar" | "meals" | "homework" | "family";

export type AuthRoute = "/(auth)/login";
export type TabRoute =
  | "/(tabs)"
  | "/(tabs)/kalender"
  | "/(tabs)/essen"
  | "/(tabs)/aufgaben"
  | "/(tabs)/familie";

export interface TabConfig {
  key: TabKey;
  routeName: "index" | "kalender" | "essen" | "aufgaben" | "familie";
  i18nKey: "nav.dashboard" | "nav.calendar" | "nav.meals" | "nav.homework" | "nav.family";
  icon: "home" | "calendar" | "utensils" | "book" | "users";
}
