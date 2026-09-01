/**
 * Sperrt einen Speichern-Tap gegen einen zweiten, der in der Lücke zwischen
 * Antippen und dem tatsächlichen Unmount des Sheets ankommt — bei
 * `EventCreateScreen` und `EventEditScreen` die Schließanimation (~300ms), die
 * `router.back()` anstößt, bevor die Mutation überhaupt beantwortet ist
 * (Decision 5 der Optimistic-UI-Spec: Beide Sheets schließen sofort, ein
 * Fehlschlag meldet sich per Toast). In diesem Fenster bleibt der
 * Speichern-Button bedienbar.
 *
 * `mutation.isPending` reicht dafür nicht als alleinige Quelle: Ein zweiter
 * Tap in derselben Render-Runde wie der erste liest ihn unter Umständen noch
 * als `false`, weil TanStack Query den Zustand erst mit dem nächsten Render
 * sichtbar macht. Genau diese Lücke hat real zu doppelt angelegten Terminen
 * geführt, nachdem ein früherer `!createMutation.isPending`-Guard als
 * „nie sichtbar wahr" entfernt wurde. `createSubmitLock` sperrt stattdessen
 * synchron in einer Modul-Closure, unabhängig von React-Renderzyklen.
 *
 * Eine kleine Fabrik statt einer nackten `useRef(false)`-Prüfung im Screen,
 * damit die Sperr-/Entsperr-Regel — einmal sperren, erst ein expliziter
 * `unlock()` gibt sie wieder frei — als eigener, ohne Komponenten-Rendering
 * testbarer Vertrag steht. Genau dieser Vertrag ist es, der beim nächsten
 * Aufräumen sonst wieder für „redundant" gehalten werden könnte.
 */
export interface SubmitLock {
  /**
   * `true` und sperrt, wenn die Sperre noch offen war; sonst `false`, ohne
   * etwas zu verändern. Der Aufrufer muss dieses Ergebnis vor dem eigentlichen
   * Absenden prüfen — ein `false` bedeutet: ein Tap läuft (oder lief) bereits.
   */
  tryLock: () => boolean;
  /**
   * Gibt die Sperre wieder frei. Nur für Pfade, die **vor** dem eigentlichen
   * Absenden abbrechen — z. B. der Serien-Scope-Dialog in `EventEditScreen`,
   * den der Nutzer abbricht, bevor die Mutation überhaupt startet. Der
   * Fehler-Retry im Toast (`save()` in beiden Screens) ruft das bewusst nie:
   * Das Sheet ist zu diesem Zeitpunkt längst unmontiert, ein erneuter Tap auf
   * denselben Button ist gar nicht mehr möglich.
   */
  unlock: () => void;
}

/** Erzeugt eine frische, ungesperrte `SubmitLock`-Instanz. */
export function createSubmitLock(): SubmitLock {
  let locked = false;
  return {
    tryLock() {
      if (locked) return false;
      locked = true;
      return true;
    },
    unlock() {
      locked = false;
    },
  };
}
