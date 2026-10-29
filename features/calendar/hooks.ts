import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { addDays, endOfMonth, startOfMonth } from "date-fns";
import { useMemo } from "react";

import type { Database } from "@/features/supabase/database.types";

import { useTheme } from "@/design-system/ThemeProvider";

import type { DaySegment } from "./spans";
import type { CalendarOccurrence, MarkedDates } from "./types";

import { eventLookupWindow, pickOccurrence } from "./eventWindow";
import { expandEvents } from "./expand";
import { useOptimisticEvents, visibleOccurrences } from "./optimisticEvents";
import { usePendingEventDeletes } from "./pendingDeletes";
import { calendarKeys, fetchEventById, fetchEventsInRange, fetchEventTypes } from "./queries";
import { toDayMarkings, toDaySegments } from "./spans";

type EventTypeRow = Database["public"]["Tables"]["event_types"]["Row"];

/** Referenzstabil, damit `data` nicht bei jedem Render ein neues Array ist. */
const NO_OCCURRENCES: CalendarOccurrence[] = [];

interface UseFamilyEventsResult {
  data: CalendarOccurrence[];
  /** One entry per covered calendar day, clipped to the same window as `data`. */
  segments: DaySegment[];
  isLoading: boolean;
  error: unknown;
}

/**
 * Alle Termine im sichtbaren Monat plus jeweils 7 Tage Puffer.
 *
 * Gibt die Menge **gefiltert nach Undo-Status** zurück: wenn ein Termin gerade
 * gelöscht wird, steht er im Filter und ist **nicht** in `data` — obwohl die
 * Query ihn nachgeladen hat. Das ist Absicht (Decision 1 der Spec): die Zeile
 * bleibt im Cache, wird nur ausgeblendet, solange die Undo-Aktion möglich ist.
 *
 * Die Menge enthält zusätzlich **optimistische Änderungen**, die der Server noch
 * nicht bestätigt hat — inklusive Termine, deren Zeilen es serverseitig noch gar
 * nicht gibt.
 */
export function useFamilyEvents(visibleMonth: Date): UseFamilyEventsResult {
  const { theme } = useTheme();

  const { rangeStart, rangeEnd } = useMemo(() => {
    const s = addDays(startOfMonth(visibleMonth), -7);
    const e = addDays(endOfMonth(visibleMonth), 7);
    return { rangeStart: s, rangeEnd: e };
  }, [visibleMonth]);

  const query = useQuery({
    queryKey: calendarKeys.range(rangeStart.toISOString(), rangeEnd.toISOString()),
    queryFn: () => fetchEventsInRange(rangeStart, rangeEnd),
  });

  const pending = usePendingEventDeletes();
  const optimistic = useOptimisticEvents();

  const data = useMemo(() => {
    // Fehlende Serverdaten sind eine leere Expansion, kein Abbruch: Ein früher
    // `return NO_OCCURRENCES` überspränge auch das optimistische Overlay —
    // legt der Nutzer einen Termin an und wischt sofort in einen Monat ohne
    // eigenen Query-Cache-Eintrag (neue Range-Query, Kaltstart), wäre der
    // gerade angelegte Termin bis zum Fetch unsichtbar. `NO_OCCURRENCES` statt
    // `[]`, damit die Referenz stabil bleibt, solange weder Serverdaten noch
    // ein gültiger Eintrag vorliegen — `visibleOccurrences` gibt seine Eingabe
    // unverändert zurück, solange in dieser Ansicht kein Eintrag gilt und keine
    // Löschung offen ist.
    const expanded = query.data
      ? expandEvents(query.data, rangeStart, rangeEnd, theme)
      : NO_OCCURRENCES;
    // `dataUpdatedAt` steht eigens in den Abhängigkeiten: Ein Refetch mit
    // gleichen Daten behält dank Structural Sharing dieselbe `data`-Referenz,
    // schiebt aber `dataUpdatedAt` vor — und das entscheidet, ob ein
    // gespeicherter Eintrag in dieser Ansicht noch gilt (`appliesToView`).
    return visibleOccurrences({
      expanded,
      view: { dataUpdatedAt: query.dataUpdatedAt, rows: query.data },
      pending,
      optimistic,
      expand: (rows) => expandEvents(rows, rangeStart, rangeEnd, theme),
    });
  }, [query.data, query.dataUpdatedAt, rangeStart, rangeEnd, theme, optimistic, pending]);

  const segments = useMemo(
    () => toDaySegments(data, rangeStart, rangeEnd),
    [data, rangeStart, rangeEnd],
  );

  return {
    data,
    segments,
    isLoading: query.isLoading,
    error: query.error,
  };
}

interface UseEventResult {
  data: CalendarOccurrence | null;
  isLoading: boolean;
  error: unknown;
}

export function useEvent(id: string, occurrenceKey?: string): UseEventResult {
  const { theme } = useTheme();

  const query = useQuery({
    queryKey: calendarKeys.one(id),
    queryFn: () => fetchEventById(id),
    enabled: !!id,
  });

  const occurrence = useMemo<CalendarOccurrence | null>(() => {
    const row = query.data;
    if (!row) return null;
    // Das Fenster deckt den angeforderten Regel-Tag in `row.timezone` ab, siehe
    // `eventLookupWindow`.
    const { start, end } = eventLookupWindow(row, occurrenceKey);
    const expanded = expandEvents([row], start, end, theme);
    // Match auf `occurrenceKey`, nicht auf das aufgelöste Anzeigedatum: Der
    // Routen-Parameter `occ` benennt die Exception-Zeile (ADR-034). Links von
    // vor ADR-034 tragen ein Datum in der Gerätezone des Erstellers und können
    // die Nachbar-Occurrence treffen, siehe docs/TODO.md.
    return pickOccurrence(expanded, occurrenceKey);
  }, [query.data, occurrenceKey, theme]);

  return {
    data: occurrence,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useEventTypes(): UseQueryResult<EventTypeRow[], Error> {
  return useQuery({
    queryKey: calendarKeys.types,
    queryFn: fetchEventTypes,
    staleTime: 5 * 60_000,
  });
}

export function useMarkedDates(
  segments: DaySegment[],
  selectedDate: string,
  selectedColor: string,
): MarkedDates {
  return useMemo(
    () => toDayMarkings(segments, selectedDate, selectedColor),
    [segments, selectedDate, selectedColor],
  );
}
