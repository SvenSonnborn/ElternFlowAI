/**
 * Tests importieren weiterhin die Einzelmodule (`./dispatch`, `./subscribe`, …),
 * nie diesen Barrel: `useFamilyRealtime` zieht über `@/features/auth` →
 * `AuthGate` → `ThemeProvider` die NativeWind-Runtime herein, an der
 * `bun test` scheitert — ein `import`/`require` dieses Barrels bricht dort,
 * auch wenn nur `dispatch`- oder `subscribe`-Exporte gebraucht werden.
 */
export { familyTopic, FAMILY_CHANNEL_PREFIX } from "./topic";
export { normalizeBroadcast, type FamilyChange, type FamilyChangeType } from "./normalize";
export { toRealtimeStatus, useRealtimeStatusStore, type RealtimeStatus } from "./status";
export { subscribeToFamilyChanges, type SubscribeToFamilyChangesArgs } from "./subscribe";
export { COALESCE_WINDOW_MS, mergeInvalidationKeys } from "./coalesce";
export { DEGRADED_AFTER_MS, degradedDelayMs, shouldRefetchAfterResubscribe } from "./reconnect";
export { invalidationKeysFor, reconnectInvalidationKeys } from "./dispatch";
export { useFamilyRealtime } from "./useFamilyRealtime";
