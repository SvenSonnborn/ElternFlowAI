import { describe, expect, test } from "bun:test";

import type { EventWithRelations } from "./expand";

import { occurrenceVersion } from "./version";

function row(exceptions: EventWithRelations["event_exceptions"]): EventWithRelations {
  return {
    id: "evt-1",
    family_id: "fam-1",
    type_id: "type-1",
    child_id: null,
    parent_id: null,
    title: "Zahnarzt",
    description: null,
    location: null,
    start_at: "2026-06-15T15:00:00.000Z",
    end_at: "2026-06-15T16:00:00.000Z",
    all_day: false,
    rrule_freq: "weekly",
    rrule_interval: 1,
    rrule_byweekday: [1],
    rrule_until: null,
    rrule_count: null,
    created_by: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    event_types: null,
    event_exceptions: exceptions,
  };
}

function exception(occurrenceDate: string, updatedAt: string) {
  return {
    id: `ex-${occurrenceDate}`,
    event_id: "evt-1",
    occurrence_date: occurrenceDate,
    action: "modified" as const,
    override: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: updatedAt,
  };
}

describe("occurrenceVersion", () => {
  test("ohne Exception ist nur der Master-Stempel drin", () => {
    expect(occurrenceVersion(row(null), "2026-06-15")).toBe("2026-06-01T10:00:00.000Z|-");
  });

  test("eine leere Exception-Liste verhält sich wie keine", () => {
    expect(occurrenceVersion(row([]), "2026-06-15")).toBe("2026-06-01T10:00:00.000Z|-");
  });

  test("die Exception an genau diesem Datum zählt mit", () => {
    const rows = row([exception("2026-06-15", "2026-06-02T09:00:00.000Z")]);
    expect(occurrenceVersion(rows, "2026-06-15")).toBe(
      "2026-06-01T10:00:00.000Z|2026-06-02T09:00:00.000Z",
    );
  });

  test("eine Exception an einem anderen Datum zählt NICHT mit", () => {
    // Sonst meldete das Bearbeiten des 15. einen Konflikt, weil jemand den
    // 22. geändert hat — ein Fehlalarm, der häufiger wäre als der echte Fall.
    const rows = row([exception("2026-06-22", "2026-06-02T09:00:00.000Z")]);
    expect(occurrenceVersion(rows, "2026-06-15")).toBe("2026-06-01T10:00:00.000Z|-");
  });

  test("ändert sich, wenn der Master sich ändert", () => {
    const before = occurrenceVersion(row(null), "2026-06-15");
    const after = occurrenceVersion(
      { ...row(null), updated_at: "2026-06-03T12:00:00.000Z" },
      "2026-06-15",
    );
    expect(after).not.toBe(before);
  });
});
