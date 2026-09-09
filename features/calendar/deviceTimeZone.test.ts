import { describe, expect, mock, test } from "bun:test";

let calendars: { timeZone: string | null }[] = [{ timeZone: "Europe/Berlin" }];

void mock.module("expo-localization", () => ({ getCalendars: () => calendars }));

// Nach dem Modul-Mock importiert — ein statischer Import würde darüber
// hochgezogen. Gleiches Muster wie in `reminders.test.ts`.
const { deviceTimeZone } = await import("./deviceTimeZone");

describe("deviceTimeZone", () => {
  test("nimmt die Zone von expo-localization", () => {
    calendars = [{ timeZone: "America/New_York" }];
    expect(deviceTimeZone()).toBe("America/New_York");
  });

  test("fällt auf Intl zurück, wenn Expo nichts liefert", () => {
    calendars = [{ timeZone: null }];
    expect(deviceTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  test("eine leere Kalenderliste wirft nicht", () => {
    calendars = [];
    expect(deviceTimeZone()).toBeTruthy();
  });
});
