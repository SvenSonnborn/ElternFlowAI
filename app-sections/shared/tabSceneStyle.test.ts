import { describe, expect, test } from "bun:test";

import { tabSceneStyle } from "./tabSceneStyle";

describe("tabSceneStyle", () => {
  test("auf Web ist eine nicht fokussierte Szene unsichtbar", () => {
    expect(tabSceneStyle({ os: "web", routeKey: "a", focusedRouteKey: "b" })).toEqual({
      visibility: "hidden",
    });
  });

  test("die fokussierte Szene bekommt keinen Stil", () => {
    expect(tabSceneStyle({ os: "web", routeKey: "a", focusedRouteKey: "a" })).toBeUndefined();
  });

  test("nativ wird nie etwas versteckt", () => {
    expect(tabSceneStyle({ os: "ios", routeKey: "a", focusedRouteKey: "b" })).toBeUndefined();
    expect(tabSceneStyle({ os: "android", routeKey: "a", focusedRouteKey: "b" })).toBeUndefined();
  });

  test("ohne bekannte fokussierte Route bleibt jede Szene sichtbar", () => {
    expect(tabSceneStyle({ os: "web", routeKey: "a", focusedRouteKey: undefined })).toBeUndefined();
  });
});
