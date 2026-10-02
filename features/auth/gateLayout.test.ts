import { describe, expect, test } from "bun:test";

import type { RoutePath } from "./decideRoute";
import type { SessionStatus } from "./session";

import { gateLayout, type GateLayoutInput } from "./gateLayout";

const TARGETS: (RoutePath | null)[] = [null, "/(auth)/login", "/(onboarding)/2", "/(tabs)"];

function input(partial: Partial<GateLayoutInput>): GateLayoutInput {
  return {
    sessionStatus: "unauthenticated",
    parentIsLoading: false,
    target: null,
    navigatorMounted: false,
    ...partial,
  };
}

describe("gateLayout — Kaltstart (Navigator noch nicht gemountet)", () => {
  test("Sitzung lädt → Splash statt Kinder", () => {
    expect(gateLayout(input({ sessionStatus: "loading" }))).toEqual({ kind: "splash" });
  });

  test("angemeldet + Parent lädt → Splash statt Kinder", () => {
    expect(gateLayout(input({ sessionStatus: "authenticated", parentIsLoading: true }))).toEqual({
      kind: "splash",
    });
  });

  test("abgemeldet + Ziel → Redirect ersetzt die Kinder (geschützte Screens dürfen nicht mounten)", () => {
    expect(
      gateLayout(input({ sessionStatus: "unauthenticated", target: "/(auth)/login" })),
    ).toEqual({ kind: "redirect", href: "/(auth)/login" });
  });

  test("angemeldet + Ziel Tabs (Kaltstart mit Sitzung auf /login) → Redirect ersetzt die Kinder", () => {
    expect(gateLayout(input({ sessionStatus: "authenticated", target: "/(tabs)" }))).toEqual({
      kind: "redirect",
      href: "/(tabs)",
    });
  });

  test("angemeldet, kein Ziel → Kinder ohne Redirect und ohne Deckfläche", () => {
    expect(gateLayout(input({ sessionStatus: "authenticated", target: null }))).toEqual({
      kind: "app",
      redirect: null,
      cover: false,
    });
  });
});

describe("gateLayout — Navigator gemountet", () => {
  test("angemeldet + Parent lädt (Login-Übergang) → Kinder bleiben, Deckfläche, kein Redirect", () => {
    expect(
      gateLayout(
        input({ sessionStatus: "authenticated", parentIsLoading: true, navigatorMounted: true }),
      ),
    ).toEqual({ kind: "app", redirect: null, cover: true });
  });

  test("Ziel gesetzt → Kinder bleiben, Redirect daneben, Deckfläche", () => {
    expect(
      gateLayout(
        input({ sessionStatus: "authenticated", target: "/(tabs)", navigatorMounted: true }),
      ),
    ).toEqual({ kind: "app", redirect: "/(tabs)", cover: true });
  });

  test("abgemeldet + Ziel Login (Abmelden) → Redirect ersetzt die Kinder trotz Mount", () => {
    expect(
      gateLayout(
        input({
          sessionStatus: "unauthenticated",
          target: "/(auth)/login",
          navigatorMounted: true,
        }),
      ),
    ).toEqual({ kind: "redirect", href: "/(auth)/login" });
  });

  test("abgemeldet, schon in der Auth-Gruppe (kein Ziel) → Kinder ohne Redirect und ohne Deckfläche", () => {
    expect(
      gateLayout(input({ sessionStatus: "unauthenticated", target: null, navigatorMounted: true })),
    ).toEqual({ kind: "app", redirect: null, cover: false });
  });

  test("Sitzung lädt erneut → Kinder bleiben, Deckfläche", () => {
    expect(gateLayout(input({ sessionStatus: "loading", navigatorMounted: true }))).toEqual({
      kind: "app",
      redirect: null,
      cover: true,
    });
  });

  test("Ruhezustand (kein Warten, kein Ziel) → Kinder ohne Redirect und ohne Deckfläche", () => {
    expect(
      gateLayout(input({ sessionStatus: "authenticated", target: null, navigatorMounted: true })),
    ).toEqual({ kind: "app", redirect: null, cover: false });
  });

  test("Invariante: mit Sitzung (oder ladend) hängt keine Kombination die Kinder wieder aus", () => {
    const statuses: SessionStatus[] = ["loading", "authenticated"];

    for (const sessionStatus of statuses) {
      for (const parentIsLoading of [false, true]) {
        for (const target of TARGETS) {
          const layout = gateLayout({
            sessionStatus,
            parentIsLoading,
            target,
            navigatorMounted: true,
          });
          expect(layout.kind).toBe("app");
          if (layout.kind === "app") expect(layout.redirect).toBe(target);
        }
      }
    }
  });

  test("Invariante: ohne Sitzung ersetzt jedes Ziel die Kinder — gemountet oder nicht", () => {
    for (const navigatorMounted of [false, true]) {
      for (const parentIsLoading of [false, true]) {
        for (const target of TARGETS) {
          if (target === null) continue;
          expect(
            gateLayout({
              sessionStatus: "unauthenticated",
              parentIsLoading,
              target,
              navigatorMounted,
            }),
          ).toEqual({ kind: "redirect", href: target });
        }
      }
    }
  });
});
