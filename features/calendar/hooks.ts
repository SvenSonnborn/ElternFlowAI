import { useQuery } from "@tanstack/react-query";
import { addDays, endOfMonth, startOfMonth } from "date-fns";
import { useMemo } from "react";

import { useTheme } from "@/design-system/ThemeProvider";

import type { CalendarOccurrence, MarkedDates, MarkedDot } from "./types";

import { expandEvents } from "./expand";
import { calendarKeys, fetchEventById, fetchEventsInRange } from "./queries";
import { getSampleOccurrences, findSampleOccurrence } from "./sample";
import { useSessionStore } from "./sessionStore";

interface UseFamilyEventsResult {
  data: CalendarOccurrence[];
  isLoading: boolean;
  isFallback: boolean;
  error: unknown;
}

export function useFamilyEvents(visibleMonth: Date): UseFamilyEventsResult {
  const { theme } = useTheme();
  const session = useSessionStore((s) => s.session);
  const initialized = useSessionStore((s) => s.initialized);
  const hasSession = !!session;

  const { rangeStart, rangeEnd } = useMemo(() => {
    const s = addDays(startOfMonth(visibleMonth), -7);
    const e = addDays(endOfMonth(visibleMonth), 7);
    return { rangeStart: s, rangeEnd: e };
  }, [visibleMonth]);

  const query = useQuery({
    queryKey: calendarKeys.range(rangeStart.toISOString(), rangeEnd.toISOString()),
    queryFn: () => fetchEventsInRange(rangeStart, rangeEnd),
    enabled: hasSession && initialized,
  });

  const sample = useMemo(() => getSampleOccurrences(visibleMonth), [visibleMonth]);

  const data = useMemo(() => {
    if (!hasSession) return sample;
    if (!query.data) return [];
    return expandEvents(query.data, rangeStart, rangeEnd, theme);
  }, [hasSession, query.data, rangeStart, rangeEnd, sample, theme]);

  return {
    data,
    isLoading: hasSession ? query.isLoading : false,
    isFallback: !hasSession,
    error: query.error,
  };
}

interface UseEventResult {
  data: CalendarOccurrence | null;
  isLoading: boolean;
  isFallback: boolean;
  error: unknown;
}

export function useEvent(id: string, occurrenceDate?: string): UseEventResult {
  const { theme } = useTheme();
  const session = useSessionStore((s) => s.session);
  const initialized = useSessionStore((s) => s.initialized);
  const hasSession = !!session;

  const query = useQuery({
    queryKey: calendarKeys.one(id),
    queryFn: () => fetchEventById(id),
    enabled: hasSession && initialized && !!id,
  });

  const occurrence = useMemo<CalendarOccurrence | null>(() => {
    if (!hasSession) return findSampleOccurrence(id);
    const row = query.data;
    if (!row) return null;
    const start = new Date(row.start_at);
    const fallbackStart = addDays(start, -1);
    const fallbackEnd = addDays(start, 366);
    const expanded = expandEvents([row], fallbackStart, fallbackEnd, theme);
    if (occurrenceDate) {
      return expanded.find((o) => o.occurrenceDate === occurrenceDate) ?? expanded[0] ?? null;
    }
    return expanded[0] ?? null;
  }, [hasSession, query.data, id, occurrenceDate, theme]);

  return {
    data: occurrence,
    isLoading: hasSession ? query.isLoading : false,
    isFallback: !hasSession,
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
