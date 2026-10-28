/** Schlüssel unter `dash.greeting.*`. */
export type GreetingKey = "morning" | "day" | "evening";

/**
 * Wählt die Begrüßung nach der Gerätezeit (`getHours()`, nicht UTC).
 * Fenster: 05:00–10:59 `morning`, 11:00–17:59 `day`, 18:00–04:59 `evening`;
 * die Nacht gehört zum Abend, weil es keine eigene Nacht-Begrüßung gibt.
 * Die Grenzen sind eine Entscheidung von Claude, nicht aus dem Handoff-Bundle.
 */
export function greetingKey(now: Date): GreetingKey {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 18) return "day";
  return "evening";
}
