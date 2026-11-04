import { useFonts } from "expo-font";

import { fontFamily } from "./typography";

/**
 * Lädt im Browser die fünf Inter-Schnitte (400–800), ohne dass jemand darauf wartet.
 *
 * Kein Gating: Beim statischen Export (`web.output: "static"`) läuft `useFonts` im
 * Server-Render synchron über `registerStaticFont` und schreibt je Schnitt eine
 * `@font-face`-Regel und ein `<link rel="preload">` ins HTML — die Schrift lädt,
 * bevor das JS hydriert. Ein Warten auf `loaded` hinge den Root-`<Stack>` an den
 * Ladezustand und ersetzte ihn bis dahin (ADR-040). Den Fehler wertet ebenfalls
 * niemand aus: Schlägt das Laden fehl, rendert die App in der Ausweichschrift.
 *
 * Alle Schnitte stehen in einem Aufruf, weil `expo-font` eine Familie nur einmal
 * lädt; ein späterer Aufruf ergänzte keine Schnitte. Die fünf Dateien werden
 * einzeln verlangt statt über den Index des Pakets, der alle 18 Schnitte
 * mitbrächte; Metro liefert für eine Asset-Datei deren Kennung im Asset-Registry,
 * daher `as number`. Nativ ist die Schrift eingebettet, siehe `fonts.ts`.
 */
export function useAppFonts(): void {
  useFonts([
    {
      fontFamily: fontFamily.sans,
      fontDefinitions: [
        {
          path: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf") as number,
          weight: 400,
        },
        {
          path: require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf") as number,
          weight: 500,
        },
        {
          path: require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf") as number,
          weight: 600,
        },
        {
          path: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf") as number,
          weight: 700,
        },
        {
          path: require("@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf") as number,
          weight: 800,
        },
      ],
    },
  ]);
}
