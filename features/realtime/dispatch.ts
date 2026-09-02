import type { QueryKey } from "@tanstack/react-query";

import { calendarKeys } from "@/features/calendar/queries";
import { calendarInvalidationKeys } from "@/features/calendar/realtimeKeys";

import type { FamilyChange } from "./normalize";

import { mergeInvalidationKeys } from "./coalesce";

/**
 * Die **einzige** Datei der Sync-Schicht, die Features kennt.
 *
 * Der Kanal ist familienweit (ADR-030 Decision 2); welche Query-Keys eine
 * Änderung veraltet, weiß nur das besitzende Feature. Die Alternative — eine
 * Registry, bei der jedes Feature sich beim Modul-Laden anmeldet — wäre ein
 * impliziter Seiteneffekt beim Import und in Tests schwerer zu fassen als
 * dieser explizite Aufruf. Aufgaben oder Essen anzuschließen heißt: eine Zeile
 * mehr in `MAPPERS`.
 */
const MAPPERS: ((change: FamilyChange) => QueryKey[])[] = [calendarInvalidationKeys];

/**
 * Fasst ein Sammelfenster eingehender Änderungen zu den Query-Keys zusammen,
 * die dafür zu invalidieren sind — dedupliziert über {@link mergeInvalidationKeys}.
 */
export function invalidationKeysFor(changes: readonly FamilyChange[]): QueryKey[] {
  return mergeInvalidationKeys(changes.flatMap((change) => MAPPERS.flatMap((map) => map(change))));
}

/**
 * Was nach einer Verbindungsunterbrechung nachzuladen ist.
 *
 * Verpasste Broadcasts werden nicht nachgeliefert, also lässt sich nicht
 * bestimmen, *was* fehlt — nur, *was hätte kommen können*. Das ist die
 * Vereinigung der Wurzeln, die überhaupt aus einem Broadcast entstehen können,
 * und ausdrücklich nicht `calendarKeys.all`.
 */
export function reconnectInvalidationKeys(): QueryKey[] {
  return mergeInvalidationKeys([calendarKeys.eventsRoot, calendarKeys.oneRoot]);
}
