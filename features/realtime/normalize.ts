/**
 * Broadcast-Nachricht → `FamilyChange`.
 *
 * Anders als unter `postgres_changes` (ADR-028) ist ein DELETE hier **kein**
 * Sonderfall: Der Trigger sieht die alte Zeile noch und schickt sie in
 * `old_record`, inklusive `family_id` und `event_id`. Genau deshalb hat
 * `FamilyChange` keine Null-Variante mehr für die zuordnende Id.
 */
export type FamilyChangeType = "INSERT" | "UPDATE" | "DELETE";

export interface FamilyChange {
  /** `TG_TABLE_NAME` aus dem Trigger. Bewusst `string`: Die Sync-Schicht kennt
   *  die Tabellen der Features nicht, die Mapper prüfen selbst. */
  table: string;
  type: FamilyChangeType;
  rowId: string | null;
  record: Record<string, unknown> | null;
  oldRecord: Record<string, unknown> | null;
  receivedAt: number;
}

function objectField(source: unknown, key: string): Record<string, unknown> | null {
  if (typeof source !== "object" || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function stringField(source: Record<string, unknown> | null, key: string): string | null {
  if (source === null) return null;
  const value = source[key];
  return typeof value === "string" ? value : null;
}

/**
 * Prüft und normalisiert eine Broadcast-Nachricht zur Laufzeit.
 *
 * Die Eingabe ist `unknown`, nicht `FamilyChange`-typisiert: Der Payload kommt
 * über das Netz aus einer Trigger-Funktion, nicht aus dem eigenen Typsystem.
 * Eine kaputte Nachricht darf den Kanal nicht abreißen lassen.
 */
export function normalizeBroadcast(
  type: FamilyChangeType,
  message: unknown,
  now: () => number = Date.now,
): FamilyChange {
  const payload = objectField(message, "payload");
  const record = objectField(payload, "record");
  const oldRecord = objectField(payload, "old_record");
  const table = stringField(payload, "table") ?? "";
  // Eine Reihenfolge für alle drei Operationen: bei INSERT/UPDATE steht die Id
  // in `record`, bei DELETE nur in `old_record`.
  const rowId = stringField(record, "id") ?? stringField(oldRecord, "id");

  return { table, type, rowId, record, oldRecord, receivedAt: now() };
}
