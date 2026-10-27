# Eltern Flow AI — Project Structure

This is the canonical folder layout for the codebase. It is referenced by
`CLAUDE.md`. New screens, components, features, or types **must** go in the
folder named here — see `CLAUDE.md` for the "do not silently diverge" rule.

```
app/                     Expo Router routes — THIN re-export files; `_layout.tsx` holds navigator + providers, `+not-found.tsx` is its own screen
├─ _layout.tsx           Root stack + i18n-Init (Import) + providers (QueryClient · ThemeProvider · SafeArea · GestureHandler · ToastProvider) + <ConflictDialogHost /> + <ScopeSheetHost /> + useFlushPendingDeletes() + useFamilyRealtime()
├─ (auth)/               Stack-_layout.tsx + login · register · check-email · reset-password · new-password
├─ (onboarding)/         Stack-_layout.tsx + [step].tsx → OnboardingStepScreen
├─ (tabs)/_layout.tsx    Bottom tab navigator (5 tabs) + Voice FAB overlay
├─ (tabs)/index.tsx      → Dashboard
├─ (tabs)/kalender.tsx
├─ (tabs)/essen.tsx
├─ (tabs)/aufgaben.tsx
├─ (tabs)/familie.tsx
├─ event/new.tsx          → EventCreateScreen
├─ event/[id].tsx         → EventDetailScreen
├─ event/edit/[id].tsx    → EventEditScreen
├─ task/new.tsx           → TaskCreateScreen
├─ task/edit/[id].tsx     → TaskEditScreen
├─ child/new.tsx · child/[id].tsx → ChildProfileScreen
├─ parent/[id].tsx        → ParentProfileScreen
├─ recipe/[id].tsx        → RecipeScreen
├─ settings.tsx           → SettingsScreen
├─ debug/realtime.tsx     → RealtimeDebugScreen (nur `__DEV__` verlinkt)
├─ meal/pick.tsx          → MealPickScreen (Rezept für einen festen Tag/Slot wählen)
├─ meal/schedule.tsx      → MealScheduleScreen (Tag/Slot für ein festes Rezept wählen)
└─ +not-found.tsx        NotFoundScreen, eigene Komponente statt Re-Export

app-sections/            Real screen implementations
├─ (tabs)/<name>/<Name>Screen.tsx
├─ auth/                 Login · Registrieren · Passwort zurücksetzen · E-Mail bestätigen (ADR-005)
├─ child-profile/        ChildProfileScreen
├─ debug/                Dev-Werkzeuge (Realtime-Debug) — Einstieg nur unter `__DEV__`
├─ event/                Termin anlegen/ansehen/bearbeiten · Scope-Auswahl (`pickScope` →
│                        ActionSheetIOS auf iOS, sonst scopeSheetStore · ScopeSheet · ScopeSheetHost, ADR-039)
├─ meal/                 Essen einplanen: Auswahl · Tag/Slot-Wahl · der gemeinsame Einplan-Ablauf
│                        (`runPlanning` · `useMealPlanning` — Allergie-Hinweis, Ersetzen-Dialog, ADR-043)
├─ onboarding/           5-Schritt-Onboarding: Familie · Partner einladen · erstes Kind (ADR-005)
├─ modals/
├─ parent-profile/       ParentProfileScreen
├─ recipe/               RecipeScreen
├─ settings/             SettingsScreen
├─ task/                 Anlegen/Bearbeiten von Aufgaben (Create · Edit · TaskForm)
└─ shared/               Geteilte Bausteine inkl. Formular-Primitives
   (DateTimePickerSheet · TypePicker · MemberPicker · Field · confirmDialog
   · Toast · useUndoableDelete · AllergenBadge · recipeA11y · mealPlaceholder · SyncNotice
   · conflictStore · ConflictDialog · ConflictDialogHost · newRequestId (Kennung pro Absicht, ADR-044)
   — von mehr als einem Tab benutzt)

design-system/           Handoff bundle + theming runtime
├─ colors.ts             Palette + brand aliases (HANDOFF — do not edit)
├─ typography.ts         Inter scale + named textStyles (HANDOFF)
├─ spacing.ts            space · radius · shadow · zIndex · motion (HANDOFF)
├─ themes.ts             lightTheme · darkTheme · themes (HANDOFF)
├─ components.ts         Variant SPECS for Button/Card/Pill/Field/FAB/… (HANDOFF — NOT React components)
├─ index.ts              DS barrel (HANDOFF)
├─ themeStore.ts         Zustand store for active theme
├─ ThemeProvider.tsx     Injects CSS vars + NativeWind vars from active theme
└─ ui/                   ← React component implementations (Claude-owned)
   ├─ Button.tsx · Card.tsx · Screen.tsx · Text.tsx · index.ts

features/                Cross-cutting feature logic
├─ i18n/                 react-i18next init + de.json + en.json
├─ auth/                 Session-Store · AuthGate · DeepLinkHandler · Onboarding-Mutations
├─ calendar/             Queries · Mutations · RRULE-Expansion · Reminder · Pending-Deletes · Optimistic-Overlay
│                        · rrule.ts (Vertrag: `occurrencesBetween`/`allOccurrences`, wertet in Wandzeit aus, ADR-033)
│                        · timezone.ts (Instant↔Wandzeit-Umrechnung, `zonedDayBounds`) · deviceTimeZone.ts (Geräte-Zone für neue Termine)
│                        · override.ts (Vertrag von `event_exceptions.override`, ADR-035)
│                        · expand.ts (Occurrences aus zwei Kandidatenquellen: Regel + verschobene Exceptions, ADR-035)
│                        · realtimeKeys.ts (Änderung → Query-Keys, ADR-030)
│                        · version.ts (Versions-Token, schlüsselt auf `occurrenceKey`, ADR-034) · conflict.ts (Feldvergleich, ADR-031, samt Regel seit ADR-038)
│                        · rule.ts (der eine Regel-Vergleich — Exceptions löschen und Konflikt melden, ADR-038)
│                        · eventChange.ts (Schritte aufzeichnen, `apply_event_change` aufrufen, Fehler abbilden, ADR-044)
├─ realtime/             Sync-Schicht über den Features (ADR-030): Topic · Payload-Normalisierung
│                        · Kanal (privat, ein Topic pro Familie) · Sammelfenster · Reconnect-Regeln
│                        · Status-Store · dispatch (kennt die Feature-Mapper) · useFamilyRealtime
├─ tasks/                Queries · Mutations · Filter · Stats · Pending-Deletes
│                        · mutations.ts (TaskOps-Schnitt, reine updateTask/deleteTask: CAS beim Speichern, ADR-036; `delete_task` beim Löschen, ADR-044)
│                        · conflict.ts (Feldvergleich, ADR-031)
├─ children/             Kinderprofile
├─ meals/                Meal-Planner-Daten-Layer (Queries · JSONB-Normalisierung · Wochenlogik
│                        · Ausweichgericht-Auswahl)
│                        · mutations.ts (MealOps-Schnitt, Schutz über die gesehene `recipe_id`, ADR-043)
│                        · useMealMutations.ts (Hooks mit Wochen-Patch) · planningSteps.ts (Dialog-Abfolge)
│  └─ allergens/         EU-14-Vokabular · DE/EN-Begriffslisten · Zutaten-Klassifizierer · Urteil (ADR-014)
├─ shared/               Feature-übergreifende Hooks + Typen (useToday · Translate
│                        · pendingDeletes — verzögerte Löschungen mit Undo-Fenster)
├─ sample-data/          Mock-Daten für noch nicht verdrahtete Screens (Copy aus `sample.*`)
├─ voice-assistant/      (placeholder)
├─ supabase/             client.ts (createClient + AsyncStorage session) + barrel
└─ notifications/        (placeholder)

testing/                 Jest-Setup + renderScreen für Komponenten-Tests (*.jest.tsx, ADR-042)

supabase/                Schema + lokale Supabase (ADR-044; Ablauf in SETUP.md)
├─ migrations/           Schema mit RLS — Dateinamen tragen die Versionen von live
├─ config.toml           lokaler Stack, spiegelt die Live-Konfiguration (Abweichungen kommentiert)
├─ seed.sql              drei Testkonten in zwei Familien, feste UUIDs
├─ parity.sql            Abgleich Schema + Konfiguration lokal ↔ live
└─ tests/                database/ (pgTAP) · integration/*.db.ts (zwei Clients) — `bun run test:db`

patterns/                Per-screen design docs (HANDOFF — required reading per screen)
├─ dashboard.md · dashboard-empty.md · login.md · onboarding.md
├─ meals.md · calendar.md · homework.md · child-profile.md · settings-voice.md

docs/
├─ HANDOFF.md            Developer handoff overview (read first when onboarding)
├─ COPY.md               DE/EN copy decks per screen (i18n source of truth)
├─ ICONS.md              Icon list + stroke conventions
├─ README.md             Design-System-Überblick (Handoff-Bundle)
├─ architecture.md
├─ decision-log.md       ADRs (append new entries, don't rewrite history)
├─ roadmap.md            Abarbeitungsreihenfolge für docs/TODO.md (Blöcke + Blocker)
├─ TODO.md               Backlog: Lücken und vertagte Arbeit außerhalb des Scopes
├─ eltern-flow-ai-project-structure.md   dieser Baum
└─ development.md        Toolchain · Tests · CI · Renovate · MCP · CodeRabbit
```

## Path alias

Always import via `@/...` (mapped to the repo root in `tsconfig.json`).

```ts
import { Card } from "@/design-system/ui";
import { DashboardScreen } from "@/app-sections/(tabs)/dashboard/DashboardScreen";
import "@/features/i18n";
```

## Adding a new screen

1. Create the real screen in `app-sections/<area>/<name>/<Name>Screen.tsx`
2. Add a thin route file in `app/...` that re-exports it as `default`
3. If it needs strings, add them to BOTH `de.json` and `en.json`
4. Reach for `design-system/ui` and `app-sections/shared` first; only drop to raw RN when needed

## Adding a feature

1. Create `features/<feature-name>/`
2. Co-locate Zustand stores, hooks, helpers, and API clients
3. Export the public surface from an `index.ts`
4. Screens import from `@/features/<feature-name>`, never reach into internals
