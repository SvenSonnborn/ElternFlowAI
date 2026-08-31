import type { Translate } from "@/features/shared";

import type { EditScope } from "./recurrence";

/**
 * Baut die Toast-Message für eine geplante Termin-Löschung: der Titel, bei
 * einer Serie ergänzt um den gewählten Umfang.
 *
 * Ein Einzeltermin bekommt **keinen** Serien-Zusatz, obwohl `scope` für ihn
 * technisch `"all"` lautet: der Scope-Dialog (`pickScope` in
 * `EventDetailScreen.tsx`) läuft nur bei einer Serie, bei einem Einzeltermin
 * ist `"all"` nie eine Nutzerentscheidung, sondern nur der Initialwert der
 * lokalen `scope`-Variable an der Aufrufstelle. Ohne die `isRecurring`-Prüfung
 * hier stünde am Toast fälschlich „· ganze Serie" für einen Termin, der gar
 * keine Serie ist — eine nutzersichtbare Copy-Lüge, kein rein kosmetischer
 * Fehler.
 *
 * `formatDate` bleibt dem Aufrufer überlassen (er kennt `dateLocale` aus dem
 * Render-Scope des Screens), damit diese Funktion frei von `date-fns`-
 * Locale-Zustand bleibt und im Test trivial mit einem Fake bedienbar ist.
 */
export function undoDeleteMessage(args: {
  title: string;
  scope: EditScope;
  occurrenceDate: string;
  isRecurring: boolean;
  t: Translate;
  formatDate: (occurrenceDate: string) => string;
}): string {
  const { title, scope, occurrenceDate, isRecurring, t, formatDate } = args;
  if (!isRecurring) return title;
  if (scope === "all") return `${title} · ${t("cal.delete.undoScopeAll")}`;
  if (scope === "forward") {
    return `${title} · ${t("cal.delete.undoScopeForward", { date: formatDate(occurrenceDate) })}`;
  }
  return title;
}
