/**
 * Schriften der App für iOS und Android — hier gibt es nichts zu laden.
 *
 * Inter ist nativ zur Build-Zeit eingebettet: Der Config-Plugin von `expo-font`
 * in `app.json` legt die fünf Schnitte (400–800) aus `@expo-google-fonts/inter`
 * ins Binary, `fontFamily: "Inter"` plus `fontWeight` wählt den Schnitt. Die
 * Schrift wirkt deshalb erst nach Prebuild und neuem nativen Build, nicht per
 * Reload. Auf Web übernimmt `fonts.web.ts`; Metro wählt die Datei nach Plattform.
 */
export function useAppFonts(): void {}
