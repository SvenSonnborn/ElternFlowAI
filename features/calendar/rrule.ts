import { Frequency, RRule } from "rrule";

import type { Database } from "@/features/supabase/database.types";

import { floatingToInstant, instantToFloating } from "./timezone";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

const FREQ_MAP: Record<NonNullable<EventRow["rrule_freq"]>, Frequency> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

/**
 * Die Regel einer Zeile, **in Wandzeit**.
 *
 * `dtstart` und `until` gehen als „floating" hinein (Wandzeit in den
 * UTC-Komponenten, siehe `timezone.ts`). `rrule` liest sie mit UTC-Gettern und
 * rechnet absolut — auf Wandzeit angewandt ist das DST-frei, „18:00" bleibt
 * über eine Umstellung hinweg stehen. Die Ergebnisse sind entsprechend
 * ebenfalls floating und müssen von den Exporten unten zurückgerechnet werden.
 *
 * **`tzid` wird bewusst nicht gesetzt.** `rrule@2.8.1` rechnet dafür
 * `targetOffset − localOffset` und ist damit nur bei Prozess-Zeitzone UTC
 * korrekt; in einer RN-App, die in der Gerätezone läuft, ist die Option ein
 * No-op. Nachgemessen — Spec §1.1, ADR-033.
 *
 * Modulintern: der Floating-Raum verlässt diese Datei nicht.
 */
function buildFloatingRule(row: EventRow): RRule | null {
  if (!row.rrule_freq) return null;
  return new RRule({
    freq: FREQ_MAP[row.rrule_freq],
    interval: row.rrule_interval || 1,
    dtstart: instantToFloating(new Date(row.start_at), row.timezone),
    until: row.rrule_until ? instantToFloating(new Date(row.rrule_until), row.timezone) : null,
    count: row.rrule_count ?? null,
    byweekday: row.rrule_byweekday?.length ? row.rrule_byweekday.map((n) => n - 1) : null,
  });
}

/**
 * Alle Vorkommen im Fenster, als **echte Instants** — Grenzen inklusive.
 *
 * Ein Einzeltermin (`rrule_freq IS NULL`) ist ein Vorkommen: er liefert seinen
 * eigenen Start, wenn er ins Fenster fällt. Das war schon vorher die Semantik
 * des Aufrufers in `expand.ts` und wandert hier herein, damit beide Exporte
 * dieselbe Regel kennen.
 */
export function occurrencesBetween(row: EventRow, from: Date, to: Date): Date[] {
  const rule = buildFloatingRule(row);
  const start = new Date(row.start_at);
  if (!rule) return start >= from && start <= to ? [start] : [];
  const floatingFrom = instantToFloating(from, row.timezone);
  const floatingTo = instantToFloating(to, row.timezone);
  return rule
    .between(floatingFrom, floatingTo, true)
    .map((d) => floatingToInstant(d, row.timezone));
}

/**
 * Alle Vorkommen der Serie, als echte Instants.
 *
 * Nur für begrenzte Serien aufrufen (`rrule_count` oder `rrule_until` gesetzt) —
 * bei einer unbegrenzten liefe `all()` gegen `rrule`s interne Obergrenze. Der
 * einzige Aufrufer, `consumedBefore` in `recurrence.ts`, ruft es ausschließlich
 * für gezählte Serien.
 */
export function allOccurrences(row: EventRow): Date[] {
  const rule = buildFloatingRule(row);
  if (!rule) return [new Date(row.start_at)];
  return rule.all().map((d) => floatingToInstant(d, row.timezone));
}
