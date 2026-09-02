import { describe, expect, test } from "bun:test";

import { familyTopic } from "./topic";

describe("familyTopic", () => {
  test("bildet ein Topic pro Familie", () => {
    // Fest verdrahtetes Literal, nicht die Konstante: Die RLS-Policy auf
    // realtime.messages matcht den Topic-Namen wörtlich gegen den Output aus
    // public.broadcast_family_change(). Ändert sich FAMILY_CHANNEL_PREFIX ohne
    // Datenbankupdate, muss der Test schreien.
    expect(familyTopic("fam-1")).toBe("family:fam-1");
  });

  test("trennt zwei Familien", () => {
    expect(familyTopic("a")).not.toBe(familyTopic("b"));
  });
});
