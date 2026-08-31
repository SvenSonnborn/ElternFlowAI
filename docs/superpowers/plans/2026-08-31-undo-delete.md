# Rückgängig nach dem Löschen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gelöschte Termine und Aufgaben verschwinden sofort aus jeder Liste, lassen sich aber fünf Sekunden lang über einen Toast zurückholen — weil die Delete-Mutation in dieser Zeit noch gar nicht gelaufen ist.

**Architecture:** Ein RN-freier Zustand-Store (`features/shared/pendingDeletes.ts`) hält, was „im Fenster" ist, und feuert nach Ablauf die eigentliche Mutation. Die beiden Listen-Hooks `useFamilyTasks` und `useFamilyEvents` filtern heraus, was im Store steht — Rückgängig entfernt nur den Eintrag, es gibt keinen Cache-Rollback. Ein Hook in `app-sections/shared` verbindet Store und Toast.

**Tech Stack:** Zustand · TanStack Query · react-i18next · React Native `Animated` · `bun test`

**Spec:** [docs/superpowers/specs/2026-08-31-undo-delete-design.md](../specs/2026-08-31-undo-delete-design.md) — der Plan argumentiert aus der Spec; beide gehören zusammen gelesen.

**Branch:** `feat/undo-delete`

## Global Constraints

Diese Regeln gelten für **jede** Task, ohne dass sie dort wiederholt werden:

- **Sprache:** Alle UI-Strings kommen aus den i18n-Katalogen (`features/i18n/locales/de.json` · `en.json`). DE ist kanonisch, EN spiegelt. **Immer Du, nie Sie.** Nie ein String im JSX.
- **Handoff-Bundle ist tabu:** `design-system/{colors,typography,spacing,themes,components,index}.ts`, `docs/{HANDOFF,COPY,ICONS,README}.md`, `patterns/*.md` werden **nicht** editiert. `DS.components.toast` wird nur _gelesen_.
- **Docstrings:** Jede neue exportierte Funktion, Komponente, jeder Hook und jedes neue Modul bekommt einen JSDoc-Block **im selben Commit**. Inhalt ist das Nicht-Offensichtliche — warum es so gebaut ist, welcher Grenzfall die Form bestimmt hat, welche Decision der Spec dahintersteht. Was der Name schon sagt, wird nicht wiederholt.
- **Trefferflächen ≥ 44×44.**
- **Commits:** Conventional-Commits-Präfix mit Scope. **Niemals** ein `Co-Authored-By: Claude`-Trailer. **Niemals** `--no-verify` — die `lint-staged`-Pre-Commit-Hooks laufen immer mit.
- **Kommentare und Doku auf Deutsch**, passend zum Bestand in den berührten Dateien.
- **Vor jedem Commit grün:** `bun run typecheck` und `bun lint`.
- **TODO-Disziplin:** [docs/TODO.md](../../TODO.md) wird in Task 10 abgeglichen, nicht nebenbei.

Konstanten, die mehrfach vorkommen und exakt so lauten müssen:

| Wert                                       | Bedeutung                           |
| ------------------------------------------ | ----------------------------------- |
| `UNDO_WINDOW_MS = 5000`                    | Fensterlänge (Decision 10)          |
| `variant: "success"`, `position: "bottom"` | Toast des Undo-Falls (Decision 11)  |
| `kind: "task"` / `kind: "event"`           | Diskriminator im Store (Decision 2) |

---

## Dateiübersicht

**Neu**

| Datei                                       | Verantwortung                                      |
| ------------------------------------------- | -------------------------------------------------- |
| `features/shared/pendingDeletes.ts`         | Store, Timer, `flush`. Kein `react-native`-Import. |
| `features/shared/pendingDeletes.test.ts`    | Store-Verhalten                                    |
| `features/shared/useFlushPendingDeletes.ts` | `AppState`-Listener → `flush()`                    |
| `features/calendar/pendingDeletes.ts`       | Scope-Prädikat + Selektor + Listenfilter           |
| `features/calendar/pendingDeletes.test.ts`  | Scope-Prädikat                                     |
| `features/tasks/pendingDeletes.ts`          | Selektor (Set von Task-Ids)                        |
| `app-sections/shared/useUndoableDelete.ts`  | Store + Toast verbinden                            |

**Geändert**

`features/shared/index.ts` · `features/calendar/{hooks,mutations,index}.ts` · `features/tasks/{queries,index}.ts` · `app-sections/shared/{Toast.tsx,index.ts}` · `app-sections/event/EventDetailScreen.tsx` · `app-sections/task/TaskEditScreen.tsx` · `app/_layout.tsx` · `features/i18n/locales/{de,en}.json` · `docs/{decision-log,TODO}.md` · `CLAUDE.md`

---

## Task 1: Der Pending-Delete-Store

**Files:**

- Create: `features/shared/pendingDeletes.ts`
- Test: `features/shared/pendingDeletes.test.ts`
- Modify: `features/shared/index.ts`

**Interfaces:**

- Consumes: nichts (erste Task)
- Produces:
  - `type PendingDeleteKind = "task" | "event"`
  - `const UNDO_WINDOW_MS: 5000`
  - `interface PendingDelete { id: string; kind: PendingDeleteKind; target: unknown; run: () => Promise<void> }`
  - `usePendingDeleteStore` — Zustand-Store mit `entries`, `schedule(kind, target, run, delayMs?) => string`, `undo(id) => void`, `flush() => void`
  - `usePendingDeletes(kind: PendingDeleteKind): PendingDelete[]`
  - `shouldFlushOnStateChange(next: string): boolean`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`features/shared/pendingDeletes.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test";

import { shouldFlushOnStateChange, usePendingDeleteStore } from "./pendingDeletes";

/** Der Store lebt auf Modulebene — jeder Test räumt hinter sich auf. */
afterEach(() => {
  usePendingDeleteStore.setState({ entries: [] });
});

function store() {
  return usePendingDeleteStore.getState();
}

const settle = () => new Promise((r) => setTimeout(r, 40));

describe("schedule", () => {
  test("legt einen Eintrag an und gibt seine Id zurück", () => {
    const id = store().schedule("task", { taskId: "t1" }, async () => {}, 10_000);
    expect(id).toBeTruthy();
    expect(store().entries).toHaveLength(1);
    expect(store().entries[0]).toMatchObject({ id, kind: "task", target: { taskId: "t1" } });
    store().undo(id);
  });

  test("führt `run` nach Ablauf genau einmal aus", async () => {
    let calls = 0;
    store().schedule(
      "task",
      { taskId: "t1" },
      async () => {
        calls += 1;
      },
      10,
    );
    await settle();
    expect(calls).toBe(1);
    expect(store().entries).toHaveLength(0);
  });

  test("zwei offene Löschungen stören einander nicht", async () => {
    const done: string[] = [];
    store().schedule(
      "task",
      { taskId: "a" },
      async () => {
        done.push("a");
      },
      10,
    );
    const second = store().schedule(
      "event",
      { eventId: "b" },
      async () => {
        done.push("b");
      },
      10,
    );
    expect(store().entries).toHaveLength(2);
    await settle();
    expect(done.sort()).toEqual(["a", "b"]);
    expect(second).toBeTruthy();
  });
});

describe("undo", () => {
  test("entfernt den Eintrag und verhindert, dass `run` je läuft", async () => {
    let calls = 0;
    const id = store().schedule(
      "task",
      { taskId: "t1" },
      async () => {
        calls += 1;
      },
      10,
    );
    store().undo(id);
    expect(store().entries).toHaveLength(0);
    await settle();
    expect(calls).toBe(0);
  });
});

describe("commit", () => {
  test("der Eintrag verschwindet erst, nachdem `run` gesettled ist", async () => {
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    store().schedule("task", { taskId: "t1" }, () => blocked, 10);
    await new Promise((r) => setTimeout(r, 30));
    // `run` läuft, ist aber noch nicht durch — das Item bleibt versteckt.
    expect(store().entries).toHaveLength(1);
    release();
    await settle();
    expect(store().entries).toHaveLength(0);
  });

  test("ein fehlgeschlagenes `run` hinterlässt keinen Zombie", async () => {
    store().schedule("task", { taskId: "t1" }, () => Promise.reject(new Error("nope")), 10);
    await settle();
    expect(store().entries).toHaveLength(0);
  });
});

describe("flush", () => {
  test("führt alle offenen Löschungen sofort aus und leert die Liste", async () => {
    const done: string[] = [];
    store().schedule(
      "task",
      { taskId: "a" },
      async () => {
        done.push("a");
      },
      10_000,
    );
    store().schedule(
      "event",
      { eventId: "b" },
      async () => {
        done.push("b");
      },
      10_000,
    );
    store().flush();
    await settle();
    expect(done.sort()).toEqual(["a", "b"]);
    expect(store().entries).toHaveLength(0);
  });

  test("führt dieselbe Löschung auch bei doppeltem Aufruf nur einmal aus", async () => {
    let calls = 0;
    store().schedule(
      "task",
      { taskId: "a" },
      async () => {
        calls += 1;
      },
      10_000,
    );
    store().flush();
    store().flush();
    await settle();
    expect(calls).toBe(1);
  });
});

describe("shouldFlushOnStateChange", () => {
  test("nur `background` schließt das Fenster", () => {
    expect(shouldFlushOnStateChange("background")).toBe(true);
  });

  test("`inactive` nicht — das ist auf iOS auch das Kontrollzentrum", () => {
    expect(shouldFlushOnStateChange("inactive")).toBe(false);
    expect(shouldFlushOnStateChange("active")).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/shared/pendingDeletes.test.ts`
Expected: FAIL — `Cannot find module './pendingDeletes'`

- [ ] **Step 3: Den Store implementieren**

`features/shared/pendingDeletes.ts`:

```ts
import { useMemo } from "react";
import { create } from "zustand";

/**
 * Die Warteschlange der Löschungen, die noch rückgängig gemacht werden können.
 *
 * Der Kniff des ganzen Features steht in diesem Modul: eine Löschung wird
 * nicht ausgeführt und später zurückgenommen, sondern **verzögert**. Das Item
 * ist in der Zwischenzeit nur *versteckt* — die beiden Listen-Hooks filtern es
 * heraus —, und „Rückgängig" heißt schlicht, den Eintrag zu entfernen, bevor
 * der Timer feuert. Deshalb gibt es hier keinen Rollback: es gibt nichts
 * zurückzurollen (siehe Decision 1 der Spec).
 *
 * Bewusst **ohne `react-native`-Import**, wie `toastStore.ts` — so laufen die
 * Tests unter Bun, ohne sich auf die Mocks aus `bun.test.preload.ts` zu
 * verlassen. Der `AppState`-Teil lebt in `useFlushPendingDeletes.ts`.
 */

export type PendingDeleteKind = "task" | "event";

/** Wie lange „Rückgängig" erreichbar bleibt. Siehe Decision 10 der Spec. */
export const UNDO_WINDOW_MS = 5000;

export interface PendingDelete {
  id: string;
  kind: PendingDeleteKind;
  /**
   * Vom besitzenden Feature interpretiert — `features/shared` darf nichts aus
   * `features/calendar` importieren, ohne die Abhängigkeitsrichtung
   * umzudrehen. `kind` ist der Diskriminator, der den einen Cast pro Feature
   * absichert (Decision 2 der Spec).
   */
  target: unknown;
  /** Die eigentliche Mutation. Läuft genau einmal — oder nie. */
  run: () => Promise<void>;
}

interface PendingDeleteState {
  entries: PendingDelete[];
  schedule: (
    kind: PendingDeleteKind,
    target: unknown,
    run: () => Promise<void>,
    delayMs?: number,
  ) => string;
  undo: (id: string) => void;
  flush: () => void;
}

// Timer und Laufmarker gehören nicht in den Store: sie lösen kein Rendern aus,
// und ein `setTimeout`-Handle im State würde bei jedem Abonnenten als Änderung
// durchschlagen.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Set<string>();

let sequence = 0;

function clearTimer(id: string): void {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
}

function remove(id: string): void {
  usePendingDeleteStore.setState((state) => ({
    entries: state.entries.filter((entry) => entry.id !== id),
  }));
}

/**
 * Führt eine Löschung aus und gibt das Item danach wieder frei — **auch wenn
 * die Mutation wirft**. Ein Eintrag, der nach einem Fehler stehen bliebe,
 * würde das Item für den Rest der Sitzung unsichtbar halten, obwohl es auf dem
 * Server noch existiert.
 *
 * `running` schützt vor Doppelausführung: `flush()` darf mehrfach kommen (zwei
 * schnelle App-Wechsel), während `run` noch läuft.
 */
async function commit(id: string): Promise<void> {
  if (running.has(id)) return;
  const entry = usePendingDeleteStore.getState().entries.find((e) => e.id === id);
  if (!entry) return;

  clearTimer(id);
  running.add(id);
  try {
    await entry.run();
  } finally {
    running.delete(id);
    remove(id);
  }
}

export const usePendingDeleteStore = create<PendingDeleteState>((set, get) => ({
  entries: [],

  schedule: (kind, target, run, delayMs = UNDO_WINDOW_MS) => {
    sequence += 1;
    const id = `pending-delete-${sequence}`;
    set((state) => ({ entries: [...state.entries, { id, kind, target, run }] }));
    timers.set(
      id,
      setTimeout(() => {
        void commit(id);
      }, delayMs),
    );
    return id;
  },

  undo: (id) => {
    clearTimer(id);
    remove(id);
  },

  flush: () => {
    for (const entry of get().entries) {
      void commit(entry.id);
    }
  },
}));

/**
 * Die offenen Löschungen eines Features, referenzstabil solange sich nichts
 * ändert — die Listen-Hooks hängen sie an `useMemo`-Abhängigkeiten, ein bei
 * jedem Render neues Array würde dort die Memoisierung wertlos machen.
 */
export function usePendingDeletes(kind: PendingDeleteKind): PendingDelete[] {
  const entries = usePendingDeleteStore((state) => state.entries);
  return useMemo(() => entries.filter((entry) => entry.kind === kind), [entries, kind]);
}

/**
 * Ob ein `AppState`-Wechsel das Undo-Fenster schließen soll.
 *
 * Nur `background`. Auf iOS tritt `inactive` auch beim Herunterziehen des
 * Kontrollzentrums, bei einer Anruf-Einblendung und in der App-Switcher-
 * Vorschau auf — dort zu committen nähme dem Nutzer das Fenster weg, ohne dass
 * er die App verlassen hat (Decision 4 der Spec).
 */
export function shouldFlushOnStateChange(next: string): boolean {
  return next === "background";
}
```

- [ ] **Step 4: Test laufen lassen und grün sehen**

Run: `bun test features/shared/pendingDeletes.test.ts`
Expected: PASS, 10 Tests

- [ ] **Step 5: Barrel erweitern**

`features/shared/index.ts` — ergänze, alphabetisch einsortiert:

```ts
export {
  shouldFlushOnStateChange,
  UNDO_WINDOW_MS,
  usePendingDeletes,
  usePendingDeleteStore,
  type PendingDelete,
  type PendingDeleteKind,
} from "./pendingDeletes";
```

- [ ] **Step 6: Typecheck, Lint, Commit**

```bash
bun run typecheck && bun lint
git add features/shared/pendingDeletes.ts features/shared/pendingDeletes.test.ts features/shared/index.ts
git commit -m "feat(shared): Store für verzögerte Löschungen mit Undo-Fenster"
```

---

## Task 2: Fenster beim Wechsel in den Hintergrund schließen

**Files:**

- Create: `features/shared/useFlushPendingDeletes.ts`
- Modify: `features/shared/index.ts`
- Modify: `app/_layout.tsx`

**Interfaces:**

- Consumes: `usePendingDeleteStore`, `shouldFlushOnStateChange` (Task 1)
- Produces: `useFlushPendingDeletes(): void`

Kein eigener Unit-Test: die Entscheidung, _wann_ geflusht wird, ist als `shouldFlushOnStateChange` schon in Task 1 getestet; hier bleiben drei Zeilen Verdrahtung. Verifikation über `typecheck` + `lint` und die Sichtprüfung in Task 9.

- [ ] **Step 1: Den Hook schreiben**

`features/shared/useFlushPendingDeletes.ts`:

```ts
import { useEffect } from "react";
import { AppState } from "react-native";

import { shouldFlushOnStateChange, usePendingDeleteStore } from "./pendingDeletes";

/**
 * Schließt offene Undo-Fenster, wenn die App in den Hintergrund geht.
 *
 * Das macht das Löschen deterministisch: entweder der Nutzer drückt innerhalb
 * des Fensters „Rückgängig", oder die Löschung passiert wirklich. Ohne diesen
 * Listener verschluckte ein App-Kill im Fenster die Mutation — das Item wäre
 * lokal weg und käme beim nächsten Refetch wieder, ohne dass jemand etwas
 * getan hätte (Decision 4 der Spec).
 *
 * Eigene Datei, weil sie `react-native` importiert und `pendingDeletes.ts` das
 * nicht tun soll. Einmal im Root-Layout rufen.
 */
export function useFlushPendingDeletes(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (shouldFlushOnStateChange(next)) {
        usePendingDeleteStore.getState().flush();
      }
    });
    return () => subscription.remove();
  }, []);
}
```

- [ ] **Step 2: Barrel erweitern**

`features/shared/index.ts`:

```ts
export { useFlushPendingDeletes } from "./useFlushPendingDeletes";
```

- [ ] **Step 3: Im Root-Layout rufen**

`app/_layout.tsx` — im Komponentenrumpf, der die Provider rendert (dort, wo bereits Hooks stehen). Import ergänzen:

```ts
import { useFlushPendingDeletes } from "@/features/shared";
```

und im Rumpf, vor dem `return`:

```ts
// Offene Undo-Fenster schließen, wenn die App in den Hintergrund geht.
useFlushPendingDeletes();
```

- [ ] **Step 4: Typecheck, Lint, Commit**

```bash
bun run typecheck && bun lint
git add features/shared/useFlushPendingDeletes.ts features/shared/index.ts app/_layout.tsx
git commit -m "feat(shared): offene Löschungen beim Hintergrundwechsel abschließen"
```

---

## Task 3: Toast — Aktion schließt, Timer-Leiste läuft

**Files:**

- Modify: `app-sections/shared/Toast.tsx`

**Interfaces:**

- Consumes: `DS.components.toast.progressBar` (`{ height: 2.5, opacity: 0.35 }`)
- Produces: keine neue API — geändertes Verhalten der bestehenden `Toast`-Komponente

Zwei Änderungen, beide aus der Spec (Decisions 8 und 9). Kein Unit-Test: `Toast.tsx` ist eine RN-Komponente mit Animation, die Suite dafür wäre `jest-expo` statt `bun test`. Verifikation ist die Web-Sichtprüfung in Step 5.

- [ ] **Step 1: Aktionsdruck schließt den Toast**

In `Toast.tsx`, im `entry.action`-Block (aktuell `onPress={entry.action.onPress}`):

```tsx
            onPress={() => {
              entry.action?.onPress();
              // Nach einer Aktion hat der Toast seinen Zweck erfüllt. `close()`
              // statt `dismiss()`, damit das Ausblenden läuft. Es gibt keine
              // Aktion, nach der ein Stehenbleiben richtig wäre — deshalb
              // Standardverhalten und kein Flag (Decision 8 der Spec).
              close();
            }}
```

- [ ] **Step 2: Die Timer-Leiste ergänzen**

Neben `progress` einen zweiten Animated-Wert anlegen (bei den übrigen `useState`-Zeilen):

```tsx
// Der Countdown der Timer-Leiste, getrennt von `progress`: der eine ist das
// Ein-/Ausblenden, der andere läuft über die volle Standzeit.
const [countdown] = useState(() => new Animated.Value(1));
```

Und einen Effekt, direkt nach dem Auto-Dismiss-Effekt:

```tsx
// Die Leiste läuft nur, wenn der Toast wirklich abläuft — und nicht bei
// „Bewegung reduzieren", wo sie ersatzlos entfällt statt zu springen.
useEffect(() => {
  if (entry.durationMs == null || reduceMotion !== false) return;
  countdown.setValue(1);
  Animated.timing(countdown, {
    toValue: 0,
    duration: entry.durationMs,
    easing: Easing.linear,
    useNativeDriver: true,
  }).start();
}, [countdown, entry.durationMs, reduceMotion]);
```

Am Ende der äußeren Toast-View — als letztes Kind, nach dem Schließen-Knopf, damit sie auf der Unterkante sitzt. Kein Umbau am Render-Baum nötig: der Container trägt bereits `overflow: "hidden"` (dieselbe Zeile, an der schon die Akzent-Schiene hängt), die Leiste wird also von den 18 px Radius sauber beschnitten.

```tsx
{
  entry.durationMs != null && reduceMotion === false ? (
    <Animated.View
      // Rein dekorativ: die Information steht schon in Titel und Aktion.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: spec.progressBar.height,
        backgroundColor: accent,
        opacity: spec.progressBar.opacity,
        // `scaleX` skaliert in React Native sonst um die Mitte — die
        // Leiste liefe von beiden Seiten nach innen zu statt von rechts
        // nach links leer. `transformOrigin` gibt es seit RN 0.74, das
        // Repo steht auf 0.86 (Decision 9 der Spec).
        transformOrigin: "left",
        transform: [{ scaleX: countdown }],
      }}
    />
  ) : null;
}
```

- [ ] **Step 3: Typecheck und Lint**

Run: `bun run typecheck && bun lint`
Expected: beide grün. `transformOrigin` ist in `react-native/Libraries/StyleSheet/StyleSheetTypes.d.ts:296` deklariert und typecheckt ohne Zutun — sollte hier trotzdem etwas rot werden, **kein** `as`-Cast darüberlegen (siehe CLAUDE.md, Caveat zu Casts), sondern melden.

- [ ] **Step 4: Bestehende Toast-Tests laufen lassen**

Run: `bun test app-sections/shared/toastStore.test.ts`
Expected: PASS — der Store ist unverändert, das ist die Absicherung dagegen, dass Step 1/2 versehentlich an ihm gedreht haben.

- [ ] **Step 5: Sichtprüfung im Web**

Baue einen **temporären** Auslöser in `app-sections/auth/LoginScreen.tsx` (dem einzigen Screen ohne Session-Zwang) — derselbe Weg, den ADR-025 für die Toast-Komponente gegangen ist:

```tsx
const toast = useToast();
// TEMPORÄR — vor dem Commit wieder entfernen.
const probe = () =>
  toast.show({
    title: "Termin gelöscht",
    message: "Bens Fußballtraining · ganze Serie",
    variant: "success",
    position: "bottom",
    durationMs: 5000,
    action: { label: "Rückgängig", onPress: () => console.log("undo") },
  });
```

Verdrahte ihn an einen `Pressable` im Screen, dann:

```bash
bun run web
```

Prüfe: (a) die Leiste läuft in 5 s von voll auf leer, linksbündig; (b) „Rückgängig" schließt den Toast mit Ausblendung; (c) das Ganze in Light **und** Dark.

- [ ] **Step 6: Auslöser zurücknehmen und committen**

```bash
git diff -- app-sections/auth/LoginScreen.tsx   # muss leer sein
bun run typecheck && bun lint
git add app-sections/shared/Toast.tsx
git commit -m "feat(shared): Toast schließt nach der Aktion und zeigt seinen Countdown"
```

`git diff` auf dem Login-Screen **muss leer sein** — der Auslöser gehört nicht in den Commit.

---

## Task 4: Das Scope-Prädikat des Kalenders

**Files:**

- Create: `features/calendar/pendingDeletes.ts`
- Test: `features/calendar/pendingDeletes.test.ts`

**Interfaces:**

- Consumes: `usePendingDeletes` (Task 1), `EditScope` aus `./recurrence`, `CalendarOccurrence` aus `./types`
- Produces:
  - `interface PendingEventDelete { eventId: string; occurrenceDate: string; scope: EditScope }`
  - `hidesOccurrence(pending: PendingEventDelete, occurrence: { eventId: string; occurrenceDate: string }): boolean`
  - `withoutPendingDeletes(occurrences: CalendarOccurrence[], pending: readonly PendingEventDelete[]): CalendarOccurrence[]`
  - `usePendingEventDeletes(): PendingEventDelete[]`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`features/calendar/pendingDeletes.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { hidesOccurrence, type PendingEventDelete } from "./pendingDeletes";

function pending(partial: Partial<PendingEventDelete> = {}): PendingEventDelete {
  return { eventId: "e1", occurrenceDate: "2026-09-10", scope: "this", ...partial };
}

function occ(occurrenceDate: string, eventId = "e1") {
  return { eventId, occurrenceDate };
}

describe("scope 'this'", () => {
  test("verdeckt genau die eine Occurrence", () => {
    expect(hidesOccurrence(pending(), occ("2026-09-10"))).toBe(true);
  });

  test("lässt die Nachbarn derselben Serie stehen", () => {
    expect(hidesOccurrence(pending(), occ("2026-09-09"))).toBe(false);
    expect(hidesOccurrence(pending(), occ("2026-09-11"))).toBe(false);
  });
});

describe("scope 'forward'", () => {
  const p = pending({ scope: "forward" });

  test("verdeckt den Stichtag selbst", () => {
    expect(hidesOccurrence(p, occ("2026-09-10"))).toBe(true);
  });

  test("verdeckt alles danach", () => {
    expect(hidesOccurrence(p, occ("2026-09-11"))).toBe(true);
    expect(hidesOccurrence(p, occ("2026-10-01"))).toBe(true);
    expect(hidesOccurrence(p, occ("2027-01-02"))).toBe(true);
  });

  test("lässt alles davor stehen", () => {
    expect(hidesOccurrence(p, occ("2026-09-09"))).toBe(false);
    expect(hidesOccurrence(p, occ("2026-08-31"))).toBe(false);
    expect(hidesOccurrence(p, occ("2025-12-31"))).toBe(false);
  });
});

describe("scope 'all'", () => {
  const p = pending({ scope: "all" });

  test("verdeckt jede Occurrence des Events", () => {
    expect(hidesOccurrence(p, occ("2020-01-01"))).toBe(true);
    expect(hidesOccurrence(p, occ("2026-09-10"))).toBe(true);
    expect(hidesOccurrence(p, occ("2030-12-31"))).toBe(true);
  });
});

describe("Fremde Events", () => {
  test("kein Scope greift auf ein anderes Event über", () => {
    for (const scope of ["this", "forward", "all"] as const) {
      expect(hidesOccurrence(pending({ scope }), occ("2026-09-10", "e2"))).toBe(false);
    }
  });
});

describe("Einzeltermin", () => {
  test("alle drei Scopes verdecken die eine Occurrence", () => {
    for (const scope of ["this", "forward", "all"] as const) {
      expect(hidesOccurrence(pending({ scope }), occ("2026-09-10"))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `bun test features/calendar/pendingDeletes.test.ts`
Expected: FAIL — `Cannot find module './pendingDeletes'`

- [ ] **Step 3: Das Modul implementieren**

`features/calendar/pendingDeletes.ts`:

```ts
import { useMemo } from "react";

import { usePendingDeletes } from "@/features/shared";

import type { EditScope } from "./recurrence";
import type { CalendarOccurrence } from "./types";

/**
 * Welche Occurrences eine noch nicht ausgeführte Löschung verdeckt.
 *
 * Die drei Fälle sind dieselben, die `applyDeleteScope` serverseitig
 * unterscheidet — nur dass hier nichts geschrieben wird, sondern nur
 * ausgeblendet, solange das Undo-Fenster offen ist (Decision 1 der Spec).
 */
export interface PendingEventDelete {
  eventId: string;
  /** `YYYY-MM-DD` der Occurrence, von der aus gelöscht wurde. */
  occurrenceDate: string;
  scope: EditScope;
}

/**
 * Reiner Vergleich, damit alle drei Scopes ohne React prüfbar sind.
 *
 * Der Datumsvergleich läuft direkt auf den Strings: `YYYY-MM-DD` ist
 * lexikographisch genau chronologisch, ein `Date` wäre hier nur eine
 * Zeitzonenfalle. `forward` schließt den Stichtag **ein** — gelöscht wird „ab
 * diesem Termin", nicht „nach ihm".
 *
 * Ein Einzeltermin braucht keinen Sonderfall: er hat nur eine Occurrence, auf
 * die alle drei Scopes gleich zutreffen.
 */
export function hidesOccurrence(
  pending: PendingEventDelete,
  occurrence: { eventId: string; occurrenceDate: string },
): boolean {
  if (pending.eventId !== occurrence.eventId) return false;
  switch (pending.scope) {
    case "this":
      return pending.occurrenceDate === occurrence.occurrenceDate;
    case "forward":
      return occurrence.occurrenceDate >= pending.occurrenceDate;
    case "all":
      return true;
  }
}

/**
 * Filtert die offenen Löschungen aus einer expandierten Liste.
 *
 * Gibt im Normalfall — nichts offen — die Eingabe **unverändert** zurück, statt
 * eine Kopie. Das spart im weitaus häufigsten Fall einen Durchlauf und eine
 * Allokation; für die Referenzstabilität von `useFamilyEvents.data` tut es
 * nichts, denn der Aufruf steht innerhalb desselben `useMemo`, und
 * `expandEvents` baut ohnehin bei jedem Lauf ein frisches Array.
 */
export function withoutPendingDeletes(
  occurrences: CalendarOccurrence[],
  pending: readonly PendingEventDelete[],
): CalendarOccurrence[] {
  if (pending.length === 0) return occurrences;
  return occurrences.filter((o) => !pending.some((p) => hidesOccurrence(p, o)));
}

/**
 * Die offenen Termin-Löschungen aus dem geteilten Store.
 *
 * Hier steht der **einzige** Cast dieses Features: der Store hält `target` als
 * `unknown`, weil `features/shared` nichts aus `features/calendar` importieren
 * darf, ohne die Abhängigkeitsrichtung umzudrehen. `kind: "event"` ist der
 * Diskriminator, der ihn absichert — nur `useUndoableDelete`-Aufrufe mit
 * diesem `kind` legen hier etwas ab (Decision 2 der Spec).
 */
export function usePendingEventDeletes(): PendingEventDelete[] {
  const entries = usePendingDeletes("event");
  return useMemo(() => entries.map((entry) => entry.target as PendingEventDelete), [entries]);
}
```

- [ ] **Step 4: Test laufen lassen und grün sehen**

Run: `bun test features/calendar/pendingDeletes.test.ts`
Expected: PASS, 8 Tests

- [ ] **Step 5: Typecheck, Lint, Commit**

```bash
bun run typecheck && bun lint
git add features/calendar/pendingDeletes.ts features/calendar/pendingDeletes.test.ts
git commit -m "feat(calendar): Prädikat für ausgeblendete Occurrences im Undo-Fenster"
```

---

## Task 5: Aufgaben im Fenster ausblenden

**Files:**

- Create: `features/tasks/pendingDeletes.ts`
- Modify: `features/tasks/queries.ts`
- Modify: `features/tasks/index.ts`

**Interfaces:**

- Consumes: `usePendingDeletes` (Task 1)
- Produces: `interface PendingTaskDelete { taskId: string }`, `usePendingTaskIds(): ReadonlySet<string>`

- [ ] **Step 1: Den Selektor anlegen**

`features/tasks/pendingDeletes.ts`:

```ts
import { useMemo } from "react";

import { usePendingDeletes } from "@/features/shared";

/** Was eine offene Aufgaben-Löschung im geteilten Store hinterlegt. */
export interface PendingTaskDelete {
  taskId: string;
}

/**
 * Die Ids der Aufgaben, die gerade im Undo-Fenster stehen.
 *
 * Hier steht der **einzige** Cast dieses Features — Begründung wie bei
 * `features/calendar/pendingDeletes.ts`: `kind: "task"` ist der Diskriminator,
 * der ihn trägt (Decision 2 der Spec).
 */
export function usePendingTaskIds(): ReadonlySet<string> {
  const entries = usePendingDeletes("task");
  return useMemo(
    () => new Set(entries.map((entry) => (entry.target as PendingTaskDelete).taskId)),
    [entries],
  );
}
```

- [ ] **Step 2: Den Filter in `useFamilyTasks` einbauen**

`features/tasks/queries.ts` — Imports ergänzen:

```ts
import { usePendingTaskIds } from "./pendingDeletes";
```

Über `useFamilyTasks` eine stabile Leerliste anlegen:

```ts
/** Referenzstabil, damit `data` nicht bei jedem Render ein neues Array ist. */
const NO_TASKS: TaskWithType[] = [];
```

Und den Rumpf von `useFamilyTasks` umbauen — nur der `data`-Teil ändert sich:

```ts
const pendingIds = usePendingTaskIds();

const data = useMemo(() => {
  const rows = query.data ?? NO_TASKS;
  // Kein Cache-Eingriff: die Zeile ist noch da, sie wird nur nicht gezeigt,
  // solange „Rückgängig" erreichbar ist (Decision 1 der Spec). Deshalb greift
  // der Filter auch für `useTask` — der ist ein Selektor auf diese Liste, und
  // der `hydrated`-Guard im Edit-Screen fängt das bereits ab.
  if (pendingIds.size === 0) return rows;
  return rows.filter((row) => !pendingIds.has(row.id));
}, [query.data, pendingIds]);

return {
  data,
  isLoading: query.isLoading,
  isRefetching: query.isRefetching,
  error: query.error,
  refetch: () => void query.refetch(),
};
```

- [ ] **Step 3: Barrel erweitern**

`features/tasks/index.ts`:

```ts
export { usePendingTaskIds, type PendingTaskDelete } from "./pendingDeletes";
```

- [ ] **Step 4: Bestehende Task-Suites laufen lassen**

Run: `bun test features/tasks`
Expected: PASS — Regressionsschutz für den Umbau von `useFamilyTasks`.

- [ ] **Step 5: Typecheck, Lint, Commit**

```bash
bun run typecheck && bun lint
git add features/tasks/pendingDeletes.ts features/tasks/queries.ts features/tasks/index.ts
git commit -m "feat(tasks): Aufgaben im Undo-Fenster aus der Liste ausblenden"
```

---

## Task 6: Termine im Fenster ausblenden

**Files:**

- Modify: `features/calendar/hooks.ts`
- Modify: `features/calendar/mutations.ts`
- Modify: `features/calendar/index.ts`

**Interfaces:**

- Consumes: `withoutPendingDeletes`, `usePendingEventDeletes` (Task 4)
- Produces: keine neue API — `useFamilyEvents` filtert, `useDeleteEvent` gibt sein Invalidate zurück

- [ ] **Step 1: Den Filter in `useFamilyEvents` einbauen**

`features/calendar/hooks.ts` — Import ergänzen:

```ts
import { usePendingEventDeletes, withoutPendingDeletes } from "./pendingDeletes";
```

Stabile Leerliste über der Datei:

```ts
/** Referenzstabil, damit `data` nicht bei jedem Render ein neues Array ist. */
const NO_OCCURRENCES: CalendarOccurrence[] = [];
```

Den `data`-`useMemo` in `useFamilyEvents` ersetzen:

```ts
const pending = usePendingEventDeletes();

const data = useMemo(() => {
  if (!query.data) return NO_OCCURRENCES;
  // Nach dem Expandieren gefiltert, nicht davor: die offenen Löschungen sind
  // pro Occurrence gedacht („nur dieser Termin"), die gecachten Zeilen sind
  // Master-Zeilen (Decision 1 der Spec).
  return withoutPendingDeletes(expandEvents(query.data, rangeStart, rangeEnd, theme), pending);
}, [query.data, rangeStart, rangeEnd, theme, pending]);
```

- [ ] **Step 2: `useDeleteEvent` sein Invalidate zurückgeben lassen**

`features/calendar/mutations.ts` — in `useDeleteEvent` (**nur dort**, `useUpdateEvent` bleibt unverändert):

```ts
    // Zurückgegeben statt `void`: der Pending-Delete-Store gibt das Item erst
    // frei, wenn `mutateAsync` durch ist. Ohne das Warten blitzte es für einen
    // Frame zurück, bevor der Refetch es erneut entfernt.
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKeys.all }),
```

- [ ] **Step 3: Barrel erweitern**

`features/calendar/index.ts`:

```ts
export {
  hidesOccurrence,
  usePendingEventDeletes,
  withoutPendingDeletes,
  type PendingEventDelete,
} from "./pendingDeletes";
```

- [ ] **Step 4: Bestehende Kalender-Suites laufen lassen**

Run: `bun test features/calendar`
Expected: PASS

- [ ] **Step 5: Typecheck, Lint, Commit**

```bash
bun run typecheck && bun lint
git add features/calendar/hooks.ts features/calendar/mutations.ts features/calendar/index.ts
git commit -m "feat(calendar): Termine im Undo-Fenster aus der Liste ausblenden"
```

---

## Task 7: Copy und der Verbindungs-Hook

**Files:**

- Modify: `features/i18n/locales/de.json`
- Modify: `features/i18n/locales/en.json`
- Create: `app-sections/shared/useUndoableDelete.ts`
- Modify: `app-sections/shared/index.ts`

**Interfaces:**

- Consumes: `usePendingDeleteStore`, `UNDO_WINDOW_MS`, `PendingDeleteKind` (Task 1); `useToast` (Bestand)
- Produces: `interface UndoableDeleteArgs`, `useUndoableDelete(): (args: UndoableDeleteArgs) => void`

- [ ] **Step 1: Die deutschen Keys setzen**

`features/i18n/locales/de.json`:

In `action` ergänzen:

```json
    "undo": "Rückgängig"
```

`cal.delete` wird zu:

```json
    "delete": {
      "confirmTitle": "Termin löschen?",
      "confirmBody": "Du kannst das direkt danach rückgängig machen.",
      "confirmOk": "Löschen",
      "deleting": "Lösche…",
      "error": "Löschen fehlgeschlagen",
      "undoTitle": "Termin gelöscht",
      "undoScopeForward": "ab {{date}}",
      "undoScopeAll": "ganze Serie"
    }
```

`hw.delete` wird zu:

```json
    "delete": {
      "confirmTitle": "Aufgabe löschen?",
      "confirmBody": "Du kannst das direkt danach rückgängig machen.",
      "confirmOk": "Löschen",
      "deleting": "Lösche…",
      "error": "Löschen fehlgeschlagen",
      "undoTitle": "Aufgabe gelöscht"
    }
```

`deleting` bleibt in **beiden** vorerst stehen. Es hat noch Verwender — `hw.delete.deleting` in `TaskEditScreen.tsx:207`, `cal.delete.deleting` in `EventDetailScreen.tsx:313` —, und die i18n-Kataloge sind **nicht** typisiert (kein `CustomTypeOptions`): ein Commit, der den Key vor seiner Verwendung entfernt, scheitert nicht, sondern rendert still den Key-String. Jeder Key fällt deshalb im selben Commit wie seine letzte Verwendung — `hw.delete.deleting` in Task 8, `cal.delete.deleting` in Task 9.

- [ ] **Step 2: Die englischen Keys spiegeln**

`features/i18n/locales/en.json`:

`action.undo`: `"Undo"`

`cal.delete`:

```json
    "delete": {
      "confirmTitle": "Delete event?",
      "confirmBody": "You can undo this right afterwards.",
      "confirmOk": "Delete",
      "deleting": "Deleting…",
      "error": "Delete failed",
      "undoTitle": "Event deleted",
      "undoScopeForward": "from {{date}}",
      "undoScopeAll": "entire series"
    }
```

`hw.delete`:

```json
    "delete": {
      "confirmTitle": "Delete task?",
      "confirmBody": "You can undo this right afterwards.",
      "confirmOk": "Delete",
      "deleting": "Deleting…",
      "error": "Delete failed",
      "undoTitle": "Task deleted"
    }
```

- [ ] **Step 3: Prüfen, dass beide Kataloge dieselben Schlüssel tragen**

```bash
bun run typecheck
python3 - <<'PY'
import json
de = json.load(open("features/i18n/locales/de.json"))
en = json.load(open("features/i18n/locales/en.json"))
def keys(d, p=""):
    out = set()
    for k, v in d.items():
        out |= keys(v, f"{p}{k}.") if isinstance(v, dict) else {p + k}
    return out
only_de, only_en = keys(de) - keys(en), keys(en) - keys(de)
print("nur DE:", sorted(only_de))
print("nur EN:", sorted(only_en))
PY
```

Expected: beide Listen leer. `cal.delete.deleting` und `hw.delete.deleting` stehen zu diesem Zeitpunkt noch in **beiden** Katalogen — sie fallen in Task 8 bzw. Task 9.

- [ ] **Step 4: Den Verbindungs-Hook schreiben**

`app-sections/shared/useUndoableDelete.ts`:

```ts
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { UNDO_WINDOW_MS, usePendingDeleteStore, type PendingDeleteKind } from "@/features/shared";

import { useToast } from "./toastStore";

export interface UndoableDeleteArgs {
  kind: PendingDeleteKind;
  /** Wird vom Selektor des Features gelesen — `{ taskId }` bzw. `PendingEventDelete`. */
  target: unknown;
  /** Toast-Titel: benennt das Ergebnis, nicht die Operation. */
  title: string;
  /** Toast-Message: die Spezifika, an denen sich das Ergebnis prüfen lässt. */
  message: string;
  /** Die eigentliche Mutation, üblicherweise `mutation.mutateAsync(vars)`. */
  run: () => Promise<void>;
  errorTitle: string;
  formatError: (err: unknown) => string;
}

/**
 * Verbindet den Pending-Delete-Store mit dem Toast: verstecken, Fenster
 * anbieten, danach löschen — oder eben nicht.
 *
 * Liegt in `app-sections/`, **nicht** in `features/`: er braucht `useToast()`,
 * und `features/*` importiert nirgends aus `app-sections/*`. Diese Richtung
 * umzudrehen wäre die teuerste Zeile dieses Features.
 *
 * Der Toast überschreibt `durationMs` ausdrücklich und läuft damit ab, obwohl
 * er eine Aktion trägt. Das Pattern verbietet das sonst — hier **ist** das
 * Ablaufen die Semantik, und `resolveDuration` sanktioniert den Vorrang des
 * expliziten Werts als Regel 1 (Decision 11 der Spec).
 */
export function useUndoableDelete(): (args: UndoableDeleteArgs) => void {
  const { t } = useTranslation();
  const { show, dismiss } = useToast();
  const schedule = usePendingDeleteStore((state) => state.schedule);
  const undo = usePendingDeleteStore((state) => state.undo);

  return useCallback(
    (args: UndoableDeleteArgs) => {
      // Der Toast entsteht erst nach dem Planen, weil seine Aktion die
      // Pending-Id braucht; `run` wiederum braucht die Toast-Id. Ein Halter
      // löst die Verschränkung, ohne dass eine der beiden Ids zum Zeitpunkt
      // ihrer Benutzung noch leer sein kann: der Timer läuft frühestens
      // UNDO_WINDOW_MS später.
      const held: { toastId?: string } = {};

      const pendingId = schedule(args.kind, args.target, async () => {
        if (held.toastId) dismiss(held.toastId);
        try {
          await args.run();
        } catch (err) {
          // Kein `Alert`: der Nutzer steht längst auf einem anderen Screen, und
          // ein Dialog fünf Sekunden später wäre ein Überfall. Fehler-Toasts
          // laufen nie ab und tragen ihr ✕ (Decision 12 der Spec).
          show({
            title: args.errorTitle,
            message: args.formatError(err),
            variant: "error",
            position: "bottom",
          });
        }
      });

      held.toastId = show({
        title: args.title,
        message: args.message,
        variant: "success",
        position: "bottom",
        durationMs: UNDO_WINDOW_MS,
        action: { label: t("action.undo"), onPress: () => undo(pendingId) },
      });
    },
    [t, show, dismiss, schedule, undo],
  );
}
```

- [ ] **Step 5: Barrel erweitern**

`app-sections/shared/index.ts` — alphabetisch einsortiert:

```ts
export { useUndoableDelete, type UndoableDeleteArgs } from "./useUndoableDelete";
```

- [ ] **Step 6: Typecheck, Lint, Commit**

```bash
bun run typecheck && bun lint && bun test
git add features/i18n/locales/de.json features/i18n/locales/en.json app-sections/shared/useUndoableDelete.ts app-sections/shared/index.ts
git commit -m "feat(shared): Undo-Toast an den Pending-Delete-Store hängen"
```

---

## Task 8: Aufgaben-Löschen verdrahten

**Files:**

- Modify: `app-sections/task/TaskEditScreen.tsx`

**Interfaces:**

- Consumes: `useUndoableDelete` (Task 7), `useDeleteTask` + `mapTaskError` (Bestand)
- Produces: nichts

**Warum `mutateAsync` und keine Per-Call-Callbacks:** Der Screen ist unmontiert, wenn die Mutation feuert. TanStack Query bricht laufende Mutationen beim Unmount **nicht** ab, ruft aber die an `mutate(vars, { onSuccess })` übergebenen Callbacks dann nicht mehr. Die Callbacks aus `useMutation({ … })` — und damit `useDeleteTask`s `onMutate`/`onError`/`onSettled` samt Invalidate — laufen weiter. Deshalb: `mutateAsync`, und **keine** Optionen im zweiten Argument.

- [ ] **Step 1: Den Hook einhängen**

Import ergänzen und `showAlert` entfernen — es hat nach diesem Schritt keinen Aufrufer mehr in dieser Datei:

```ts
import { confirmDestructive, useUndoableDelete } from "@/app-sections/shared";
```

Im Komponentenrumpf, bei den anderen Hooks:

```ts
const undoableDelete = useUndoableDelete();
```

- [ ] **Step 2: `onDelete` umbauen**

```ts
async function onDelete() {
  if (!taskId || !task) return;
  const confirmed = await confirmDestructive({
    title: t("hw.delete.confirmTitle"),
    body: t("hw.delete.confirmBody"),
    confirm: t("hw.delete.confirmOk"),
    cancel: t("action.cancel"),
  });
  if (!confirmed) return;
  // Erst planen, dann navigieren: der Toast überlebt den Screenwechsel, weil
  // der Store auf Modulebene liegt. Der Screen ist weg, bevor die Mutation
  // feuert — deshalb `mutateAsync` ohne Per-Call-Callbacks.
  undoableDelete({
    kind: "task",
    target: { taskId },
    title: t("hw.delete.undoTitle"),
    message: task.title,
    run: () => deleteMutation.mutateAsync({ taskId }),
    errorTitle: t("hw.delete.error"),
    formatError: (err) => t(mapTaskError(err)),
  });
  goBackOrToTasks();
}
```

- [ ] **Step 3: Toten `isPending`-Code entfernen**

`deleteMutation.isPending` wird nie mehr sichtbar wahr. In `canSave` und in `onSave` die Bedingung `!deleteMutation.isPending` bzw. `|| deleteMutation.isPending` streichen:

```ts
const canSave = hydrated && !hasTaskFormErrors(errors) && !updateMutation.isPending;
```

```ts
function onSave() {
  const changes = toTaskChanges(state);
  if (!changes || !taskId || updateMutation.isPending) return;
  updateMutation.mutate({ taskId, changes }, { onSuccess: goBackOrToTasks });
}
```

Wird `deleteMutation` dadurch nur noch in `onDelete` benutzt, bleibt `const deleteMutation = useDeleteTask();` stehen.

Dazu `TaskEditScreen.tsx:207` — der Lösch-Button trägt heute:

```tsx
deleteMutation.isPending ? t("hw.delete.deleting") : t("hw.delete.confirmOk");
```

Das wird zu `t("hw.delete.confirmOk")`. Damit fällt die letzte Verwendung des Keys — **entferne im selben Commit `hw.delete.deleting` aus `features/i18n/locales/de.json` und `en.json`.** Gegenprobe:

```bash
grep -rn "hw.delete.deleting" app-sections features   # muss leer sein
```

- [ ] **Step 4: Typecheck und Lint**

Run: `bun run typecheck && bun lint`
Expected: grün. Meldet ESLint `showAlert` als ungenutzten Import, ist Step 1 unvollständig.

- [ ] **Step 5: Sichtprüfung im Web — inklusive der Frage, ob die Mutation nach dem Unmount wirklich feuert**

```bash
bun run web
```

1. Aufgabe öffnen → Löschen → bestätigen. Erwartet: Sheet schließt, Aufgabe ist sofort aus der Liste, Toast unten mit laufender Leiste.
2. **„Rückgängig" drücken.** Erwartet: Toast blendet aus, Aufgabe steht wieder in der Liste.
3. Erneut löschen, **das Fenster auslaufen lassen**, dann Pull-to-Refresh auf dem Aufgaben-Tab. Erwartet: Die Aufgabe bleibt weg — das ist der Beweis, dass die Mutation nach dem Unmount des Screens tatsächlich gelaufen ist.

**Wenn Schritt 3 die Aufgabe zurückbringt**, ist die Mutation nicht gefeuert. Dann nicht im Screen weiterprobieren, sondern anhalten und melden: die Lösung wäre, `useDeleteTask()` in einen dauerhaft montierten Hook neben `useFlushPendingDeletes()` zu ziehen, statt sie aus dem Sheet zu greifen. Das ist eine Planänderung, keine Reparatur.

- [ ] **Step 6: Commit**

```bash
bun test
git add app-sections/task/TaskEditScreen.tsx features/i18n/locales/de.json features/i18n/locales/en.json
git commit -m "feat(tasks): Aufgabe löschen mit Rückgängig-Fenster"
```

---

## Task 9: Termin-Löschen verdrahten

**Files:**

- Modify: `app-sections/event/EventDetailScreen.tsx`

**Interfaces:**

- Consumes: `useUndoableDelete` (Task 7), `useDeleteEvent` + `pickScope` (Bestand)
- Produces: nichts

- [ ] **Step 1: Imports und Hook ergänzen**

```ts
import { format, parseISO } from "date-fns";
```

```ts
import { ChildAvatar, Icon, useUndoableDelete } from "@/app-sections/shared";
```

Im Rumpf, bei den anderen Hooks:

```ts
const undoableDelete = useUndoableDelete();
```

`Alert` bleibt importiert — der Bestätigungsdialog und `cal.detail.reminderError` brauchen ihn weiter.

- [ ] **Step 2: Eine Helfer-Funktion für die Toast-Message**

Im Komponentenrumpf, über `onDeletePress`:

```ts
/**
 * Was der Toast unter dem Titel zeigt: der Termin-Titel, bei einer Serie mit
 * dem Umfang der Löschung. Ohne diese Angabe wäre der Toast Dekoration — bei
 * „ganze Serie" ist der Unterschied zu „nur dieser Termin" genau das, was der
 * Nutzer prüfen können muss, bevor das Fenster zugeht.
 */
function undoMessage(title: string, scope: EditScope, occurrenceDate: string): string {
  if (scope === "all") return `${title} · ${t("cal.delete.undoScopeAll")}`;
  if (scope === "forward") {
    // Dasselbe Format wie die Datumszeile des Screens weiter unten.
    const date = format(parseISO(occurrenceDate), "d. MMM", { locale: dateLocale });
    return `${title} · ${t("cal.delete.undoScopeForward", { date })}`;
  }
  return title;
}
```

- [ ] **Step 3: `onDeletePress` umbauen**

Ersetze den `deleteMutation.mutate(…)`-Block durch:

```ts
// Bei einem Einzeltermin ist `scope` immer "all" (der Dialog kommt
// gar nicht) — dort trägt der Toast nur den Titel, kein Serien-
// Zusatz, weil es keine Serie gibt.
const message = isRecurring ? undoMessage(data.title, scope, data.occurrenceDate) : data.title;

undoableDelete({
  kind: "event",
  target: {
    eventId: data.eventId,
    occurrenceDate: data.occurrenceDate,
    scope,
  },
  title: t("cal.delete.undoTitle"),
  message,
  run: () =>
    deleteMutation.mutateAsync({
      scope,
      eventId: data.eventId,
      occurrenceDate: data.occurrenceDate,
      isRecurring,
    }),
  errorTitle: t("cal.delete.error"),
  formatError: (err) => (err instanceof Error ? err.message : ""),
});
router.back();
```

Das `target` entspricht exakt `PendingEventDelete` aus Task 4 — `eventId`, `occurrenceDate`, `scope`, kein `isRecurring`: das Prädikat braucht es nicht, weil ein Einzeltermin nur eine Occurrence hat.

- [ ] **Step 4: Toten `isPending`-Code entfernen**

Drei Stellen in dieser Datei:

- Der Bearbeiten-`Pressable`: `disabled={deleteMutation.isPending}` und `style={{ opacity: deleteMutation.isPending ? 0.4 : 1 }}` streichen (`style` ganz weg, wenn nichts anderes drinsteht).
- Der Lösch-`Button` (`EventDetailScreen.tsx:313`): `label={deleteMutation.isPending ? t("cal.delete.deleting") : t("cal.detail.delete")}` wird zu `label={t("cal.detail.delete")}`, und `disabled={deleteMutation.isPending}` entfällt.

Damit fällt die letzte Verwendung von `cal.delete.deleting` — **entferne im selben Commit den Key aus `features/i18n/locales/de.json` und `en.json`.**

- [ ] **Step 5: Typecheck und Lint**

Run: `bun run typecheck && bun lint`
Expected: grün, und **keine** Fundstelle mehr:

```bash
grep -rn "delete.deleting" app-sections features   # muss leer sein
```

- [ ] **Step 6: Sichtprüfung im Web**

```bash
bun run web
```

1. **Einzeltermin** löschen → bestätigen. Erwartet: sofort aus dem Kalender **und** vom Dashboard weg, Toast unten („Termin gelöscht" + Titel), Leiste läuft. „Rückgängig" → Termin ist zurück.
2. **Serientermin**, Scope „Alle Termine" → Toast-Message endet auf „· ganze Serie", **alle** Occurrences sind weg. Rückgängig → alle zurück.
3. **Serientermin**, Scope „Diesen und alle folgenden" → Toast-Message endet auf „· ab 12. Sep", die Occurrence des Stichtags **und** alles danach ist weg, die davor stehen noch.
4. **Serientermin**, Scope „Nur diesen Termin" → nur die eine Occurrence weg, Nachbarn stehen.
5. Fenster auslaufen lassen, Monat wechseln und zurück. Erwartet: bleibt weg.
6. Light **und** Dark.

- [ ] **Step 7: Commit**

```bash
bun test
git add app-sections/event/EventDetailScreen.tsx features/i18n/locales/de.json features/i18n/locales/en.json
git commit -m "feat(calendar): Termin löschen mit Rückgängig-Fenster"
```

---

## Task 10: Dokumentation

**Files:**

- Modify: `docs/decision-log.md`
- Modify: `docs/TODO.md`
- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: alles Vorige
- Produces: nichts

- [ ] **Step 1: ADR-026 anhängen**

An das **Ende** von `docs/decision-log.md` — ältere ADRs werden nie editiert, nur abgelöst. Struktur wie ADR-025 (Context · Decision mit nummerierten Punkten · Consequences). Inhaltlich müssen darin stehen:

1. **Verzögern statt wiederherstellen.** Warum ein Re-Insert ausscheidet: neue Ids, verlorene Reminder und Exceptions, und bei Serien praktisch nicht rekonstruierbar, weil `applyDeleteScope` je nach Scope eine Exception schreibt, die RRULE kürzt oder die Master-Zeile löscht.
2. **Verstecken statt Cache-Manipulation**, und warum der Snapshot-Weg am Kalender scheitert (Master-Zeilen statt Occurrences; jeder Refetch im Fenster überholt den Snapshot).
3. **`target: unknown` mit einem Cast pro Feature** statt umgedrehter Abhängigkeitsrichtung oder Store-Fabrik samt Registry.
4. **Der Timer gehört dem Store, nicht dem Toast** — sonst entschiede `stack.max: 2` mit darüber, ob eine Löschung stattfindet.
5. **`flush` nur auf `background`, nicht auf `inactive`** — mit der iOS-Begründung (Kontrollzentrum, Anruf-Einblendung, App-Switcher).
6. **Dialog _und_ Undo**, gegen die übliche Lesart, plus der Grund: der Scope-Dialog der Serien lässt sich ohnehin nicht streichen.
7. **Fünf Sekunden statt 3200 ms** — die Pattern-Zeit gilt für eine Bestätigung, die man nur zur Kenntnis nimmt.
8. **`success` statt `info` wegen des Glyphs** — `sparkles` ist an KI vergeben.
9. **Bewusste Pattern-Abweichung:** ein Toast mit Aktion läuft hier ab, weil das Ablaufen die Semantik ist.

Consequences: die Bestätigungs-Copy war unwahr geworden und wurde korrigiert (beide Keys stehen **nicht** in `COPY.md`, das Handoff-Bundle bleibt unangetastet); der Fehlerfall meldet jetzt per Toast statt per `Alert`; `cal.delete.deleting`/`hw.delete.deleting` sind entfallen; die Timer-Leiste ist nachgezogen, `solid` weiterhin nicht; Meal-Plan-Einträge sind mangels Mutationen außen vor; die Konflikt-Prüfung im `EventCreateScreen` zieht automatisch mit.

- [ ] **Step 2: `docs/TODO.md` abgleichen**

| Eintrag                                                                  | Aktion                                                                                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| „**Undo nach Delete** (Snackbar mit Re-Insert-Logic)"                    | **Zeile löschen** — eingelöst; die Klammer beschreibt zudem einen Ansatz, den ADR-026 verwirft |
| „**Noch kein Aufrufer**" (`toastStore.ts`)                               | **Zeile löschen** — dieses Feature ist der erste                                               |
| „**`solid` und der Timer-Balken sind nicht gebaut**"                     | auf `solid` **verkürzen**; den Timer-Balken-Teil samt seiner Begründung herausnehmen           |
| „**Toast-Component** statt `Alert.alert` …(Edit-Save-Done, Delete-Done)" | auf den Save-Fall **verkürzen** — Delete-Done ist erledigt                                     |

Nichts Neues anhängen: Meal-Plan-Undo ist **kein** TODO, weil es dort noch gar kein Löschen gibt (Abschnitt 1 der Spec).

- [ ] **Step 3: `CLAUDE.md` nachziehen**

Im Block „Folder structure", zwei Stellen.

`CLAUDE.md:132` — heute:

```
├─ shared/               Feature-übergreifende Hooks + Typen (useToday · Translate)
```

wird zu:

```
├─ shared/               Feature-übergreifende Hooks + Typen (useToday · Translate
│                        · pendingDeletes — verzögerte Löschungen mit Undo-Fenster)
```

`CLAUDE.md:107-109` — heute:

```
└─ shared/               Geteilte Bausteine inkl. Formular-Primitives
   (DateTimePickerSheet · TypePicker · MemberPicker · Field · confirmDialog
   · AllergenBadge · recipeA11y · mealPlaceholder — von mehr als einem Tab benutzt)
```

wird zu:

```
└─ shared/               Geteilte Bausteine inkl. Formular-Primitives
   (DateTimePickerSheet · TypePicker · MemberPicker · Field · confirmDialog
   · Toast · useUndoableDelete · AllergenBadge · recipeA11y · mealPlaceholder
   — von mehr als einem Tab benutzt)
```

- [ ] **Step 4: Alles zusammen prüfen**

```bash
bun run format:check && bun lint && bun run typecheck && bun test
bunx expo export --platform web --output-dir /tmp/eltern-web
```

Expected: alle vier grün, der Web-Export läuft durch.

- [ ] **Step 5: Commit**

```bash
git add docs/decision-log.md docs/TODO.md CLAUDE.md
git commit -m "docs: ADR-026 für Rückgängig nach dem Löschen"
```

- [ ] **Step 6: CodeRabbit-Durchlauf vor dem PR**

```bash
coderabbit review --base main --agent
```

Findings abarbeiten oder mit Begründung bewusst verwerfen. Erst danach den PR öffnen.
