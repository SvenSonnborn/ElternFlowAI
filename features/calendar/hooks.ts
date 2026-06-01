import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  endOfMonth,
  max as dateMax,
  min as dateMin,
  parseISO,
  startOfMonth,
} from "date-fns";
import { useMemo } from "react";

import { useTheme } from "@/design-system/ThemeProvider";

import type { CalendarOccurrence, MarkedDates, MarkedDot } from "./types";

import { expandEvents } from "./expand";
import { calendarKeys, fetchEventById, fetchEventsInRange } from "./queries";

interface UseFamilyEventsResult {
  data: CalendarOccurrence[];
  isLoading: boolean;
  error: unknown;
}

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

  const data = useMemo(() => {
    if (!query.data) return [];
    return expandEvents(query.data, rangeStart, rangeEnd, theme);
  }, [query.data, rangeStart, rangeEnd, theme]);

  return {
    data,
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

export function useMarkedDates(
  occurrences: CalendarOccurrence[],
  selectedDate: string,
  selectedColor: string,
): MarkedDates {
  return useMemo(() => {
    const byDate = new Map<string, Map<string, MarkedDot>>();
    for (const occ of occurrences) {
      const dots = byDate.get(occ.occurrenceDate) ?? new Map<string, MarkedDot>();
      if (!dots.has(occ.type.slug)) {
        dots.set(occ.type.slug, { key: occ.type.slug, color: occ.type.color });
      }
      byDate.set(occ.occurrenceDate, dots);
    }
    const out: MarkedDates = {};
    byDate.forEach((dotMap, date) => {
      out[date] = { marked: true, dots: Array.from(dotMap.values()).slice(0, 3) };
    });
    out[selectedDate] = {
      ...(out[selectedDate] ?? {}),
      selected: true,
      selectedColor,
    };
    return out;
  }, [occurrences, selectedDate, selectedColor]);
}
