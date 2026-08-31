import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  addDays,
  endOfMonth,
  max as dateMax,
  min as dateMin,
  parseISO,
  startOfMonth,
} from "date-fns";
import { useMemo } from "react";

import type { Database } from "@/features/supabase/database.types";

import { useTheme } from "@/design-system/ThemeProvider";

import type { DaySegment } from "./spans";
import type { CalendarOccurrence, MarkedDates } from "./types";

import { expandEvents } from "./expand";
import { usePendingEventDeletes, withoutPendingDeletes } from "./pendingDeletes";
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

  const data = useMemo(() => {
    if (!query.data) return NO_OCCURRENCES;
    // Nach dem Expandieren gefiltert, nicht davor: die offenen Löschungen sind
    // pro Occurrence gedacht („nur dieser Termin"), die gecachten Zeilen sind
    // Master-Zeilen (Decision 1 der Spec).
    return withoutPendingDeletes(expandEvents(query.data, rangeStart, rangeEnd, theme), pending);
  }, [query.data, rangeStart, rangeEnd, theme, pending]);

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

export function useEvent(id: string, occurrenceDate?: string): UseEventResult {
  const { theme } = useTheme();

  const query = useQuery({
    queryKey: calendarKeys.one(id),
    queryFn: () => fetchEventById(id),
    enabled: !!id,
  });

  const occurrence = useMemo<CalendarOccurrence | null>(() => {
    const row = query.data;
    if (!row) return null;
    const start = new Date(row.start_at);
    // Ensure the requested occurrenceDate falls inside the expansion window —
    // a far-future RRULE occurrence (>1y out) would otherwise be cut off.
    const requested = occurrenceDate ? parseISO(occurrenceDate) : null;
    const fallbackStart = requested ? dateMin([addDays(start, -1), requested]) : addDays(start, -1);
    const fallbackEnd = requested ? dateMax([addDays(start, 366), requested]) : addDays(start, 366);
    const expanded = expandEvents([row], fallbackStart, fallbackEnd, theme);
    if (occurrenceDate) {
      return expanded.find((o) => o.occurrenceDate === occurrenceDate) ?? expanded[0] ?? null;
    }
    return expanded[0] ?? null;
  }, [query.data, occurrenceDate, theme]);

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
