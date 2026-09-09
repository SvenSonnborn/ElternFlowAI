# Roadmap — Abarbeitungsreihenfolge für `docs/TODO.md`

Stand: **2026-09-08**, Basis `main` @ `2de7c76` (sauber).

Diese Datei ordnet die **158 Einträge** aus [docs/TODO.md](./TODO.md) in eine Reihenfolge. Sie
ersetzt `TODO.md` nicht — dort steht **was** offen ist und **warum** es vertagt wurde, hier steht
**wann** es drankommt und **woran es hängt**. `TODO.md` bleibt der aktive Backlog: erledigte
Einträge werden dort gelöscht (CLAUDE.md → „Out-of-scope TODOs"), hier wird der Block abgehakt.

Ordnungsprinzip laut Entscheidung: **Korrektheit zuerst.** Erst hört stiller Datenverlust auf,
dann kommen Feature-Unlocks. Designer-abhängige Punkte stehen bei ihrem Feature, nicht in einem
eigenen Kapitel.

## Legende

| Marker        | Bedeutung                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🎨            | Braucht eine Designer-Entscheidung oder einen Copy-Key. Handoff-Bundle ist off-limits (CLAUDE.md Non-negotiable 1) — der Code-Teil kann trotzdem vorbereitet werden. |
| 🔒            | Extern blockiert (Anbieter, Domain, Konto). Nicht umsetzbar, egal wie viel Zeit da ist.                                                                              |
| ⚙️            | Manuell außerhalb des Repos (GitHub-Settings). Nicht als Datei versionierbar.                                                                                        |
| ✅            | Heute verifiziert — Beleg steht unter [Ist-Stand](#ist-stand-verifiziert-am-2026-09-08).                                                                             |
| **S / M / L** | Aufwand: S = ein Commit, M = eine Iteration mit Testlauf, L = eigene Iteration mit Spec, Migration oder Zwei-Client-Durchgang.                                       |

---

## Ist-Stand, verifiziert am 2026-09-08

Vier Annahmen aus `TODO.md` habe ich vor dem Ordnen nachgemessen, weil sie die Reihenfolge tragen.
Zwei davon sind schlimmer als dort notiert.

> **Dies ist die Messung _vor_ Block 0.** Befund 1 (SDK-Drift) ist mit 0.2 behoben —
> `expo install --check` meldet seither „Dependencies are up to date". Befund 5 (Test-Deps) ist
> mit 0.3 behoben. Die Zahlen bleiben hier als Beleg stehen, warum die Blöcke so sortiert sind;
> den aktuellen Stand führt jeweils der Block selbst.

**1. Der SDK-Drift ist gewachsen — 13 Pakete statt der zwei notierten.** ✅

```text
$ bunx expo install --check
  @expo/metro-runtime@57.0.9   → ~57.0.15      expo-router@57.0.12        → ~57.0.19
  expo@57.0.12                 → ~57.0.20      expo-splash-screen@57.0.6  → ~57.0.8
  expo-constants@57.0.10       → ~57.0.17      react-native@0.86.0        → 0.86.3
  expo-font@57.0.1             → ~57.0.3       react-native-reanimated@4.5.0 → 4.5.1
  expo-linking@57.0.5          → ~57.0.9       react-native-screens@4.25.2   → ~4.26.0
  react-native-worklets@0.10.0 → 0.10.1        eslint-config-expo@57.0.1  → ~57.0.2
  jest-expo@57.0.4             → ~57.0.5
```

`TODO.md` → [Renovate / Dependencies](./TODO.md#renovate--dependencies-siehe-adr-013) → **„Das Repo
driftet bereits von SDK 57"** notierte `expo ~57.0.7 → ~57.0.12` und `react-native 0.86.0 → 0.86.2`.
Beides ist inzwischen weitergelaufen. `react-native` ist **exakt gepinnt** (`0.86.0`), fällt also
genau in die Lücke, die ADR-013 Decision 2 beschreibt: Renovates bun-Manager liest keine
`lockedVersion` aus `bun.lock`, und `lockFileMaintenance` fasst exakte Pins nicht an. Der Drift
korrigiert sich **nicht** von selbst — er wächst weiter, bis jemand `expo install --fix` committet.

Nebenbefund: `package.json` deklariert `expo: ~57.0.7`, installiert ist `57.0.12`. Manifest und
Lockfile sind bereits auseinander.

**2. Die Branch-Protection hat keine Required Checks.** ✅

```text
$ gh api repos/SvenSonnborn/ElternFlowAI/rulesets/17263678
enforcement: active
RULE: deletion
RULE: pull_request
RULE: required_linear_history
```

Ein Ruleset „main protection" existiert und ist aktiv — aber **ohne** `required_status_checks`-Regel.
Damit ist der in [ADR-016](./decision-log.md) als _blockierend_ beschlossene Native-Build-Gate
faktisch ein Vorschlag: die sechs Workflows laufen, hindern aber niemanden am Mergen. Das bestätigt
`TODO.md` → [Weitere Out-of-Scope-Items](./TODO.md#weitere-out-of-scope-items) → **„Branch-Protection-Rule
‚Status-Checks required'"** und macht ihn zum ersten Handgriff überhaupt: jeder Block ab hier
profitiert davon, dass sein PR wirklich gegated ist.

**3. `insertSplitEvent` setzt tatsächlich kein `parent_id`.** ✅

[features/calendar/recurrence.ts:316](../features/calendar/recurrence.ts) — der Insert führt
`family_id`, `type_id`, `child_id`, `title`, `description`, `location`, `start_at`, `end_at`,
`all_day`, die fünf `rrule_*`-Spalten und `created_by`. `parent_id` fehlt. Der Eintrag in
`TODO.md` stimmt Wort für Wort; der Fix ist eine Zeile.

**4. Der Meals-Layer ist unverändert lesend, die Policies liegen bereit.** ✅

`features/meals/` enthält kein `mutations.ts` — exportiert werden nur `useMealPlans`,
`useTodaysMeal`, `useRecipeById`, `useRecipes`, `useFamilyAllergies`, `useMealAlternative`,
`useRecipeJudge`. INSERT/UPDATE/DELETE-Policies auf `meal_plan_entries` existieren seit
[20260529093329_recipes_and_meal_plan.sql](../supabase/migrations/20260529093329_recipes_and_meal_plan.sql)
und wurden in `20260529100841_pr3_review_fixes.sql` nachgeschärft. Der Feature-Unlock in Block 6 ist
technisch unblockiert.

**5. Die Test-Infrastruktur ist wie beschrieben ungenutzt.** ✅

63 Testdateien, davon genau eine `.tsx` ([`__tests__/smoke.test.tsx`](../__tests__/smoke.test.tsx)),
die Design-Tokens prüft statt zu rendern. `react-test-renderer@19.2.3` steht in
[package.json:84](../package.json); `test-renderer` steht **nur** in `bun.lock`. Beide Einträge aus
der Renovate-Sektion sind aktuell.

---

## Die Reihenfolge auf einen Blick

| #   | Block                                                                                   | Aufwand | Löst … Einträge | Warum an dieser Stelle                                                                        |
| --- | --------------------------------------------------------------------------------------- | ------- | --------------- | --------------------------------------------------------------------------------------------- |
| 0   | [Hygiene & Gates scharfstellen](#block-0--hygiene--gates-scharfstellen)                 | S       | 6               | Der Drift wächst täglich; ohne Required Checks ist jeder folgende PR ungegated.               |
| 1   | [Stiller Datenverlust im Kalender](#block-1--stiller-datenverlust-im-kalender)          | M–L     | 5               | Fünf Wege, auf denen Termine ohne Fehlermeldung verschwinden. Höchster Nutzerschaden.         |
| 2   | [Aufgaben-Löschpfad & Konfliktlücken](#block-2--aufgaben-löschpfad--konfliktlücken)     | M       | 5               | Dieselbe Schadensklasse bei Tasks + die von ADR-031 offen gelassenen Löcher.                  |
| 3   | [Web-Parität](#block-3--web-parität)                                                    | M       | 6               | Web ist der schnellste Smoke-Test-Loop — heute überspringt er stumm halbe Features.           |
| 4   | [Touch-Targets & a11y](#block-4--touch-targets--a11y)                                   | S       | 4               | CLAUDE.md Non-negotiable 4 wird in ausgeliefertem Code verletzt. Eine Sichtprüfung für alles. |
| 5   | [RN-Component-Test-Pfad](#block-5--der-rn-component-test-pfad-schlussstein)             | L       | 4               | Schlussstein: entsperrt drei geparkte Einträge und sichert alles danach ab.                   |
| 6   | [Meal-Plan-Mutationen](#block-6--meal-plan-mutationen-der-größte-feature-unlock)        | L       | 6               | Größter Einzel-Unlock — eine Mutation löst sechs Einträge über drei Screens.                  |
| 7   | [Transaktions-RPC für den Kalender](#block-7--transaktions-rpc-für-den-kalender)        | L       | 3               | Teuerste Korrektheitsbaustelle; Pre-Flight + CAS decken den Normalfall bereits ab.            |
| 8   | [Docs-Resync & Refactors](#block-8--docs-resync--refactors)                             | S–M     | 8               | Blockiert nichts. Aufräumen, wenn die Substanz steht.                                         |
| 9   | [CI- & Toolchain-Härtung](#block-9--ci-und-toolchain-härten)                            | S–M     | 6               | Verbessert die Gates, die Block 0 überhaupt erst scharf gemacht hat.                          |
| 10  | [Große Migrationen](#block-10--große-migrationen)                                       | L       | 4               | Kein Zeitdruck, je eine eigene Iteration.                                                     |
| —   | [Geparkt: extern blockiert](#geparkt--extern-blockiert)                                 | —       | ~28             | Anbieter, Domain oder Konto fehlen.                                                           |
| —   | [Geparkt: wartet auf ein drittes Vorkommen](#geparkt--wartet-auf-ein-drittes-vorkommen) | —       | ~10             | Bewusst vertagt, bis der zweite Aufrufer die richtige Form zeigt.                             |

**Damit sind rund 57 der 158 Einträge in den Blöcken 0–10 tatsächlich jetzt umsetzbar** — deine
Einschätzung („ein Großteil davon können wir jetzt schon umsetzen") trifft für die Sachsubstanz zu.
Der große Rest teilt sich in Anbieter-Blockaden (Sprachassistent, gustar.io, Notifications, Stripe)
und Designer-Punkte, die zwar nicht _von uns_ erledigt werden, aber in den Blöcken mitlaufen.

### Schlusssteine — was am meisten entsperrt

Drei Einzelposten tragen überproportional:

1. **Meal-Plan-Mutation** (Block 6) → löst 6 Einträge über `EssenScreen`, `WeekPlanGrid`,
   `RecipeScreen`, `MealHeroCard` und `MealHeroEmptyCard` auf. Kein anderer Einzelposten kommt in
   die Nähe.
2. **RN-Render-Pfad im Test** (Block 5) → entsperrt 3 explizit darauf wartende Einträge
   (`useFamilyRealtime`, Hydrations-Invariante, `hooks.ts`-Ladeproblem) und ist Voraussetzung für
   jeden künftigen Screen-Test.
3. **Transaktions-RPC** (Block 7) → schließt 2 Einträge auf einmal (fünf ungeprüfte Schreib-Ops
   **und** das `deleteAllExceptions`-Verlustfenster), plus die Serverhälfte von Issue
   [#111](https://github.com/SvenSonnborn/ElternFlowAI/issues/111).

---

## Block 0 — Hygiene & Gates scharfstellen

**Aufwand S · ein Nachmittag · macht alles Folgende sicherer**

Zuerst, weil Punkt 1 die Voraussetzung dafür ist, dass jeder PR ab Block 1 überhaupt geprüft wird,
und Punkt 2 ein Problem ist, das mit jedem Tag teurer wird.

> **Stand 2026-09-08:** 0.2 · 0.3 · 0.4 sind umgesetzt (Branch `chore/block-0-hygiene`), 0.5 ist
> erledigt. **0.1 ist offen und liegt bei dir** — der Token darf keine Rulesets schreiben, Klickweg
> siehe unten.

### 0.1 ⚙️ Required Status Checks eintragen — **offen, Handgriff bei dir**

`TODO.md` → [Weitere Out-of-Scope-Items](./TODO.md#weitere-out-of-scope-items) → **„Branch-Protection-Rule
‚Status-Checks required' auf `main`"**

Ruleset `17263678` („main protection") um eine `required_status_checks`-Regel ergänzen. GitHub listet
die **`name:`-Anzeigenamen**, nicht die Job-IDs — nach diesen sechs Strings suchen:

- „Build & Quality (format · lint · typecheck · test · web build)" — [ci.yml](../.github/workflows/ci.yml)
- „CVE check for new dependencies" — [dependency-review.yml](../.github/workflows/dependency-review.yml)
- „Apply labels from branch name" — [pr-labeler.yml](../.github/workflows/pr-labeler.yml)
- „Metro bundle (ios · android)" · „Android (prebuild · assembleDebug)" · „iOS (prebuild · pod install · xcodebuild)" — [native-build.yml](../.github/workflows/native-build.yml)

Beim Umsetzen in [ADR-013](./decision-log.md) (Renovate-Bypass-Actor) und [ADR-016](./decision-log.md)
(Decision zum blockierenden Gate) dorthin verlinken, statt die Begründung zu duplizieren — so steht
es im TODO-Eintrag.

> ⚠️ Reihenfolge-Fußangel: Der iOS-Job läuft ~30 min. Sobald er Pflicht ist, kostet **jeder** PR
> mindestens so lange. Das ist der beschlossene Preis (ADR-016), aber es ändert den Arbeitsrhythmus
> ab dem Moment, in dem der Haken gesetzt ist — deshalb bewusst als eigener, benannter Schritt.

**Warum das nicht automatisch ging:** Der Fine-grained-PAT darf Rulesets **lesen**, nicht schreiben
(`PUT /repos/.../rulesets/17263678` → `403 Resource not accessible by personal access token`; die
ältere Branch-Protection-API antwortet ebenso). Es braucht `Administration: Read and write` auf dem
Token — oder den Klickweg. Das Ruleset ist unverändert, `updated_at` steht weiter auf
`2026-06-04T14:07:28`.

**Klickweg:** Repo → Settings → Rules → Rulesets → „main protection" → **Require status checks to
pass** aktivieren → die sechs Namen oben hinzufügen. Zwei Fallen dabei:

- **Nicht** den siebten Check „expo install --fix nach SDK-Bump" auswählen. Der Job läuft nur auf
  Renovates Expo-SDK-PR; als Required Check bliebe jeder andere PR dauerhaft auf „pending" stehen.
- **„Require branches to be up to date before merging" ausgelassen lassen.** Bei einem
  ~30-min-iOS-Job erzwingt die Option nach jedem fremden Merge eine Rebase samt vollem Neulauf. Die
  lineare Historie sichert bereits `required_linear_history` zusammen mit Rebase-only-Merges.

**Zwei Befunde aus dem Ruleset, die den Nutzen von 0.1 einordnen** — beide als eigene Einträge in
[docs/TODO.md](./TODO.md) → Renovate / Dependencies aufgenommen:

1. **Der Haken bindet dich selbst nicht.** Einziger Bypass-Actor ist `RepositoryRole 5` (Repo-Admin)
   mit `bypass_mode: always`; die API meldet für dich `current_user_can_bypass: "always"`. Die sechs
   Checks machen einen roten Merge für andere Actors unmöglich und zeigen den Zustand deutlich an —
   dich hindern sie nicht. Das in ADR-016 als _blockierend_ beschlossene Gate ist für dich eine
   Anzeige, keine Schranke.
2. **Renovate ist gar kein Bypass-Actor — sein Automerge hat nie funktioniert.** ADR-013 Decision 4
   sagt, die App müsse als Bypass-Actor eingetragen werden; im Ruleset steht kein
   `Integration`-Eintrag. Nachgeprüft: alle zehn zuletzt gemergten Renovate-PRs wurden von dir von
   Hand gemergt, darunter #86 (`lock file maintenance`) und #75–#79 (Actions) — genau die
   Automerge-Kategorien. Das macht den späteren Block-9-Punkt „`platformAutomerge: true` testen"
   bis auf Weiteres gegenstandslos.

### 0.2 SDK-Drift einfangen — **erledigt**

`TODO.md` → [Renovate / Dependencies](./TODO.md#renovate--dependencies-siehe-adr-013) → **„Das Repo
driftet bereits von SDK 57"**

`bunx expo install --fix` als **eigener Commit**, nichts anderes im Diff. 13 Pakete (siehe
[Ist-Stand](#ist-stand-verifiziert-am-2026-09-08)). Danach `bunx expo install --check` als Gegenprobe
und der volle Native-Build — das ist genau der Fall, den `ci.yml` allein **nicht** sieht, weil es
beim Web-Export endet.

Je später das passiert, desto mehr trägt der erste echte SDK-Sprung zusätzlich zum SDK-Delta noch
dieses Alt-Delta mit.

### 0.3 Test-Dependencies bereinigen — **erledigt**

Zwei Einträge, eine `package.json`-Änderung, gehören in **einen** Commit:

- **„`react-test-renderer` ist seit dem v14-Bump vollständig tot"** — entfernen (steht in
  [package.json:84](../package.json)) und **im selben Commit** den Eintrag aus Renovate-Regel 3 in
  [.github/renovate.json5](../.github/renovate.json5) streichen. [ADR-015](./decision-log.md)
  Decision 5 hat ihn ausdrücklich nur bis zu dieser Entscheidung stehen lassen.
- **„`test-renderer` steht nur in der Lockfile"** — `"test-renderer": "^1"` als devDependency
  nachtragen. Heute trägt allein, dass Bun den Peer selbsttätig in `bun.lock` aufgenommen hat.

### 0.4 `persist-credentials: false` in `ci.yml` — **erledigt**

`TODO.md` → [Weitere Out-of-Scope-Items](./TODO.md#weitere-out-of-scope-items).
[native-build.yml](../.github/workflows/native-build.yml) hat es bereits;`ci.yml` macht nach dem
Checkout ebenfalls keine Git-Operation mehr. **Nicht** für `expo-sdk-sync.yml` — der pusht in den
PR-Branch und braucht die persistierten Credentials.

### 0.5 GitHub-Issues aufräumen — **erledigt**

Nicht in `TODO.md`, aber es verzerrt jede Backlog-Sicht: Laut `CLAUDE.md` sind **#51** (Live-Sync,
ADR-030) und **#52** (Conflict-Detection, ADR-031) erledigt, ebenso die Phase-1-Issues **#14–#17**
und die Phase-2-Issues **#19**, **#21**, **#22**, **#48**. Alle stehen noch offen. Vor dem Schließen
je einmal gegen den ADR gegenlesen und mit dem Merge-Commit verlinken.

**Ergebnis:** Acht geschlossen — #15, #16, #17, #19, #21, #48, #51, #52 —, jeweils mit einem
Kommentar, der die Checkliste gegen den ADR abgleicht und Abweichungen benennt (etwa #48, dessen
„Liste mit E-Mail" durch ADR-021 abgelöst ist, oder #51, dessen Subscription anders sitzt als dort
skizziert).

**Zwei bewusst offen gelassen**, weil sie es nicht sind:

- **#14** (Dashboard live) — alle fünf Checkboxen erfüllt, aber der im Ziel genannte
  **Familienname** liest weiter `getSampleFamilyName(t)`. Braucht einen Ladezustand für die TopBar
  oder eine Copy-Variante ohne Namen, also 🎨.
- **#22** (Optimistic UI/Toast/Undo) — vier von fünf Punkten stehen; `useCreateTask` ist weiterhin
  nicht optimistisch, dazu fehlen die Toast-Variante `solid` und das Höhen-Kollabieren.

Beide tragen jetzt einen Kommentar mit genau dieser Restliste, damit sie nicht als „irgendwie noch
offen" herumliegen.

Offen bleiben danach: [#111](https://github.com/SvenSonnborn/ElternFlowAI/issues/111) (→ Block 7),
[#88](https://github.com/SvenSonnborn/ElternFlowAI/issues/88) und
[#29](https://github.com/SvenSonnborn/ElternFlowAI/issues/29) (→ geparkt), **#23–#27** (Phase 3,
🔒 anbieterblockiert), **#70** (Renovate-Dashboard, dauerhaft).

**Definition of done Block 0:** `expo install --check` meldet nichts · sechs Checks stehen als
Required im Ruleset · `package.json` trägt `test-renderer`, nicht mehr `react-test-renderer` ·
die Issue-Liste zeigt nur noch echte Offene.

---

## Block 1 — Stiller Datenverlust im Kalender

**Aufwand M–L · 4 PRs · die Einträge, bei denen Daten ohne jede Meldung verschwinden**

Alle fünf liegen in `features/calendar/`, alle sind unblockiert, alle haben eine bestehende
Testsuite ([recurrence.test.ts](../features/calendar/recurrence.test.ts),
[expand.test.ts](../features/calendar/expand.test.ts)), an die sich der Regressionstest hängt.
Alle stehen in `TODO.md` → [Calendar](./TODO.md#calendar-v1--siehe-adr-008) bzw.
[Conflict-Detection](./TODO.md#conflict-detection-siehe-adr-031).

Reihenfolge innerhalb des Blocks ist nach _Verhältnis Schaden zu Aufwand_ sortiert, nicht nach Datei.

### 1.1 `insertSplitEvent` verliert `parent_id` — **erledigt**

**„`insertSplitEvent` verliert `parent_id` — stiller Datenverlust"**
· [features/calendar/recurrence.ts:316](../features/calendar/recurrence.ts) ✅ verifiziert

Eine Zeile. Szenario: „Papas Sportkurs, wöchentlich" mit gesetztem `parent_id`, bearbeitet mit Scope
„Ab diesem Termin" — die abgespaltene Hälfte wird stillschweigend familienweit. Der
Regressionstest ist die eigentliche Arbeit: er muss die **Feldliste des Splits gegen die der
Master-Zeile halten**, sonst wiederholt sich dieselbe Auslassung bei der nächsten neuen Spalte.

Das ist der billigste echte Datenverlust-Fix im ganzen Backlog — deshalb zuerst und allein.

### 1.2 „Alle Termine"-Scope verschiebt den Serienstart — **M**

**„‚Alle Termine'-Scope verschiebt den Serienstart"**
· [features/calendar/recurrence.ts](../features/calendar/recurrence.ts) — `applyEditScope`, Zweig `scope === "all"`

`start_at` ist zugleich Termin-Startzeit **und** Serienanker (`dtstart` via
[rrule.ts](../features/calendar/rrule.ts) → `buildRule`). Ändert jemand bei einer laufenden Serie
nur die Uhrzeit einer späteren Occurrence und wählt „Alle Termine", wandert `dtstart` auf das Datum
_dieser_ Occurrence — alle Vorkommen davor fallen serverseitig aus `rule.all()`/`between()` heraus.
Trägt die Serie ein `rrule_count`, verschiebt sich zusätzlich das Zähl-Fenster.

Fix: bei Scope „alle" das ursprüngliche `start_at`-**Datum** behalten und nur die **Uhrzeit**
übernehmen — oder `dtstart` ganz vom editierten `start_at` entkoppeln. Zweite Variante ist
sauberer, aber ein Schema-Gedanke; erst in der Iteration entscheiden.

### 1.3 Das Override-Modell: verschwundene Exceptions + Versions-Schlüssel — **L, ein PR**

Zwei Einträge, **eine** Ursache — beide schlüsseln auf ein Datum, das der jeweils andere Pfad anders
auflöst. Getrennt zu fixen hieße, dieselbe Stelle zweimal anzufassen:

- **„Aus dem Fenster verschobene `modified`-Exceptions verschwinden"**
  · [expand.ts](../features/calendar/expand.ts) — `expandRecurrence`
  Kandidaten kommen ausschließlich aus `rule.between(...)`. Verschiebt ein Override eine Occurrence
  in einen Monat, in dem ihr _ursprüngliches_ `occurrence_date` nicht liegt, entsteht der Kandidat
  nie — der Termin ist **an beiden Daten unsichtbar**. Über `EventEditScreen` mit Scope „Nur diesen"
  erreichbar.
- **„Eine auf einen anderen Tag verschobene Occurrence fällt aus dem Versions-Schlüssel"**
  · [version.ts](../features/calendar/version.ts) — `occurrenceVersion`
  Das Token schlüsselt auf das _aufgelöste_ `occurrenceDate`, `expandEvents` löst den Inhalt über
  das regelerzeugte `lookupDate` auf. Fallen beide auseinander, wird eine fremde Änderung an der
  inhaltsgebenden Exception beim Konfliktvergleich **übersehen**.

Fix: die Kandidatenmenge muss `event_exceptions` einbeziehen und gegen die regulär expandierten
Vorkommen dedupliziert werden. Danach ist zu entscheiden, ob der Versions-Schlüssel dem aufgelösten
oder dem Regel-Datum folgt — `modifyOccurrence` schreibt heute in diesem Fall eine **zweite**
Exception-Zeile am neuen Datum, der Schlüssel folgt also dem, was der Schreibvorgang tut. Das ist
konsistent, aber nur, solange man es weiß.

> Berührt außerdem **„`applyOverride` kennt `description` nicht"** und **„Ganztägig ist im Edit-Form
> nicht umschaltbar"** (beide Calendar-Sektion) — beide erweitern denselben Override-Vertrag. Wenn
> der ohnehin aufgemacht wird, gehören sie hier mit hinein statt in zwei spätere Einzeliterationen.

### 1.4 Zeitumstellung: Serien laufen eine Stunde falsch — **M–L**

**„Serientermine zeigen nach der Zeitumstellung eine Stunde falsch"**
· [expand.ts](../features/calendar/expand.ts) + [rrule.ts](../features/calendar/rrule.ts)

Nachgemessen im TODO unter `TZ=Europe/Berlin`: wöchentliche Serie ab `2026-10-06 18:00` (CEST) steht
ab dem 27.10. auf **17:00**. `buildRule` übergibt ein nacktes `Date` an `rrule`, das absolut rechnet;
gelesen wird mit lokalen Gettern. **Betrifft jede Serie, die über eine Zeitumstellung läuft** — also
in der Praxis fast jede wiederkehrende Familienverabredung, zweimal im Jahr.

> ⚠️ **Korrektur (2026-09-09):** Dieser Abschnitt empfahl ursprünglich, `rrule` die Option `tzid`
> mitzugeben. **Das funktioniert in dieser App nicht.** `rrule@2.8.1` rechnet in `dateInTimeZone`
> ([dateutil.js, an die Version gepinnt](https://unpkg.com/rrule@2.8.1/dist/esm/dateutil.js))
> `targetOffset − localOffset`
> und ist damit nur korrekt, wenn die **Prozess-Zeitzone UTC** ist — gemessen mit einer Serie ab
> `2026-10-06 18:00` und `tzid: "Europe/Berlin"`: unter `TZ=UTC` richtig, unter `TZ=Europe/Berlin`
> ein reiner No-op, unter `TZ=America/New_York` falsch. Eine React-Native-App läuft in der
> Gerätezone, der No-op-Zweig ist also der Produktionsfall. Der Absatz unten ist entsprechend
> ersetzt; die Begründung steht ausführlich in
> [der Spec](./superpowers/specs/2026-09-09-calendar-silent-data-loss-design.md) §1.1.

Fix: die Regel in **reiner Wandzeit** auswerten und die Zone selbst auflösen. `events` bekommt dazu
eine Spalte `timezone` — die Zone, in der die Wanduhrzeit dieses Termins gilt; die Gerätezone wäre
der falsche Ort, weil sie beschreibt, wo der _Leser_ gerade ist, nicht wo die Serie verankert wurde
(zwei Geräte zeigten sonst verschiedene Termine, und ein serverseitiger Reminder-Worker hätte gar
keine). `rrule.ts` kapselt die Umrechnung vollständig: `dtstart`, `until` und die `between`-Grenzen
gehen als „floating" hinein (Wandzeit in den UTC-Komponenten), `rrule` rechnet damit DST-frei, und
die Ergebnisse kommen zonenbewusst als echte Instants zurück — `tzid` wird **nicht** gesetzt. Nach
außen gehen `occurrencesBetween` und `allOccurrences`; `buildRule` wird modulintern — **erst**,
nachdem seine beiden heutigen Aufrufer umgestellt sind: `expandRecurrence` in
[expand.ts](../features/calendar/expand.ts) (`between`) und `consumedBefore` in
[recurrence.ts](../features/calendar/recurrence.ts) (`all`). Andere Aufrufer gibt es nicht.

Der Test muss beide Umstellungsrichtungen abdecken (Oktober **und** März — die Rückstellung ist der
Fall, der gern vergessen wird) und unter mehreren Runner-Zonen dasselbe liefern. Genau das ist die
Eigenschaft, die `tzid` nicht hat.

Zwei Dinge, die dabei mit erledigt werden müssen: die Dauer eines Vorkommens gehört ebenfalls in
Wandzeit gerechnet (sonst verschiebt sich das Ende eines mehrtägigen Termins über die Umstellung),
und `setRruleUntil` schreibt heute ein nacktes `yyyy-MM-dd` in eine `timestamptz`-Spalte — unter der
neuen Zonenauswertung läge der Serienschnitt bei 02:00 Ortszeit statt am Tagesende.

> **Reihenfolge:** Die Spec zieht 1.4 **vor** 1.3, entgegen der ursprünglichen Sortierung hier.
> Grund: 1.4 schreibt den Vertrag von `rrule.ts` neu, und 1.3 baut seine Kandidatenmenge darauf auf.
> Andersherum entstünde die Kandidaten-Logik gegen Regel-Daten, die noch eine Stunde falsch sind.
> Erster Schritt der Iteration ist eine Gegenprobe, ob `Intl.DateTimeFormat` mit `timeZone` und
> `formatToParts` unter Hermes auf iOS **und** Android trägt — das Repo nutzt heute nirgends `Intl`
> zur Laufzeit, und ein bestandener `bun test` beweist dafür nichts.

**Definition of done Block 1:** Für jeden der vier PRs ein Regressionstest, der **vor** dem Fix rot
ist · `bun test` grün · eine Sichtprüfung der Serienbearbeitung am Simulator (Web reicht hier nicht,
siehe Block 3).

---

## Block 2 — Aufgaben-Löschpfad & Konfliktlücken

**Aufwand M · 2–3 PRs · dieselbe Schadensklasse bei Tasks, plus was ADR-031 offen ließ**

### 2.1 `features/tasks/mutations.ts` umbauen — **M, ein PR für drei Einträge**

Drei TODO-Einträge fassen **dieselbe Mutation** an. Sie einzeln zu erledigen hieße, `mutations.ts`
dreimal umzubauen — `TODO.md` sagt das bei zweien davon selbst („verwandt mit dem Eintrag …, der
dieselbe Mutation umbaut").

- **„`useDeleteTask` hat keinen 0-Zeilen-Guard"** ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1))
  Ein `DELETE`, das unter RLS null Zeilen trifft, meldet `error: null`. Die Mutation „gelingt",
  gelöscht wurde nichts, die Aufgabe ist beim nächsten Refetch zurück. Das Geschwister
  `useUpdateTask` hängt genau dafür `.select("id").maybeSingle()` an. Das ist der Mechanismus, der
  ein verzögertes Löschen nach dem Abmelden lautlos macht — der Grund für das `flush()` in
  `useSignOut` ([features/auth/mutations.ts](../features/auth/mutations.ts)).
- **„`useDeleteTask` prüft keine `baseVersion`"** ([Conflict-Detection](./TODO.md#conflict-detection-siehe-adr-031))
  Im Zwei-Client-Lauf beobachtet: A plant eine Löschung, B ändert innerhalb des 5-s-Undo-Fensters
  denselben Datensatz und speichert erfolgreich; nach Ablauf ist die Aufgabe weg — ohne Toast,
  Rückfrage oder Hinweis an B. Die „Trotzdem löschen"-Mechanik, die der Termin-Pfad seit
  [ADR-031](./decision-log.md) Decision 13 hat, existiert für Aufgaben gar nicht. Braucht
  `.eq("updated_at", …)` **plus** ein `errorAction` an `useUndoableDelete`.
- **„`useUpdateTask` hat keine eigene Testsuite"** ([Conflict-Detection](./TODO.md#conflict-detection-siehe-adr-031))
  Der Hook spricht direkt mit `supabase`; es fehlt der injizierbare Deps-Schnitt, den der Kalender
  hat (`fetchMaster` + `ops` in [features/calendar/mutations.ts](../features/calendar/mutations.ts)).
  Sein Compare-and-Swap ist heute **nur** durch einen beobachteten Zwei-Client-Lauf belegt, nicht
  automatisiert.

**Reihenfolge im PR: erst der Deps-Schnitt, dann die beiden Fixes.** Andersherum baut man zwei
Korrekturen ohne Testmöglichkeit ein und zieht den Schnitt hinterher durch fertigen Code.

### 2.2 Die zwei Löcher in der Conflict-Detection — **M**

Beide in `TODO.md` → [Calendar](./TODO.md#calendar-v1--siehe-adr-008), beide von ADR-031 bewusst
außerhalb von Task 8 gelassen:

- **„Eine reine Änderung der Wiederholungsregel wird beim Konflikt-Vergleich still überschrieben"**
  · [conflict.ts](../features/calendar/conflict.ts) — `differingEventFields`
  Vergleicht nur die fünf `EventChanges`-Felder; `vars.recurrence` fließt nicht ein. Ändern zwei
  Eltern denselben Termin ausschließlich am Rhythmus, ist die Feldliste leer und `showConflict`
  speichert lautlos durch — **genau die Klasse stillen Überschreibens, gegen die das Feature gebaut
  ist.** Mit dem Drei-Wege-Vergleich (Task 13) ist die Lücke _schärfer_ geworden: das zufällige
  Sicherheitsnetz des alten, zu strengen Vergleichs ist ersatzlos entfallen.
- **„Der Compare-and-Swap-Fall zeigt den Dialog ohne Vergleichszeilen und ohne frische Basis-Version"**
  · [EventEditScreen.tsx](../app-sections/event/EventEditScreen.tsx) — `showConflict`
  Bei `EventConflictError.row === null` fehlen `theirs` **und** eine frische Version — „Deine Fassung
  speichern" schickt zwangsläufig wieder die alte `baseVersion` und scheitert erneut. Der billigere
  der beiden möglichen Fixes: `updateMaster` liefert im Fehlerfall die aktuelle Zeile mit, statt
  `null`. Der teurere wäre ein Retry-Loop mit Backoff im Dialog.

Der zweite Punkt ist erkennbar der kleinere und sollte zuerst kommen — er verbessert die
Diagnostizierbarkeit des ersten, während man daran arbeitet.

### 2.3 Toggle-Fehler ist auf Web unsichtbar

🎨 **„Toggle-Fehler ist auf Web unsichtbar"** · [TaskRow.tsx](<../app-sections/(tabs)/aufgaben/TaskRow.tsx>) — `handleToggle`

`Alert.alert` ohne Titel ist auf react-native-web ein No-op — ein fehlgeschlagenes Abhaken bleibt
komplett stumm. Die Lösung liegt bereit: `showAlert` aus
[confirmDialog.ts](../app-sections/shared/confirmDialog.ts), das genau diesen No-op abfängt (und
laut eigenem TODO-Eintrag **absichtlich** ungenutzt auf diesen Aufrufer wartet). 🎨 Braucht einen
Titel-String, und der gehört in die designer-eigene [docs/COPY.md](./COPY.md).

Der Code-Teil ist vorbereitbar; der Key ist der einzige Blocker. Gehört zum Designer-Paket, das mit
Block 3 fällig wird.

**Definition of done Block 2:** `features/tasks/mutations.ts` hat einen Deps-Schnitt und eine
Testsuite · Löschen einer fremdgeänderten Aufgabe zeigt denselben Dialog wie beim Termin · eine
reine Rhythmus-Änderung durch zwei Clients erzeugt einen Konflikt statt eines stillen Overwrites.

---

## Block 3 — Web-Parität

**Aufwand M · ~2 PRs · macht den schnellsten Prüf-Loop wieder ehrlich**

`CLAUDE.md` nennt `bun run web` den „fastest smoke-test loop". Das stimmt heute nur eingeschränkt:
Löschen, beide Geburtstags-Picker und jeder Toggle-Fehler sind dort **tot**, ohne dass etwas darauf
hinweist. Jede Iteration ab hier zahlt für diese Lücke — deshalb kommt der Block früh, direkt nach
den Datenverlust-Fixes, deren Sichtprüfung er selbst erleichtert.

Gemeinsame Ursache bei den ersten dreien: `Alert` ist auf react-native-web ein No-op
(`static alert() {}`).

| Eintrag                                                                                                       | Datei                                                                                                                                                         | Fix                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **„Der Termin-Löschpfad ist auf Web gar nicht auslösbar"** ([Calendar](./TODO.md#calendar-v1--siehe-adr-008)) | [EventDetailScreen.tsx](../app-sections/event/EventDetailScreen.tsx) — `onDeletePress` · [scopeDialog.ts](../app-sections/event/scopeDialog.ts) — `pickScope` | `confirmDestructive` statt rohem `Alert.alert` (`TaskEditScreen` macht es vor) **plus** ein Web-Zweig in `pickScope` ohne `ActionSheetIOS`.                                                                                           |
| **„Geburtstags-Picker rendert auf Web nicht"** ([Familie](./TODO.md#familie--child-profile-live-daten-v1))    | [ChildProfileScreen.tsx](../app-sections/child-profile/ChildProfileScreen.tsx) · [Step4FirstChild.tsx](../app-sections/onboarding/Step4FirstChild.tsx)        | Beide binden `@react-native-community/datetimepicker` **direkt** ein statt des geteilten [DateTimePickerSheet](../app-sections/shared/DateTimePickerSheet.tsx), das seit [ADR-010](./decision-log.md) einen Web-Zweig hat. Umstellen. |
| 🎨 **„Toggle-Fehler ist auf Web unsichtbar"**                                                                 | siehe [2.3](#23-toggle-fehler-ist-auf-web-unsichtbar)                                                                                                         | wartet auf Copy-Key                                                                                                                                                                                                                   |

Dazu drei Web-Eigenheiten, die keinen Designer brauchen:

- **„Klicks auf die Tagesagenda treffen auf Web eine unsichtbare Kalendertag-Fläche"**
  ([Conflict-Detection](./TODO.md#conflict-detection-siehe-adr-031)) ·
  [KalenderScreen](<../app-sections/(tabs)/kalender/KalenderScreen.tsx>)
  Im Zwei-Client-Lauf zuverlässig reproduziert: ein Klick auf die Tagesliste landet auf einer
  absolut positionierten Fläche eines Kalendertags — vermutlich der Pager-Layer, den
  `enableSwipeMonths` in `react-native-calendars` aufspannt. Erzwungenes Klicken half nicht
  (`force` umgeht nur Playwrights Prüfung, nicht das Browser-Hit-Testing). **Echtes
  Usability-Problem**, nicht nur ein Testartefakt — bislang nur festgehalten, nie untersucht. Erster
  Schritt ist eine Diagnose, keine Korrektur: erst klären, ob der Layer abschaltbar ist oder ob die
  Agenda aus dem Kalender-Container heraus muss.
- **„Web-Datums-/Zeit-Input springt beim Tippen zurück"** ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1)) ·
  [DateTimePickerSheet.web.tsx](../app-sections/shared/DateTimePickerSheet.web.tsx)
  Bekannter Quirk kontrollierter Date-Inputs, seit der `Field`-Pressable-Korrektur überhaupt erst
  erreichbar. **Erst prüfen, ob es UX-relevant ist** — der TODO-Eintrag verlangt ausdrücklich diese
  Beobachtung, nicht direkt einen Fix.
- **„Render-Schleife beim Login-Übergang"** ([Dashboard](./TODO.md#dashboard)) ·
  [DashboardScreen](<../app-sections/(tabs)/dashboard/DashboardScreen.tsx>)
  `Maximum update depth exceeded` auf Web, einmalig, nur im Übergang von `/login`. Stack führt über
  `forceStoreRerender` → `commitHookLayoutEffects`, also ein `useSyncExternalStore`-Abo, das in
  einem Layout-Effekt eine Zustandsänderung auslöst. Reproduziert auf `main`. Der Screen rendert
  trotzdem — deshalb zuletzt im Block, aber es ist die Sorte Befund, die später als Flake in einem
  Component-Test wiederkommt (→ Block 5).

**Definition of done Block 3:** Ein Termin lässt sich im Web-Build löschen · beide
Geburtstagsfelder öffnen im Web einen Picker · die Konsole ist beim Login-Übergang sauber.

---

## Block 4 — Touch-Targets & a11y

**Aufwand S · ein PR · eine gemeinsame Sichtprüfung**

`CLAUDE.md` Non-negotiable 4 lautet „Touch targets ≥ 44×44". Zwei ausgelieferte Screens verletzen
das, ein dritter Punkt macht einen Filter unsichtbar. Alle vier zusammen kosten eine
Sichtprüfungsrunde statt vier — genau der Grund, aus dem sie einzeln vertagt wurden.

- **„`hitSlop` in `TypePicker` und `MemberPicker` vergrößert das Touch-Target nicht"**
  ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1)) ✅ verifiziert an
  [TypePicker.tsx:46-47](../app-sections/shared/TypePicker.tsx) (`h-9` + `hitSlop={{top:4,bottom:4}}`,
  Eltern-`View` exakt so hoch wie die Pille).
  React Native beschneidet die Touch-Fläche an den Grenzen des Elternteils — die 4 px oben und unten
  fallen **ersatzlos** weg, die Pillen bleiben bei 36 px. [FilterChipRow](../app-sections/shared/FilterChipRow.tsx)
  hat dasselbe Muster geerbt und mit einem `py-1` am Container behoben; dieselbe Zeile löst es hier.
  Betrifft die ausgelieferten Termin- **und** Aufgaben-Formulare.
- **„Farbfelder im Kinderprofil überlappen sich"** ([Familie](./TODO.md#familie--child-profile-live-daten-v1)) ·
  [ChildProfileScreen.tsx](../app-sections/child-profile/ChildProfileScreen.tsx) — `AVATAR_COLORS`
  28 px mit `hitSlop={8}` und `gap-2`: die Touch-Rechtecke treffen sich mitten in der 8-px-Lücke, ein
  Tipp knapp neben einem Feld landet auf dem nächsten. [ParentProfileScreen](../app-sections/parent-profile/ParentProfileScreen.tsx)
  setzt seit dem CodeRabbit-Review 44×44-Boxen, die kantenbündig kacheln — dieselben zehn Zeilen.
- **„Ein gelöschtes Kind lässt den Kind-Filter ins Leere zeigen"** ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1)) ·
  [filterStore.ts](../features/tasks/filterStore.ts)
  Der Store hält die `child_id` als freien String und gleicht sie nie gegen die Kinderliste ab. Wird
  ein Profil gelöscht, während sein Chip aktiv ist, bleibt die Liste leer und **kein** Chip ist
  hervorgehoben — der Filter ist aktiv, aber unsichtbar. Abgleich gegen `useFamilyChildren` mit
  Rückfall auf `CHILD_ALL`.
- **„`short` erscheint nur im Familie-Tab und im Parent-Profil"** ([Familie](./TODO.md#familie--child-profile-live-daten-v1)) ·
  [ChildAvatar.tsx](../app-sections/shared/ChildAvatar.tsx)
  Dashboard-Avatarreihe und Settings-Profilkarte leiten die Initialen weiter selbst ab; ein
  geändertes Kürzel wirkt dort nicht. Je eine Zeile — vertagt worden, weil beide Screens eine
  Sichtprüfung wollten. Die gibt es in diesem Block ohnehin.

**Definition of done Block 4:** Alle vier Änderungen in **einem** PR, danach eine Sichtprüfung über
Termin-Formular, Aufgaben-Formular, Kinderprofil, Dashboard und Einstellungen — light und dark.

---

## Block 5 — Der RN-Component-Test-Pfad (Schlussstein)

**Aufwand L · eigene Iteration mit Spike · entsperrt vier Einträge**

Ab hier wird Infrastruktur gebaut. Vier Einträge warten explizit auf **einen** fehlenden Pfad: es
gibt im Repo keine Möglichkeit, React-Komponenten im Test zu rendern.

- **„Es gibt weiterhin keinen einzigen RN-Component-Test"** ([Renovate](./TODO.md#renovate--dependencies-siehe-adr-013)) ✅
  63 Testdateien, eine `.tsx`, die nichts rendert. `@testing-library/react-native` und der
  `jest-expo`-Preset ([jest.config.js](../jest.config.js)) sind vorgehaltene, unbenutzte
  Infrastruktur.
- **„`features/calendar/hooks.ts` ist unter `bun test` nicht ladbar"**
  ([Calendar Optimistic UI](./TODO.md#calendar-optimistic-ui-siehe-adr-027)) — **der eigentliche
  technische Blocker.** Über `useTheme` zieht die Datei das `nativewind`-Runtime herein, dessen
  `react-native-css-interop` beim Modul-Laden unter Bun scheitert (erst fehlender
  `Appearance`-Mock, dann ein tieferer CommonJS-Wrapper-Fehler). Jede Datei in `features/calendar`,
  die aus `./hooks` importiert, ist damit für Tests unerreichbar — der Grund, warum
  `useCreateEvent` den Event-Typ aus dem Query-Cache liest statt `useEventTypes()` zu rufen.
- **„`useFamilyRealtime` ist ungetestet"** ([Realtime](./TODO.md#realtime-siehe-adr-030))
- **„Für die Hydrations-Invariante gibt es keinen Regressionstest"**
  ([Conflict-Detection](./TODO.md#conflict-detection-siehe-adr-031)) — **der wichtigste der vier.**
  „`baseVersion` ist die Version, aus der der Formular-State entstand" trägt das ganze
  Conflict-Feature ([ADR-031](./decision-log.md) Decision 6). Läse `onSave` sie wieder aus der
  lebenden Query, träfe das CAS anstandslos und überschriebe die fremde Änderung **lautlos, ohne
  dass je ein Dialog erscheint**. Die Invariante lebt in zwei Screens, und geschützt ist sie heute
  allein durch einen Kommentar an der Deklaration.

### Warum hier und nicht früher

Es ist verlockend, den Test-Pfad an den Anfang zu stellen. Dagegen sprechen zwei Dinge:

1. **Der Pfad ist ein Spike mit offenem Ausgang.** Das nativewind-Ladeproblem unter Bun ist keine
   Konfigurationsfrage, sondern ein Modul-Lade-Fehler in einer Fremdbibliothek. Die
   Blöcke 1–4 dahinter zu stauen hieße, Datenverlust-Fixes hinter eine Recherche zu hängen.
2. **Die Blöcke 1–4 brauchen ihn nicht.** Sie liegen sämtlich in reinen Modulen
   (`recurrence.ts`, `expand.ts`, `conflict.ts`, `mutations.ts`, `filterStore.ts`) mit bestehenden
   Suiten. Ihn danach zu bauen heißt außerdem, ihn gegen **vier frische Beispiele** dessen zu bauen,
   was tatsächlich getestet werden muss.

### Die Wegentscheidung, die am Anfang steht

`CLAUDE.md` hält den `jest-expo`-Preset bewusst „für den seltenen RN-Component-Snapshot-Test, der
den `jest`-Binary noch braucht" — via `npx jest`. Damit gibt es **zwei** mögliche Pfade, und die
Iteration beginnt mit der Wahl:

- **Unter `bun test`** — ein Zuhause für alle Tests, aber das nativewind-Ladeproblem muss gelöst
  werden (Mock, Alias oder Preload-Erweiterung in [bun.test.preload.ts](../bun.test.preload.ts)).
- **Unter `npx jest`** mit dem bereits verdrahteten `jest-expo`-Preset — der dokumentierte
  Fluchtweg, aber zwei Runner, zwei CI-Steps und die von `CLAUDE.md` beschriebene
  `jest-expo`-Versions-Fragilität pro SDK-Bump.

Der TODO-Eintrag zum v14-Bump gibt für beide Wege dieselbe Auflage mit: **gegen die v14-API
schreiben** — `render()`, `renderHook()`, `fireEvent()` liefern Promises, `act()` immer awaiten —
nicht gegen Beispiele aus 13.x-Dokumentation.

**Definition of done Block 5:** Ein Test rendert `EventEditScreen` und beweist, dass `baseVersion`
nach einem Fremd-Refetch **nicht** mitwandert · `features/calendar/hooks.ts` ist importierbar ·
der Weg (bun vs. jest) ist als ADR festgehalten.

---

## Block 6 — Meal-Plan-Mutationen (der größte Feature-Unlock)

**Aufwand L · eigene Iteration · löst sechs Einträge über drei Screens**

Technisch unblockiert ✅ — die RLS-Policies für INSERT/UPDATE/DELETE auf `meal_plan_entries` liegen
seit [20260529093329_recipes_and_meal_plan.sql](../supabase/migrations/20260529093329_recipes_and_meal_plan.sql)
bereit, `features/meals/` ist rein lesend. Es fehlt genau eine Mutationsschicht — und mit ihr fallen
sechs Einträge.

**Der Kern:** [features/meals/queries.ts](../features/meals/queries.ts) →
**„Mutationen fehlen"** ([Essen](./TODO.md#essen--meal-planner-daten-layer-v1)). Der Eintrag
zählt seine wartenden Aufrufer selbst auf:

1. **Leere Tageszeile im [WeekPlanGrid](<../app-sections/(tabs)/essen/WeekPlanGrid.tsx>)** — kennt
   `date` **und** `slot` bereits, hat also alles beisammen. Der naheliegendste erste Aufrufer.
2. **„Zum Essensplan hinzufügen" in [RecipeScreen](../app-sections/recipe/RecipeScreen.tsx)** —
   braucht zusätzlich eine Auswahl _wohin_, weil die Detailansicht weder `date` noch `slot` kennt.
3. 🎨 **Das `more`-Kebab der geplanten Zeile** — bewusst entfernt, kommt mit der Mutation zurück
   (dann ≥44×44 und mit a11y-Label, nicht als 18-px-Icon). **Designer:** trägt das Kebab in der
   V1-Anatomie von [patterns/meals.md](../patterns/meals.md) — und welche Aktionen (Tauschen ·
   Löschen · Portionen?).
4. 🎨 **„Der Meal-Hero kann die geplante Mahlzeit nicht austauschen"** ([Dashboard](./TODO.md#dashboard)) ·
   [MealHeroCard](<../app-sections/(tabs)/dashboard/MealHeroCard.tsx>) — trifft das geplante Gericht
   ein Familien-Allergen, bietet die Karte ein sicheres Ausweichgericht an, der Button öffnet aber
   nur dessen Rezept. **Designer:** Copy-Key für den Tausch-Button („Stattdessen kochen"?).
5. **„Der Hero-CTA plant nicht, er navigiert nur"** ([Dashboard](./TODO.md#dashboard)) ·
   [MealHeroEmptyCard](<../app-sections/(tabs)/dashboard/MealHeroEmptyCard.tsx>) — „Essen planen"
   führt in den Essen-Tab, wo man ebenfalls nichts eintragen kann. Der Weg endet im Raster statt in
   einem Formular. Mit der Mutation wird aus der Navigation eine Handlung.
6. 🎨 **„Der Essen-Tab kennt nur die aktuelle Woche"** ([Essen](./TODO.md#essen--meal-planner-daten-layer-v1)) ·
   [EssenScreen](<../app-sections/(tabs)/essen/EssenScreen.tsx>) — `useMealPlans(weekStart)` nimmt
   jede Woche entgegen, der Screen übergibt immer die aktuelle. Der Screen ist vorbereitet:
   `weekStart` ist die einzige Stelle, an der die Woche entsteht, `formatWeekRange` beschriftet jede.
   **Designer:** `patterns/meals.md` führt die Wochenleiste unter **V2** — planen ohne Blättern ist
   halb nutzlos, aber die Reihenfolge gehört dem Designer.

### Reihenfolge innerhalb des Blocks

Mutationsschicht zuerst (`features/meals/mutations.ts` — setzen, tauschen, löschen), dann Aufrufer 1
als einfachster Beweis, dann 5 und 4, dann 2 und 3. Die Designer-Punkte (3, 4, 6) blockieren die
Schicht **nicht** — sie blockieren nur ihre jeweilige Oberfläche.

**Vorher zu klären:** Ob die Mutationen optimistisch werden. Der Kalender hat dafür ein
Overlay-Modell ([ADR-027](./decision-log.md)), Tasks patchen den Cache
([mutations.ts](../features/tasks/mutations.ts)) — es gibt also **zwei** Präzedenzfälle mit
unterschiedlicher Form. Diese Wahl gehört in den ADR, nicht in den Code.

> **Kollisionshinweis:** Kommt ein drittes Occurrence-Overlay dazu, wird der geparkte Eintrag
> **„Vereinigung der beiden Occurrence-Overlays"** ([Calendar Optimistic UI](./TODO.md#calendar-optimistic-ui-siehe-adr-027))
> fällig — er wartet ausdrücklich auf genau dieses dritte Vorkommen. Beim Entwurf mitdenken.

**Definition of done Block 6:** Eine leere Tageszeile ist drückbar und schreibt eine Mahlzeit · der
Hero-CTA plant statt zu navigieren · ein ADR hält die Optimistik-Entscheidung fest · die drei
🎨-Punkte sind als Frage an den Designer formuliert.

---

## Block 7 — Transaktions-RPC für den Kalender

**Aufwand L · eigene Iteration mit Migration und Zwei-Client-Durchgang**

Die teuerste verbleibende Korrektheitsbaustelle — und die einzige, die **eine** Lösung für zwei
Einträge ist. `TODO.md` beschreibt die RPC bei beiden als den sauberen Fix.

- **„Fünf Schreib-Ops laufen ohne bedingte Versionsprüfung"**
  ([Conflict-Detection](./TODO.md#conflict-detection-siehe-adr-031)) ·
  [recurrence.ts](../features/calendar/recurrence.ts) — `createSupabaseEventOps`
  `modifyOccurrence`, `cancelOccurrence`, `deleteMaster`, `setRruleCount`, `setRruleUntil` schreiben
  unbedingt. Der Pre-Flight deckt sie ab, aber nur gegen den Stand, den er selbst gelesen hat — eine
  Fremdänderung **danach** trifft keine Prüfung. Zwei Clients können dieselbe Occurrence ändern, der
  letzte `upsert` gewinnt ohne `EventConflictError`. In ADR-031 als bewusste Grenze dokumentiert;
  aufgekommen als CodeRabbit-Finding an [PR #115](https://github.com/SvenSonnborn/ElternFlowAI/pull/115)
  und dort mit dieser Begründung abgelehnt.
- **„`deleteAllExceptions` vor `updateMaster` öffnet seit dem Compare-and-Swap ein neues
  Verlustfenster"** ([Calendar](./TODO.md#calendar-v1--siehe-adr-008))
  Beide Aufrufe sind nicht-transaktional, die Reihenfolge steht bewusst so. Seit dem CAS scheitert
  der zweite Call zusätzlich bei **jedem** fremden Schreibvorgang zwischen den beiden — genau dem
  Szenario, für das das Feature gebaut ist. Die Exceptions sind dann unwiederbringlich gelöscht, die
  Regel unverändert, und der Nutzer liest „jemand anderes hat geändert". Das Fenster ist ein voller
  Roundtrip, nicht Millisekunden.

Dazu gehört die Serverhälfte von **Issue [#111](https://github.com/SvenSonnborn/ElternFlowAI/issues/111)**
— **„Die Retry-Aktion des Fehler-Toasts ist nicht idempotent"**
([Calendar Optimistic UI](./TODO.md#calendar-optimistic-ui-siehe-adr-027)): Ging der erste Versuch
serverseitig durch und nur die Antwort verloren, legt „Erneut versuchen" einen zweiten Termin an
oder spaltet eine Serie ein zweites Mal. Der TODO-Eintrag sagt es deutlich: **„Ein echter Fix
braucht Idempotenz auf der Server-Seite (ein Dedup-Key), nicht mehr Client-Logik."** Dieselbe
Migration, dieselbe Iteration.

> Die zweite Hälfte von #111 — `onSettled` räumt den optimistischen Eintrag ab, obwohl
> `invalidateQueries` auch bei fehlgeschlagenem Refetch auflöst — ist **kein** RPC-Thema. Sie ändert
> den Kern von ADR-027 Decision 1 (Lebensdauer an eine bestätigte Serverprojektion hängen) und
> gehört in eine eigene Runde am Overlay-Modell.

**Warum so spät:** Pre-Flight und CAS decken den Normalfall bereits ab; die verbleibende Lücke ist
eine Größenordnung unwahrscheinlicher. ADR-031 hat sie deshalb bewusst offen gelassen. Sie braucht
eine neue Migration, einen neuen `EventOps`-Zuschnitt, einen eigenen Testlauf **und** einen zweiten
Zwei-Client-Durchgang — das rechtfertigt sich erst, wenn die häufigen Fehler weg sind.

**Definition of done Block 7:** Eine Transaktions-RPC prüft Master und betroffene Exception bedingt,
bevor sie irgendetwas schreibt oder löscht · der Zwei-Client-Lauf aus
[2026-09-04-conflict-detection-verification.md](./superpowers/plans/2026-09-04-conflict-detection-verification.md)
wiederholt und um die fünf Ops erweitert · ADR-031 wird **superseded**, nicht editiert.

---

## Block 8 — Docs-Resync & Refactors

**Aufwand S–M · blockiert nichts · acht Einträge**

### 8.1 Der Docs-Pass — **S, ein Commit**

Drei Einträge, die `TODO.md` selbst als „eigener Docs-Pass" zusammenfasst:

- **„`docs/architecture.md` ‚What's not here yet' ist veraltet"** ([Einstellungen](./TODO.md#einstellungen-phase-1))
  — Zeile ~67 behauptet „no Supabase … no auth, no onboarding, no settings screen". Alles vorhanden.
- **„`docs/architecture.md` nennt noch drei Themes"** ([Einstellungen](./TODO.md#einstellungen-phase-1))
  — Zeile ~42 führt `warmLight`/`softDark`/`pastelBlue`; es gibt `light` und `dark`
  ([themes.ts](../design-system/themes.ts)).
- **„`docs/eltern-flow-ai-project-structure.md` ist veraltet"** ([Essen](./TODO.md#essen--meal-planner-daten-layer-v1))
  — `meal-planner/ (placeholder)`, `design-system/components/`, eine `essensplanung.tsx`-Route, drei
  Themes, `supabase/ (placeholder)`. Braucht einen Re-Sync, keinen Ein-Zeilen-Patch.

Beim Durchgang gleich diese Datei hier mit auf Stand halten.

### 8.2 `onboardingMutations.ts` → `familyMutations.ts` — **S**

([Familie](./TODO.md#familie--child-profile-live-daten-v1)) Die Datei hält längst das gesamte
Familien-CRUD; nur zwei ihrer Hooks kommen im Onboarding vor. Mechanisch, aber berührt jeden
Importpfad und den Barrel — deshalb eine eigene, sonst leere Änderung, damit der Diff lesbar bleibt.

### 8.3 Kleine Korrekturen mit je eigenem Grund — **S–M**

- **„Die Mutations-`onSettled`-Blöcke invalidieren weiterhin `calendarKeys.all`"**
  ([Realtime](./TODO.md#realtime-siehe-adr-030)) — der Realtime-Pfad nutzt seit ADR-030 die engeren
  Präfixe `eventsRoot`/`oneRoot`; die Mutationen ziehen `types` und `reminders` bei jedem Schreiben
  mit. Einzeiler pro Block — der aber drei Overlay-Interaktionen berührt (ADR-026, ADR-027) und
  seinen eigenen Testlauf verdient.
- **„Doppelte Anzeige, solange zwei Range-Queries aktiv sind"**
  ([Calendar Optimistic UI](./TODO.md#calendar-optimistic-ui-siehe-adr-027)) — Kalender auf Oktober,
  Dashboard auf September: der neue Termin erscheint **zweimal**, bis auch die zweite Query durch
  ist. Selbstheilend, aber „die auffälligste denkbare Fehlanzeige für ein Feature, das gerade
  Vertrauen in die Sofortanzeige aufbauen soll".
- **„Kein Kompositions-Test für die Kalender-Filterkette"** + **„Der `forward`-Filter vergleicht
  aufgelöste Daten, der Server rechnet auf Regel-Daten"** ([Undo-Delete](./TODO.md#undo-delete-siehe-adr-026))
  — zwei Einträge, ein Test. `TODO.md` sagt ausdrücklich: **„Braucht keine neue Infrastruktur"** —
  eine Event-Zeile durch `expandEvents` schicken und das Ergebnis filtern, also genau die Kette aus
  `useFamilyEvents`. Genau der Test, der die Divergenz gefunden hätte. **Nach Block 1.3 einplanen**,
  weil sich das Override-Modell dort ändert.
- **„`typeLabelsForSlug` liefert `undefined`, solange i18next nicht initialisiert ist"**
  ([Weitere](./TODO.md#weitere-out-of-scope-items)) · [palette.ts](../features/calendar/palette.ts)
  — In der App unauffällig, in einem `bun test` ohne i18n-Setup nicht. Die Lösung ist ein
  `getFixedT`-Paar oder ein Init-Guard, **nicht** Dependency-Injection: die Funktion muss DE **und**
  EN gleichzeitig liefern, was ein einsprachiges `t` nicht kann. Wird mit Block 5 dringlicher.
- **„Kollisionsprüfung reicht nur so weit wie das geladene Monatsfenster"**
  ([Calendar](./TODO.md#calendar-v1--siehe-adr-008)) — `conflicts` arbeitet auf
  `useFamilyEvents(startAt)`, also dem Monat um den Starttag ±7 Tage; eine längere Terminspanne wird
  nur im geladenen Ausschnitt geprüft. Sauber ist ein am Formular-Range ausgerichtetes Query-Fenster
  — eine Änderung an der Query-Ebene.
- **„Invite-Link von bereits-Mitglied geöffnet"** ([Auth](./TODO.md#auth--onboarding)) ·
  [deepLinkHandler.ts](../features/auth/deepLinkHandler.ts) — heute landet der Nutzer im
  Namensformular und bekommt erst beim Absenden `23505`. Früh kurzschließen und freundlich melden.
- **„Abgelaufene Einladungen werden nie aufgeräumt"** ([Familie](./TODO.md#familie--child-profile-live-daten-v1))
  — pg_cron-Job auf `family_invitations` mit `used_at is null and expires_at < now()`. `TODO.md`
  schlägt vor, ihn „sinnvollerweise zusammen mit dem Reminder-Worker" zu bauen — der ist 🔒
  notifications-blockiert, dieser Job aber **nicht**. Er steht für sich und kostet eine Migration.

**Definition of done Block 8:** `architecture.md` und die Struktur-Datei beschreiben das Repo von
heute · `familyMutations.ts` heißt so · der Kompositions-Test läuft.

---

## Block 9 — CI und Toolchain härten

**Aufwand S–M · verbessert, was Block 0 scharf gemacht hat**

Alle aus `TODO.md` → [Weitere Out-of-Scope-Items](./TODO.md#weitere-out-of-scope-items) und
[Renovate](./TODO.md#renovate--dependencies-siehe-adr-013).

- **Actions auf Commit-SHA pinnen** — heute Major-Tags (`@v4`/`@v5`). Härtet gegen kompromittierte
  Tag-Re-Points. Verstärkt sich mit Renovate: Regel 2 merged `digest`-Updates automatisch, **greift
  aber erst, sobald die Actions überhaupt auf SHAs stehen**. Danach hält Renovate sie von selbst
  aktuell — einmal Aufwand, dauerhaft gepflegt.
- **`expo-doctor`-Step im `bundle`-Job** — der Vorschlag ist seit ADR-016 billiger geworden: statt
  eines eigenen Workflows genügt ein `bunx expo-doctor`-Step auf bereits installierten Dependencies
  (kein Gate, `continue-on-error: true`, wie im Sync-Workflow). Was der Native-Build **nicht**
  abdeckt und nur `expo-doctor` sieht: Paketversionen abseits der SDK-Vorgabe, doppelte/inkompatible
  Deps, ungültige `app.json`-Felder. Ein Bump kann grün kompilieren und trotzdem von SDK 57
  abweichen — siehe Block 0.2.
- **`RCT_USE_PREBUILT_RNCORE` über `expo-build-properties`** — der Pin lebt heute ausschließlich in
  Shell-Umgebungen (mise lokal, `jdx/mise-action` in CI) und **nirgends im eingecheckten Projekt**;
  `ios/Podfile` Zeile 19 fällt ohne die Variable still auf `'1'` zurück. Das Plugin mit
  `ios: { buildReactNativeFromSource: true }` in [app.json](../app.json) schriebe den Key nach
  `Podfile.properties.json`, der Pin überlebte jeden Aufrufweg, und die Assertion im `ios`-Job würde
  von einer Notwendigkeit zur Redundanz. Braucht einen eigenen Native-Build-Nachweis — den es seit
  ADR-016 gibt.
- **`platformAutomerge: true` testen** — Startvorsicht, keine Dauerlösung. „Sobald ein Monat
  Automerge sauber gelaufen ist" gegen `true` testen. Der Zeitpunkt ist erreicht, wenn Block 0.1
  Required Checks gesetzt hat — GitHubs natives Auto-Merge hält den PR dann offen, bis alles grün
  ist, statt Renovate auf einen Poll-Zyklus warten zu lassen.
- **Custom-Manager-Regex beim nächsten Bun-Bump gegenprüfen** — hängt an der Textform der
  `bun-version:`-Zeilen; wird eine umformatiert, greift der Manager still nicht mehr. Kein
  Merkposten für „irgendwann", sondern eine **Prüfung im nächsten Bun-PR**: stehen alle Fundstellen
  (`mise.toml` + jede `bun-version:`-Zeile) im selben PR?
- **Regel 3 gegen `relatedPackages` abgleichen** — fällig **beim nächsten SDK-Sprung**, nicht davor.
  Gegenprobe ist `bunx expo install --check`. Bewusst nicht automatisiert.
- **`dependency-review.yml` vs. Renovates `vulnerabilityAlerts`** — nach ein paar Monaten prüfen, ob
  beide gebraucht werden. Reine Beobachtung, kein Handgriff.

---

## Block 10 — Große Migrationen

**Aufwand L · kein Zeitdruck · je eine eigene Iteration**

- **Tailwind v3 → v4** ([tailwind.config.js](../tailwind.config.js) + [global.css](../global.css)) —
  beim SDK-54→57-Update (ADR-007) bewusst zurückgestellt. Neue CSS-first-Config `@theme`, geändertes
  Content-Scanning, NativeWind-v4-Kompatibilität prüfen. Berührt das Theming-Fundament aus
  `CLAUDE.md` → Theming (CSS-Variablen + `vars()`), also die Stelle, an der ein Fehler **jeden**
  Screen trifft.
- **`@expo/vector-icons` → scoped `@react-native-vector-icons/*`** ·
  [Icon.tsx](../app-sections/shared/Icon.tsx) — SDK 56 deprecatet das Bundle-Paket. Codemod
  vorhanden (`npx @react-native-vector-icons/codemod`), Icon-Namen und Imports ändern sich. **Kein
  Breaking Change**, funktioniert unverändert weiter — deshalb echte Kür.
- **Smoke-Start im Simulator/Emulator** ([native-build.yml](../.github/workflows/native-build.yml))
  — das Gate beweist „kompiliert", nicht „startet". Ein Absturz beim App-Start (fehlendes
  Native-Modul, kaputtes Autolinking, defekter Splash/Font-Pfad) käme weiterhin erst am Gerät heraus.
  Braucht einen laufenden Metro-Prozess im Job und eine Abbruchbedingung, die nicht flaky ist.
- **`eas build --local` als gemeinsame Build-Definition** — erst sinnvoll, wenn `eas.json` für die
  🔒 Release-Iteration existiert; sonst gibt es nichts zusammenzuführen. Zu prüfen ist vorher, ob
  sich Caching in den lokalen EAS-Build durchreichen lässt.

---

## Geparkt — extern blockiert

Nicht umsetzbar, unabhängig von verfügbarer Zeit. Hier steht **woran** es hängt, damit beim Wegfall
der Blockade sofort klar ist, was mitkommt.

### STT-/LLM-Provider fehlt → Issue [#23](https://github.com/SvenSonnborn/ElternFlowAI/issues/23)

Der größte einzelne Block. Es hängen daran:

- Voice-Overlay überhaupt ([patterns/settings-voice.md](../patterns/settings-voice.md)) — der FAB
  öffnet heute einen Platzhalter
- **„Voice-Add-Flow"** (Kalender) und **„Voice-Add im Child-Profile"** (Familie)
- **„Likes/Dislikes ohne AI-Vorschläge"** (Familie) — heute reiner Freitext-Tag-Editor
- **„Die Prep-Karte ist eine Liste, keine Vorbereitung"** (Dashboard) — `patterns/dashboard.md`
  beschreibt abgeleitete Handlungen („Schwimmsachen einpacken" zum Termin „Schwimmen"); verdrahtet
  ist die ehrliche Vorstufe. **Bis der Provider da ist, wäre jede „abgeleitete" Zeile erfunden.**
- **„Die Avatar-Reihe filtert nichts"** (Dashboard) — der Long-Press-Voice-Einstieg. Der
  Personen-Filter selbst ist 🎨, nicht 🔒.
- **„Coming-soon-Rows ohne Ziel"** (Einstellungen) — der Sprachassistent-Teil

### gustar.io-Worker fehlt → Issues [#24](https://github.com/SvenSonnborn/ElternFlowAI/issues/24), [#88](https://github.com/SvenSonnborn/ElternFlowAI/issues/88)

- **„Die Rezept-Detailansicht hat keine Nährwerte"** — Tab hält den Platz, `recipes` hat keine
  einzige Nährwert-Spalte. Braucht `nutrition jsonb` + Normalisierung.
- 🎨 **„`diet_tags` werden roh angezeigt"** — lokalisierter Katalog ist eine Designer-Entscheidung
  über die Tag-Palette, keine Übersetzungsarbeit.
- **„Die Begriffslisten sind ein Startkorpus"** — an echten Daten nachschärfen. Jeder neue Term
  braucht einen Testfall, jeder False Positive einen `exclude`-Eintrag.
- **„Nur sechs Seed-Rezepte, alle ohne Bild"** — genug für die vier Urteilszustände, nicht für Such-
  oder Lasttests. Der `Image`-Zweig in `RecipeScreen` ist bisher nur gegen ein manuell gesetztes
  `image_url` geprüft.
- **„Kein Index bedient den Rezept-Query-Pfad"** — bei sechs Seeds irrelevant, **„sollte aber vor
  dem gustar.io-Worker auf dem Zettel stehen, nicht erst, wenn der Tab spürbar langsam wird"**.
  Kandidaten: `pg_trgm` + `gin (title gin_trgm_ops)`, B-Tree auf `created_at desc, id`.
- **„Die Klassifizierungs-Edge-Function fehlt weiterhin"** — Owner des `declared`-Kanals. Muss
  `features/meals/allergens/` **importieren**, statt ein zweites Vokabular aufzumachen; das Modul
  ist genau dafür frei von React- und Supabase-Imports (ADR-014 Decision 2).

> **Teil-unblockiert:** **„Ein negiertes Schlüsselwort räumt den Key nicht ab"** („glutenfreie
> Nudeln" meldet `gluten`) ist **keine** Datenfrage. Der Fix ist ein `selfTerms`-Feld je Spec —
> wird ein Term negiert, der das Allergen _selbst_ benennt, fällt der ganze Key. Der naheliegende
> Fix „Negation gilt für den ganzen Key" ist **falsch**, daran hängt der laktosefrei-Fall
> (ADR-014 Decision 5). Das ließe sich jederzeit bauen; sinnvoll ist es trotzdem erst am echten
> Korpus. Ebenso **„`intolerances` wird nicht gelesen"** — braucht ein eigenes Urteilsmodell.

### Expo Notifications fehlt → Issue [#25](https://github.com/SvenSonnborn/ElternFlowAI/issues/25)

- **„Reminder-Rows werden noch nicht zugestellt"** (Calendar) — der Client schreibt und löscht
  `reminders`-Zeilen, `sent_at` stempelt niemand. Es fehlt der pg_cron + Edge-Function-Worker.
- **„Task-Zeilen haben keine Erinnerungs-Aktion mehr"** (Aufgaben) — `reminders` kennt `task_id`,
  aber es gibt keinen Zusteller.
- **„Mitteilungen zeigen keinen echten Status"** (Einstellungen) — die Row deep-linkt in die
  OS-Einstellungen, kennt den Berechtigungsstatus nicht.

### Weitere externe Blockaden

- **Stripe** → Issue [#26](https://github.com/SvenSonnborn/ElternFlowAI/issues/26)
- **Social Logins** → Issue [#27](https://github.com/SvenSonnborn/ElternFlowAI/issues/27)
- **Release / EAS** — **„EAS für Release, Signing und Store-Auslieferung"** (kein `eas.json`,
  Account `sf-sven` existiert) zusammen mit **„Build-Nummer fehlt"** (weder `ios.buildNumber` noch
  `android.versionCode` in [app.json](../app.json), deshalb zeigt der Settings-Footer nur `v{semver}`).
  `TODO.md` weist beide ausdrücklich **einer gemeinsamen Release-Iteration** zu. Das EAS-Free-Kontingent
  (15 iOS + 15 Android/Monat) bleibt dafür unangetastet — an ein Per-PR-Gate verfüttert wäre es nach
  ~15 Pushes leer.
- **„Invite-Link ist ein Custom Scheme ohne Web-Fallback"** (Auth) — setzt eine eigene Domain samt
  `apple-app-site-association` und `assetlinks.json` voraus und erzwingt einen Native-Rebuild.
  Praktische Folge heute: WhatsApp und die meisten Mail-Clients linkifizieren `elternflow://` nicht,
  der Eingeladene bekommt untappbaren Rohtext — und hat die App per Definition meist noch gar nicht.
- **„Hintergrund-Flushen ist nur per E2E prüfbar"** (Undo-Delete) — braucht einen Maestro-Lauf. Ein
  Unit-Test wäre wertlos, weil der RN-Mock in [bun.test.preload.ts](../bun.test.preload.ts)
  registrierte `AppState`-Listener nie aufruft. Nicht anbieterblockiert, aber Infrastruktur, die es
  nicht gibt — Kandidat für eine eigene kleine Iteration nach Block 5.
- 🎨 **„Debug-Screen: Dark-Theme auf iOS und jede Ansicht auf Android"** (Realtime) — braucht
  Gerätezeit, kein Blocker. Risiko gering: ausschließlich `Screen`/`Card`/`Text`/`Button`/`Pill`.

---

## Geparkt — wartet auf ein drittes Vorkommen

Diese Einträge sind **absichtlich** offen. `TODO.md` benennt bei jedem die Bedingung, unter der er
fällig wird — sie jetzt zu erledigen hieße, ohne den zweiten Datenpunkt zu raten.

| Eintrag                                                                                                                                           | Wird fällig, wenn …                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **„Vereinigung der beiden Occurrence-Overlays"** ([Optimistic UI](./TODO.md#calendar-optimistic-ui-siehe-adr-027))                                | ein **drittes** Overlay dazukommt — siehe Hinweis in [Block 6](#block-6--meal-plan-mutationen-der-größte-feature-unlock)                                                                                                                 |
| **„`TaskCreateScreen` und `TaskEditScreen` teilen sich Kopfzeile und Shell"** ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1))              | ein **dritter** Task-Screen dazukommt (ADR-010 Decision 4 nimmt die ~30 identischen Zeilen bewusst in Kauf)                                                                                                                              |
| **„`subscribeToFamilyChanges` entsorgt Altkanäle ohne Zustandsprüfung"** ([Realtime](./TODO.md#realtime-siehe-adr-030))                           | ein **zweiter** Abonnent desselben Topics existiert — an dem sich die richtige Verengung entscheiden lässt. Die Falle ist nicht hypothetisch: genau sie hat den Debug-Screen auf den Ringpuffer umgebaut.                                |
| **„`useTasksSections` hat keinen Aufrufer"**, **„`showAlert` hat keinen Aufrufer"** ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1))        | **gar nicht** — beide bleiben absichtlich. `showAlert` ist die vorgesehene Lösung für [2.3](#23-toggle-fehler-ist-auf-web-unsichtbar). Die Einträge stehen da, damit sie bei der nächsten Aufräumrunde nicht als Löschkandidaten wirken. |
| **„Reminder gelten für die ganze Serie"** ([Calendar](./TODO.md#calendar-v1--siehe-adr-008))                                                      | Pro-Occurrence-Erinnerungen real gebraucht werden (Schema-Erweiterung)                                                                                                                                                                   |
| **„Recurrence-Editor bleibt für nicht-darstellbare Regeln verborgen"** ([Calendar](./TODO.md#calendar-v1--siehe-adr-008))                         | Regeln aus einem iCal-Import oder echten RRULE-Editor stammen — beides existiert nicht                                                                                                                                                   |
| **„Wiederholung lässt sich nicht ‚ab hier' ändern"** ([Calendar](./TODO.md#calendar-v1--siehe-adr-008))                                           | es ein Nutzersignal gibt; ohne das ist es Spekulation                                                                                                                                                                                    |
| **„Balken-Budget im Monatsraster ist zwei pro Tag"** ([Calendar](./TODO.md#calendar-v1--siehe-adr-008))                                           | drei parallele Spannen real vorkommen                                                                                                                                                                                                    |
| **„Erledigte Tasks sind nur 7 Tage weit sichtbar"** ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1))                                        | ein Verlauf-/Archiv-Screen entsteht (braucht eigene paginierte Query)                                                                                                                                                                    |
| **„`useCreateTask` ist nicht optimistisch"** ([Aufgaben](./TODO.md#aufgaben--tasks-daten-layer-v1))                                               | ein Screen die Latenz beim Anlegen spürbar macht                                                                                                                                                                                         |
| **„Ein verlorenes Broadcast ist stumm"** ([Realtime](./TODO.md#realtime-siehe-adr-030))                                                           | es serverseitige Beobachtbarkeit gibt (Alert auf die `WARNING`-Logzeile) oder einen Client-Heartbeat                                                                                                                                     |
| **„Ein geplanter Eintrag ohne sichtbares Rezept"** (2×: [Essen](./TODO.md#essen--meal-planner-daten-layer-v1) + [Dashboard](./TODO.md#dashboard)) | 🎨 ein Copy-Key existiert — praktisch unerreichbar, solange nur globale und eigene Rezepte verplant werden                                                                                                                               |
| **„Kein zweiter Versuch nach abgelehntem `setAuth()`"** ([Realtime](./TODO.md#realtime-siehe-adr-030))                                            | — **umsetzbar**, aber mit eigenem Testbedarf (wie oft, wie lange, was bei Unmount mittendrin). Kandidat für Block 8, sobald Block 5 einen Testpfad hat.                                                                                  |

---

## Die 🎨-Punkte, gebündelt zur Übergabe

Sie stehen oben bei ihrem Feature — hier nur als Index, damit ein Designer-Durchgang sie in **einem**
Rutsch abarbeiten kann statt in acht.

**Copy-Deck-Nachträge** ([docs/COPY.md](./COPY.md) — Kataloge tragen DE + EN bereits, das Deck
gehört dem Designer): die Kalender-Keys · `dash.resume.*` · `familie.invite*` · `color.*` ·
`parent.*` · `set.footer` · die Aufgaben-Keys (`hw.loadError`, `hw.empty.*`, `hw.error.*`,
`hw.create/edit/form/delete/type.*`, die Filter-Keys) · die Meal- und Rezept-Keys · die Undo-Keys
(`action.undo`, `cal.delete.undo*`, `hw.delete.undoTitle`, `cal.error.*`) · `cal.create/edit.error.saveFailed`.
Dazu die EN-Gegenlese von `sample.*` ([ADR-020](./decision-log.md)) und `dash.tomorrow.*`.

**Neue Keys, die ein Block braucht:** Titel-String für `showAlert` (→ [2.3](#23-toggle-fehler-ist-auf-web-unsichtbar))
· „Stattdessen kochen"? für den Meal-Hero-Tausch (→ [Block 6](#block-6--meal-plan-mutationen-der-größte-feature-unlock))
· `set.logoutConfirm` (Body-Text, auf Android heute sichtbar leer) · „Rezept nicht verfügbar" ·
`hw.dueRelative.today`/`tomorrow` (relative Wörter statt nacktem Datum — der gelöschte Mock konnte
das besser).

**Pattern-Docs, die vom Code abweichen** (`patterns/` ist off-limits, Abweichung ist freigegeben,
der Doc muss nachziehen): `homework.md` (kennt weder Filterleiste noch fünf Sektionen noch die
Formulare, beschreibt einen V1/V2-Umschalter, den es nicht gibt) · `meals.md` (drei Slot-Tabs statt
vier seit ADR-017, Kebab-Anatomie, Wochennavigation) · `calendar.md` (Legende zeigt `ha` ohne
`event_types`-Datensatz — der Swatch kann **nie** erscheinen; „Endet nach … Terminen"; Spannen-Balken)
· `onboarding.md` + `child-profile.md` (sechs Allergie-Chips, gerendert werden vierzehn) ·
**fehlt ganz:** `parent-profile.md`.

**Richtungsentscheidungen:** `dashboard-empty.md` — beschreibt einen Screen, den keine Route mountet
(Karte oder Screen?) · Account-Detail-Route hinter der Profil-Card (`/parent/[id]` oder eigener
Screen mit Abo/Konto löschen?) · der Personen-Filter der Avatar-Reihe · Fehlerzustände für Event-,
Meal- und Prep-Query (heute rendert alles **gar nichts** — ehrlich, aber stumm) · der Familienname,
der noch Sample-Data ist (braucht Ladezustand oder Copy-Variante ohne Namen) · das Undo-Fenster und
WCAG 2.2 SC 2.2.1 (fünf feste Sekunden sind nicht verlängerbar) · das ✕ am Undo-Toast (schließt,
ohne rückgängig zu machen **und** ohne vorzeitig zu committen — liest sich neben „Rückgängig"
plausibel als „Abbrechen") · die Radien-Benennung zwischen Design-CSS und Token-Skala
([ADR-024](./decision-log.md)).

---

## Pflege dieser Datei

- **`TODO.md` bleibt der Backlog.** Erledigtes wird dort **gelöscht** (CLAUDE.md → „Out-of-scope
  TODOs"), nicht abgehakt. Hier wird der Block als erledigt markiert.
- **Neue Funde** gehen zuerst nach `TODO.md`, dann in den passenden Block hier.
- **Verschiebt sich die Reihenfolge**, gehört der Grund dazu — diese Datei ist eine Begründung, keine
  Liste.
- **Die Blöcke 1–4 sind gegeneinander verschiebbar**, 5–7 nicht: Block 6 sollte nach Block 5 kommen
  (Testpfad für neue Screens), Block 7 nach Block 1 (dasselbe Override-Modell).
