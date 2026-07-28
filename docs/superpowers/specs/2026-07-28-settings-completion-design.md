# Design: Phase 1 — Einstellungen vervollständigen

**Datum:** 2026-07-28
**Branch:** `feat/settings-phase-1`
**Issue:** Phase 1: Einstellungen vervollständigen (`enhancement`, `phase-1`, `foundation`, `ui-ux`)
**Status:** Freigegeben (Brainstorming)

## Ziel

Der Settings-Screen ist der letzte Screen, der komplett auf `features/sample-data` läuft und
dessen Aktionen durchweg No-Ops sind. Fünf Punkte aus dem Issue:

1. Logout über `useSignOut` verdrahten.
2. Familienmitglieder-Zahl aus Live-Daten (`useFamilyParents` + `useFamilyChildren`).
3. Notifications-Einstieg vorbereiten (Deep-Link in die OS-Einstellungen, **keine** eigene Push-Logik).
4. App-Version korrekt aus `expo-constants` anzeigen.
5. Subscription/Plus sauber als „coming soon" kennzeichnen.

## Kontext / Ist-Zustand

[app-sections/settings/SettingsScreen.tsx](../../../app-sections/settings/SettingsScreen.tsx):

- Profil-Card liest `parents[0]` aus `@/features/sample-data` (Name, E-Mail, Avatar-Farbe),
  Footer liest `familyName`, Member-Count ist `parents.length + children.length` — alles Sample.
- `set.logout`, `set.privacy`, `set.connectedApps`, `set.help`, `set.voice`, `set.subscription`
  und `set.notifications` haben `onPress={() => {}}` — sichtbares Chevron, keine Wirkung.
- `set.notifications` zeigt hart `t("action.on")`, obwohl die App den OS-Status nicht kennt.
- Version kommt aus `pkg.version` (`package.json`-Import), nicht aus der Expo-Config.

Vorhandene Bausteine (nichts davon muss neu gebaut werden):

- `useSignOut` ([features/auth/mutations.ts](../../../features/auth/mutations.ts)) — `supabase.auth.signOut()`
  plus `queryClient.clear()` in `onSettled`.
- `useCurrentParent` / `useFamilyParents` / `useFamilyChildren` ([features/auth/familyQueries.ts](../../../features/auth/familyQueries.ts)).
- `useSession` liefert `session.user.email` — die E-Mail liegt in `auth.users`, **nicht** in `parents`
  (siehe `docs/TODO.md`, „Parent-Subtitle/-Edit im Familie-Tab").
- `mapAuthError` für Fehlermeldungen.
- `expo-constants ~57.0.6` ist bereits Dependency.
- i18n-Key `auth.soon` (DE „Bald verfügbar" / EN „Coming soon") existiert.

## Design-Entscheidungen

### D1 — Profil-Card auf Live-Daten

Name + Avatar-Farbe aus `useCurrentParent()`, E-Mail aus `useSession().session?.user.email`.
Damit verschwindet die letzte `sample-data`-Abhängigkeit des Screens. Formal etwas über die fünf
Issue-Punkte hinaus, aber ein fremder Sample-Name direkt neben einem echten Member-Count wäre
schlicht falsche Information.

### D2 — Keine neuen i18n-Keys

`docs/COPY.md` ist designer-eigen und laut CLAUDE.md off-limits. Alle Texte kommen aus
existierenden Keys: `auth.soon`, `set.logout`, `action.cancel`, `auth.error.*` via `mapAuthError`.
Der Logout-Confirm nutzt `t("set.logout")` als Alert-Titel ohne Body-Text — ein Body bräuchte
einen neuen Key.

### D3 — Logout ohne manuelle Navigation

`signOut.mutate()` → Session wird `null` → `AuthGate`/`decideRoute` sieht `unauthenticated` bei
Gruppe `"other"` (die Route `/settings` liegt in keiner Gruppe) und redirectet auf `/(auth)/login`.
Ein `router.replace` wäre redundant und würde mit dem Redirect konkurrieren.
Bestätigung via `Alert.alert` mit `style: "destructive"` — gleiches Muster wie der Event-Delete in
[EventDetailScreen.tsx](../../../app-sections/event/EventDetailScreen.tsx).

### D4 — Loading/Error degradieren still

Kein Voll-Screen-Spinner und keine Error-Card. Sprache, Dark Mode und vor allem **Abmelden**
funktionieren ohne Netzwerk; ein hängender oder fehlgeschlagener Query darf sie nicht blockieren.
Nicht geladene Werte rendern `—`.

### D5 — Notifications = `Linking.openSettings()`

React-Native-Core, kein neues Paket, keine Push-Registrierung (Expo Notifications bleibt laut
`docs/TODO.md` eine eigene Iteration). Der hartcodierte Wert `t("action.on")` entfällt, weil die App
den OS-Berechtigungsstatus ohne Push-Layer nicht kennt.
`Linking.openSettings()` ist auf Web nicht implementiert → dort wird die Row als „Bald verfügbar"
gerendert (`Platform.OS === "web"`).

### D6 — Version aus `expo-constants`, ohne Build-Nummer

`Constants.expoConfig?.version` mit `package.json` als Fallback (Constants kann in manchen
Web-/Test-Kontexten leer sein). `app.json` hat weder `ios.buildNumber` noch `android.versionCode`;
diese anzulegen wäre eine Änderung an der nativen Build-Konfiguration und gehört zum
Release-/EAS-Setup, nicht hierher.
Footer-Format folgt [patterns/settings-voice.md](../../../patterns/settings-voice.md):
`Eltern Flow · v{semver} · Made in Berlin` — der vorangestellte Sample-`familyName` entfällt.

### D7 — „Coming soon" einheitlich

Die `Row`-Komponente bekommt ein `soon`-Flag: rendert `t("auth.soon")` als Value, kein Chevron,
kein `onPress`, `accessibilityState={{ disabled: true }}`.
Betroffen: Sprachassistent, Datenschutz, Verknüpfte Apps, Eltern Flow Plus, Hilfe & Support
sowie das Plus-Pill in der Profil-Card (Label → `t("auth.soon")`, neutrale statt Accent-Tönung —
ein „Plus"-Pill würde ein aktives Abo behaupten, das es nicht gibt).

Aktiv bleiben: Sprache, Dark Mode, Mitteilungen, Familienmitglieder (→ `/familie`), Abmelden.

## Umsetzung

Eine Datei ändert sich substanziell: `app-sections/settings/SettingsScreen.tsx`. Kein neues
Feature-Modul, kein neuer Hook, keine Änderung an Schema, Routing oder Handoff-Bundle. Wegen des
Zuschnitts (eine Datei, keine Reihenfolge-Abhängigkeiten) gibt es kein separates Plan-Dokument —
dieses Design ist die Umsetzungsvorlage.

## Tests

Keine neuen Tests. Der Screen hat keine, und die Repo-Tests decken ausschließlich pure Funktionen
ab (`features/**/*.test.ts` + ein `__tests__/smoke.test.tsx`); hier entsteht keine testbare Logik
außer `parents.length + children.length`.

Verifikation stattdessen: `bun run format:check`, `bun lint`, `bun run typecheck`, `bun test`
und der Web-Smoke-Export (`bunx expo export --platform web`) — die in CLAUDE.md dokumentierten
Skripte.

## Nicht in Scope

- Expo Notifications / Push-Registrierung — eigene Iteration (`docs/TODO.md`).
- Stripe / echtes Plus-Abo — eigene Iteration.
- Account-Detail-Route hinter der Profil-Card (Pattern sieht sie vor, ist aber unwired).
- Datenschutz-, Verknüpfte-Apps-, Hilfe- und Voice-Settings-Ziele.
