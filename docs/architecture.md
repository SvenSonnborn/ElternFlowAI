# Architecture

## High level

Eltern Flow AI is an Expo + React Native app written in TypeScript. The UI is rendered with NativeWind (Tailwind for RN) consuming theme tokens that flip between three palettes. Navigation uses Expo Router with file-based routes — the actual screen implementations live in `app-sections/` and `app/` files are thin re-exports so the URL surface stays small and uniform.

```
┌────────────────────────────────┐
│ Expo Router (app/)             │  thin route files
├────────────────────────────────┤
│ Screens (app-sections/)        │  real screen components
├────────────────────────────────┤
│ Design system (design-system/) │  tokens, themes, primitives
├────────────────────────────────┤
│ Features (features/)           │  business logic + integrations
├────────────────────────────────┤
│ State                          │  Zustand (UI) + TanStack Query (server)
└────────────────────────────────┘
```

## Providers (mounted in `app/_layout.tsx`)

In order, outermost to innermost:

1. `GestureHandlerRootView`
2. `SafeAreaProvider`
3. `QueryClientProvider` (TanStack Query)
4. `ThemeProvider` (reads `themeStore`, exposes tokens + injects CSS vars)
5. `Stack` (Expo Router)

Innerhalb von `ThemedStack` — also zwischen `Stack` und den Providern darüber —
laufen zusätzlich drei Hooks ohne eigenes Provider-Element: `useInitSession()`,
`useFlushPendingDeletes()` und `useFamilyRealtime()`. Der Realtime-Hook steht
dabei bewusst **vor** `<AuthGate>`: Der Gate rendert bei einem Redirect
`<Redirect>` statt seiner Kinder, ein Abo darunter würde bei jedem
Routenwechsel ab- und wieder aufgebaut (ADR-030).

`features/i18n` is initialized as a side effect on module import.

## Theme system

Three themes (`warmLight`, `softDark`, `pastelBlue`) defined in
[design-system/themes.ts](../design-system/themes.ts). The same token names are
used in two places that must stay in sync:

- `themes.ts` — JS object consumed by React code via `useTheme()`
- `tailwind.config.js` — Tailwind colors mapped to CSS variables

`ThemeProvider` writes the active theme's tokens as CSS variables both on the
web `document.documentElement` and on a wrapper `View` via NativeWind's `vars()`
helper so that NativeWind classes like `bg-background` always reflect the
current theme.

## Routing

- `app/_layout.tsx` — root stack + providers
- `app/(tabs)/_layout.tsx` — bottom tab navigator with the 5 fixed tabs and the
  floating Voice FAB overlay
- `app/(tabs)/<name>.tsx` — re-exports the corresponding screen from
  `app-sections/(tabs)/<name>/<Name>Screen.tsx`
- `app/+not-found.tsx` — 404 fallback

## State management

- **Zustand** — local/UI state. Each store sits next to its feature; the theme
  store lives in `design-system/themeStore.ts`.
- **TanStack Query** — server state (Supabase reads, Edamam reads, etc.). Will
  be wired once Supabase is added.

## Kalender

`events.timezone` (IANA-Zone, Default `Europe/Berlin`, seit [ADR-033](./decision-log.md)) legt fest,
in welcher Zone die Wanduhrzeit eines Termins und seiner Wiederholungsregel gilt. Der Datenfluss:

```
events.timezone → rrule.ts (Regel läuft in Wandzeit) → echte Instants → Anzeige in der Zone des Lesers
```

[features/calendar/rrule.ts](../features/calendar/rrule.ts) wertet die Regel vollständig in dieser
Zone aus — `dtstart`, `until` und die Fenstergrenzen laufen als „floating" Zeit (Wandzeit in den
UTC-Feldern eines `Date`) durch `rrule`, das damit DST-frei rechnet, statt über die eigene
`tzid`-Option, die nur bei Prozess-Zeitzone UTC korrekt wäre.
[features/calendar/timezone.ts](../features/calendar/timezone.ts) übernimmt die Umrechnung an den
Rändern (`instantToFloating`/`floatingToInstant`) und liefert `occurrencesBetween`/`allOccurrences`
echte Instants zurück. Die Anzeige formatiert diese Instants mit lokalen `Date`-Gettern und rechnet
sie damit automatisch in die **Zone des Lesers** um, nicht in die des Termins — zwei Geräte in
verschiedenen Zonen zeigen denselben Termin also zu unterschiedlicher Ortszeit, aber zur selben
absoluten Zeit. Seit [ADR-034](./decision-log.md) trägt jede Occurrence deshalb **zwei** Datumsfelder
statt eines: `occurrenceKey` entsteht über `zonedDateKey(instant, row.timezone)` — in der Zone des
**Termins** — und ist der Persistenz-Schlüssel (`event_exceptions.occurrence_date`), der
Konflikt-Versionsvergleich, der Routing-Parameter `occ` und die Eingabe für die Scope-Arithmetik
(`applyEditScope`/`applyDeleteScope`); `occurrenceDate` bleibt das aus demselben Instant in der Zone
des Lesers abgeleitete Anzeigedatum. Ohne Override beziehen sich beide auf denselben Instant und
sind identisch, solange Gerätezone und Terminzone denselben Kalendertag sehen — fällt die
Tagesgrenze dazwischen, trennen sie sich auch ohne Override (ADR-034 Decision 4). Zusätzlich trennt
sie eine per Scope „Nur diesen" auf einen anderen Tag verschobene Occurrence, und dort war die
frühere Vermischung beider Rollen in einem Feld nicht harmlos (falscher Versions-Treffer,
wirkungslose Zweit-Exception, ins Leere laufende Einzel-Löschung). Seit
[ADR-035](./decision-log.md) kommt die Kandidatenmenge einer Serie deshalb aus **zwei** Quellen
statt einer: den Regel-Vorkommen aus `occurrencesBetween` **und** den Regel-Vorkommen jener
`modified`-Exceptions, deren Override-Intervall das Fenster schneidet — dedupliziert auf
`occurrenceKey` und nur, wenn ihr `occurrence_date` überhaupt ein Vorkommen der Regel ist. Ohne die
zweite Quelle war eine per Override auf einen anderen Monat verschobene Occurrence **an beiden
Daten unsichtbar**: am Regel-Datum verwirft sie der Fensterfilter, am neuen entsteht sie nie, weil
`rule.between(...)` nur Regel-Daten kennt. Zurückgegeben wird dabei das Regel-Vorkommen, nicht der
Override-Start — nur so läuft der Kandidat durch dieselbe Auflösung wie jedes andere Vorkommen und
trägt hinterher denselben Schlüssel, dasselbe Versions-Token und dieselbe Exception-Kennzeichnung.
Das gilt nur für Zeilen, die `fetchEventsInRange` ([queries.ts](../features/calendar/queries.ts))
überhaupt lädt — verschiebt ein Override sie über `rrule_until` hinaus oder vor `start_at` zurück,
bleibt sie im Monatsraster weiterhin unsichtbar (siehe [docs/TODO.md](./TODO.md)).
Derselbe ADR nimmt `description` in den Vertrag von `event_exceptions.override` auf, der jetzt als
eigenes Modul in [features/calendar/override.ts](../features/calendar/override.ts) liegt, und lässt
`eventLookupWindow` zusätzlich das Override-Intervall der angeforderten Occurrence abdecken, damit
eine weit verschobene Occurrence über ihren eigenen Link erreichbar bleibt. Neue Termine bekommen
ihre Zone unsichtbar von
[features/calendar/deviceTimeZone.ts](../features/calendar/deviceTimeZone.ts) — ein Zonen-Picker
fehlt (siehe [docs/TODO.md](./TODO.md)).

## Realtime

Änderungen an `events` und `event_exceptions` gehen **nicht** mehr über die
Publikation `supabase_realtime`, sondern über _Broadcast from Database_: Ein
`after`-Trigger ruft `realtime.broadcast_changes()` auf das private Topic
`family:<familyId>`, autorisiert durch eine RLS-Policy auf `realtime.messages`
gegen `current_family_id()`. Weil der Trigger die alte Zeile noch sieht, trägt
auch ein DELETE seine `family_id` und `event_id` — und ein Client hört
ausschließlich die eigene Familie (siehe [decision-log.md](./decision-log.md),
ADR-030, löst ADR-028 teilweise ab).

Client-seitig ist [features/realtime/](../features/realtime/) eine Sync-Schicht
**über** den Features: `subscribe`/`normalize`/`coalesce`/`reconnect` kennen
kein Feature, allein `dispatch.ts` bildet Änderungen auf Query-Keys ab.
`useFamilyRealtime()` läuft **einmal** in `ThemedStack` — nicht in
`useFamilyEvents`, der drei Aufrufer hat —, sammelt eingehende Änderungen 300 ms
und invalidiert dann gebündelt. Nach einem Verbindungsverlust lädt es den
Zustand nach (verpasste Broadcasts kommen nicht nach); hält der Verlust über
zehn Sekunden an, zeigen Kalender und Dashboard `<SyncNotice />`.

## What's not here yet

See [decision-log.md](./decision-log.md) for the full out-of-scope list. The
short version: no recipe-import worker (gustar.io), no Stripe, no real
Voice/LLM, no Expo Notifications, no Edge Functions.

Supabase, the auth flow, onboarding and the settings screen have all landed
since this list was written (ADR-003, ADR-005, ADR-008); Realtime is wired as
far as the section above describes. Was dort noch fehlt, ist die
Conflict-Detection: Zwei gleichzeitige Änderungen an derselben Zeile gewinnt
weiterhin der letzte Schreiber (Issue #52).
