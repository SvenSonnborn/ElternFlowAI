/**
 * Baut die Avatar-Reihe des Dashboards aus Eltern + Kindern der Familie.
 *
 * Eltern zuerst, dann Kinder, innerhalb der Gruppe nach `created_at`. Die
 * Queries in `features/auth/familyQueries.ts` haben kein `ORDER BY`, Postgres
 * darf die Zeilen also zwischen zwei Fetches umsortieren — beim Schnitt auf
 * `limit` entscheidet die Reihenfolge aber, wer aus der Reihe fällt. Sortiert
 * wird deshalb hier statt in der Query, die an fünf weiteren Screens hängt.
 */

export interface AvatarParent {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export type AvatarChild = AvatarParent;

export interface AvatarEntry {
  kind: "parent" | "child";
  id: string;
  name: string;
  color: string;
}

export interface AvatarRow {
  visible: AvatarEntry[];
  overflow: number;
}

export const AVATAR_ROW_LIMIT = 5;

function byCreatedAt<T extends { id: string; created_at: string }>(rows: readonly T[]): T[] {
  // Kopie: `rows` ist die Query-Cache-Instanz von React Query, `sort` mutiert.
  // Die `id` bricht Gleichstände: Zeilen aus derselben Transaktion teilen sich
  // `now()`, und `sort` behielte dann die Reihenfolge der Query — die keine
  // garantiert (s. o.), womit bei > `limit` Mitgliedern ein anderes Gesicht im
  // Overflow landen könnte.
  return [...rows].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

export function buildAvatarRow(
  parents: readonly AvatarParent[],
  children: readonly AvatarChild[],
  limit: number = AVATAR_ROW_LIMIT,
): AvatarRow {
  const entries: AvatarEntry[] = [
    ...byCreatedAt(parents).map((p) => ({
      kind: "parent" as const,
      id: p.id,
      name: p.name,
      color: p.color,
    })),
    ...byCreatedAt(children).map((c) => ({
      kind: "child" as const,
      id: c.id,
      name: c.name,
      color: c.color,
    })),
  ];

  return {
    visible: entries.slice(0, limit),
    overflow: Math.max(0, entries.length - limit),
  };
}
