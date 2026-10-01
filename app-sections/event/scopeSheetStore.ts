import { create } from "zustand";

import type { EditScope } from "@/features/calendar";

/**
 * Der Zustand hinter dem Scope-Sheet („Nur diesen / Diesen und folgende /
 * Alle / Abbrechen").
 *
 * Warum ein Store im Root-Layout: `pickScope` bleibt ein Promise, und beide
 * Aufrufer (`EventDetailScreen.onDeletePress`, `EventEditScreen.onSave`)
 * `await`en es mitten in ihrem Ablauf. Ein Sheet als lokaler Screen-State
 * hieße, beide Screens umzubauen; der Store lässt sie unangetastet. Dieselbe
 * Bauform wie `conflictStore.ts` und `toastStore.ts`.
 *
 * Bewusst **ohne** `react-native`-Import und ohne Laufzeit-Import aus
 * `@/features/calendar` (nur der Typ `EditScope`): der Barrel ist unter Bun
 * zur Laufzeit nicht ladbar, der Store hängt also nicht von den Mocks aus
 * `bun.test.preload.ts` ab.
 */

/** Die Texte des Sheets. Der Aufrufer übersetzt, der Store kennt kein i18n. */
export interface ScopeDialogLabels {
  title: string;
  this: string;
  forward: string;
  all: string;
  cancel: string;
}

/** Eine offene Scope-Frage samt dem Promise-Ausgang, auf den der Aufrufer wartet. */
export interface ScopeRequest {
  id: string;
  labels: ScopeDialogLabels;
  resolve: (scope: EditScope | null) => void;
}

// Laufende Nummer statt Zufalls-Id — wie `nextConflictId`.
let sequence = 0;

function nextScopeId(): string {
  sequence += 1;
  return `scope-${sequence}`;
}

interface ScopeSheetState {
  /**
   * Genau eine offene Frage, **keine** Warteschlange — anders als beim
   * Konflikt-Dialog (`conflictStore.ts`), wo ein Verdrängen Eingaben
   * vernichtet hätte. Beide Aufrufer sind serialisiert (`submitLock` beim
   * Speichern, der vorgeschaltete Confirm beim Löschen); eine zweite Anfrage
   * bei offener erster heißt, dass die erste verwaist ist.
   */
  current: ScopeRequest | null;
}

export const useScopeSheetStore = create<ScopeSheetState>(() => ({ current: null }));

/**
 * Öffnet das Sheet und liefert die Wahl — `null`, wenn abgebrochen oder
 * verdrängt.
 *
 * Eine noch offene Anfrage wird dabei **mit `null` aufgelöst**, nicht
 * fallengelassen: Ein Promise, das nie auflöst, ließe `submitLock` im
 * Bearbeiten-Screen dauerhaft gesperrt — genau der Webfehler, den das Sheet
 * behebt.
 */
export function requestScope(labels: ScopeDialogLabels): Promise<EditScope | null> {
  return new Promise((resolve) => {
    // Erst die alte auflösen: Ihr `then` läuft ohnehin erst als Microtask,
    // sieht also schon die neue Anfrage im Store.
    useScopeSheetStore.getState().current?.resolve(null);
    useScopeSheetStore.setState({ current: { id: nextScopeId(), labels, resolve } });
  });
}

/**
 * Beendet die Anfrage `id` mit der getroffenen Wahl.
 *
 * Nur wenn `id` die **aktuelle** Anfrage ist: Ein später Tap auf ein bereits
 * ersetztes Sheet darf weder die neue Frage beantworten noch abräumen.
 *
 * Die Reihenfolge „erst leeren, dann auflösen" ändert für Promise-Aufrufer
 * nichts — deren Fortsetzung läuft ohnehin erst als Microtask nach der
 * Rückkehr von `settleScope`. Sie bleibt, damit `current` für jeden
 * synchronen Beobachter schon leer ist, und spiegelt `ConflictDialogHost`
 * (erst schließen, dann der Callback).
 */
export function settleScope(id: string, scope: EditScope | null): void {
  const { current } = useScopeSheetStore.getState();
  if (current?.id !== id) return;
  useScopeSheetStore.setState({ current: null });
  current.resolve(scope);
}
