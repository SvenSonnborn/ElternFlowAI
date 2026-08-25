import { describe, expect, it } from "bun:test";

import { buildAvatarRow, type AvatarChild, type AvatarParent } from "./avatarRow";

function parent(p: Partial<AvatarParent>): AvatarParent {
  return { id: "p", name: "Anna Becker", color: "#7DB6A8", created_at: "2026-01-01", ...p };
}

function child(c: Partial<AvatarChild>): AvatarChild {
  return { id: "c", name: "Ben", color: "#5BB0E0", created_at: "2026-01-01", ...c };
}

describe("buildAvatarRow", () => {
  it("returns nothing for a family without members", () => {
    expect(buildAvatarRow([], [])).toEqual({ visible: [], overflow: 0 });
  });

  it("lists parents before children", () => {
    const row = buildAvatarRow([parent({ id: "p1" })], [child({ id: "c1" })]);
    expect(row.visible.map((e) => e.id)).toEqual(["p1", "c1"]);
    expect(row.visible.map((e) => e.kind)).toEqual(["parent", "child"]);
  });

  it("orders each group by creation date, oldest first", () => {
    const row = buildAvatarRow(
      [
        parent({ id: "late", created_at: "2026-03-01" }),
        parent({ id: "early", created_at: "2026-01-01" }),
      ],
      [
        child({ id: "youngest", created_at: "2026-05-01" }),
        child({ id: "oldest", created_at: "2026-02-01" }),
      ],
    );
    expect(row.visible.map((e) => e.id)).toEqual(["early", "late", "oldest", "youngest"]);
  });

  it("falls back to the id when two members share a creation date", () => {
    // Zeilen aus derselben Transaktion teilen sich `now()`; ohne zweiten
    // Schlüssel entschiede die Reihenfolge der Query, die keine garantiert.
    const ids = (rows: ReturnType<typeof buildAvatarRow>) => rows.visible.map((e) => e.id);
    const a = child({ id: "aaa", created_at: "2026-02-01" });
    const b = child({ id: "bbb", created_at: "2026-02-01" });
    expect(ids(buildAvatarRow([], [a, b]))).toEqual(["aaa", "bbb"]);
    expect(ids(buildAvatarRow([], [b, a]))).toEqual(["aaa", "bbb"]);
  });

  it("carries name and color through unchanged", () => {
    const row = buildAvatarRow([], [child({ name: "Mia", color: "#F47AA8" })]);
    expect(row.visible[0]).toMatchObject({ name: "Mia", color: "#F47AA8" });
  });

  it("shows every member while the family fits the limit", () => {
    const parents = [parent({ id: "p1" }), parent({ id: "p2" })];
    const children = [child({ id: "c1" }), child({ id: "c2" }), child({ id: "c3" })];
    const row = buildAvatarRow(parents, children);
    expect(row.visible).toHaveLength(5);
    expect(row.overflow).toBe(0);
  });

  it("truncates to the limit and counts the rest as overflow", () => {
    const parents = [parent({ id: "p1" }), parent({ id: "p2" })];
    const children = [1, 2, 3, 4, 5].map((n) => child({ id: `c${n}` }));
    const row = buildAvatarRow(parents, children);
    expect(row.visible.map((e) => e.id)).toEqual(["p1", "p2", "c1", "c2", "c3"]);
    expect(row.overflow).toBe(2);
  });

  it("accepts a custom limit", () => {
    const children = [1, 2, 3].map((n) => child({ id: `c${n}` }));
    expect(buildAvatarRow([], children, 2)).toMatchObject({ overflow: 1 });
  });
});
