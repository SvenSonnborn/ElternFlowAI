// Expo Router lädt diese Datei selbst, wenn es seine Linking-Konfiguration
// baut, und ruft `redirectSystemPath` nur nativ. Direkter Modulpfad statt des
// Barrels `@/features/auth`: Das brächte AuthGate, Queries und Mutationen mit,
// die zum Umschreiben eines Pfads nichts beitragen.
export { redirectInviteSystemPath as redirectSystemPath } from "@/features/auth/deepLinkHandler";
