import { describe, expect, test } from "bun:test";

import type { EventChanges } from "@/features/calendar";

import { seriesChanges } from "./seriesChanges";

const timeZone = "Europe/Berlin";

/** Der Master am Regel-Tag: Montag, 22.06., 16:00–17:00 Berlin. */
const rule: EventChanges = {
  title: "Musikschule",
  start_at: "2026-06-22T14:00:00.000Z",
  end_at: "2026-06-22T15:00:00.000Z",
  location: null,
  description: null,
};

/** Dieselbe Occurrence, per „Nur diesen" auf Dienstag, 23.06., 18:00–19:00 verschoben. */
const opened: EventChanges = {
  title: "Musikschule Raum 2",
  start_at: "2026-06-23T16:00:00.000Z",
  end_at: "2026-06-23T17:00:00.000Z",
  location: null,
  description: null,
};

describe("seriesChanges", () => {
  test("unverändertes Formular übernimmt den Master", () => {
    expect(seriesChanges({ form: opened, opened, rule, timeZone, literal: false })).toEqual(rule);
  });

  test("nur der Titel geändert: neuer Titel, Zeiten vom Master", () => {
    expect(
      seriesChanges({ form: { ...opened, title: "Neu" }, opened, rule, timeZone, literal: false }),
    ).toEqual({
      title: "Neu",
      start_at: "2026-06-22T14:00:00.000Z",
      end_at: "2026-06-22T15:00:00.000Z",
      location: null,
      description: null,
    });
  });

  test("Uhrzeit auf 17:00–18:00 geändert: verankert am Regel-Tag, Titel vom Master", () => {
    const form = {
      ...opened,
      start_at: "2026-06-23T15:00:00.000Z",
      end_at: "2026-06-23T16:00:00.000Z",
    };

    const out = seriesChanges({ form, opened, rule, timeZone, literal: false });

    expect(out.start_at).toBe("2026-06-22T15:00:00.000Z");
    expect(out.end_at).toBe("2026-06-22T16:00:00.000Z");
    expect(out.title).toBe("Musikschule");
  });

  test("Uhrzeit fiele am Regel-Tag in die Sprunglücke: Formular-Zeiten bleiben", () => {
    // Regel-Tag So 29.03., Berlin springt um 02:00 auf 03:00; die Occurrence liegt
    // per „Nur diesen" auf Mo 30.03., gewählt wird dort 02:30–03:30. Am Regel-Tag
    // verankert würde daraus 03:30, und `anchoredChanges` schriebe 03:30 in die Serie.
    const gapRule = {
      ...rule,
      start_at: "2026-03-29T14:00:00.000Z",
      end_at: "2026-03-29T15:00:00.000Z",
    };
    const gapOpened = {
      ...opened,
      start_at: "2026-03-30T16:00:00.000Z",
      end_at: "2026-03-30T17:00:00.000Z",
    };
    const form = {
      ...gapOpened,
      start_at: "2026-03-30T00:30:00.000Z",
      end_at: "2026-03-30T01:30:00.000Z",
    };

    const out = seriesChanges({ form, opened: gapOpened, rule: gapRule, timeZone, literal: false });

    expect(out.start_at).toBe(form.start_at);
    expect(out.end_at).toBe(form.end_at);
  });

  test("nur das Datum geändert zählt nicht", () => {
    const form = {
      ...opened,
      start_at: "2026-06-24T16:00:00.000Z",
      end_at: "2026-06-24T17:00:00.000Z",
    };

    expect(seriesChanges({ form, opened, rule, timeZone, literal: false })).toEqual(rule);
  });

  test("literal, unverändertes Formular übernimmt den Master", () => {
    expect(seriesChanges({ form: opened, opened, rule, timeZone, literal: true })).toEqual(rule);
  });

  test("literal, Datum geändert: Formular-Zeiten, Titel vom Master", () => {
    const form = {
      ...opened,
      start_at: "2026-06-24T16:00:00.000Z",
      end_at: "2026-06-24T17:00:00.000Z",
    };

    const out = seriesChanges({ form, opened, rule, timeZone, literal: true });

    expect(out.start_at).toBe("2026-06-24T16:00:00.000Z");
    expect(out.end_at).toBe("2026-06-24T17:00:00.000Z");
    expect(out.title).toBe("Musikschule");
  });

  test("unverschobene Occurrence, Titel geändert: neuer Titel, Zeiten vom Master", () => {
    const out = seriesChanges({
      form: { ...rule, title: "Neu" },
      opened: rule,
      rule,
      timeZone,
      literal: false,
    });

    expect(out).toEqual({ ...rule, title: "Neu" });
  });
});
