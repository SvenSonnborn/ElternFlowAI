/* eslint-disable i18next/no-literal-string -- Dev-Werkzeug: Der Screen wird nur
   unter `__DEV__` verlinkt und nie ausgeliefert. Die i18n-Kataloge tragen die
   Designer-Copy aus docs/COPY.md; ein Debug-Screen gehört dort nicht hinein
   (ADR-028, Decision 8). */
import { Redirect, router } from "expo-router";
import { Pressable, View } from "react-native";

import { Icon, Pill, type PillTone } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { useCurrentParent } from "@/features/auth";
import {
  familyTopic,
  useRealtimeStatusStore,
  DEBUG_CHANGE_LOG_LIMIT,
  type RealtimeStatus,
} from "@/features/realtime";

const statusTone: Record<RealtimeStatus, PillTone> = {
  idle: "neutral",
  subscribing: "warn",
  subscribed: "success",
  timedOut: "warn",
  error: "danger",
  closed: "ink",
};

/**
 * Sperrt den Screen außerhalb von Entwicklungs-Builds.
 *
 * Der Guard sitzt hier und **nicht** am `<Stack.Screen>` in `app/_layout.tsx`:
 * Expo Router registriert Routen aus dem Dateisystem, die Deklaration im Layout
 * setzt nur Optionen. Ohne diesen Guard wäre `/debug/realtime` im Release-Build
 * per Deep-Link (`elternflow://debug/realtime`) und im Web-Bundle per URL
 * erreichbar — ein Screen ohne Design-Review, mit Entwickler-Copy und ohne
 * i18n. Eigene Komponente statt eines frühen `return` im Screen selbst, damit
 * die Hooks unterhalb unbedingt laufen (Rules of Hooks).
 */
export function RealtimeDebugScreen() {
  if (!__DEV__) return <Redirect href="/" />;
  return <RealtimeDebugContent />;
}

/**
 * Fenster in den Realtime-Strom: Zeigt die Ereignisse, die der eine
 * Familien-Kanal aus `useFamilyRealtime` (gemountet in `ThemedStack`, ADR-030
 * Decision 4) empfangen hat — #51 hängt seit Task 6 dort und bewusst nicht an
 * `useFamilyEvents`. Bewusst roh: Zeitstempel, Tabelle, Typ, Ids — keine
 * Aufbereitung, die einen Fehler verstecken könnte.
 */
function RealtimeDebugContent() {
  const { theme } = useTheme();
  const parentQuery = useCurrentParent();
  const familyId = parentQuery.data?.family_id ?? null;

  // Status und Liste kommen aus derselben Quelle — dem einen App-Kanal, den
  // `useFamilyRealtime` in `ThemedStack` hält. Der Screen öffnet keinen
  // eigenen mehr: `subscribeToFamilyChanges` entsorgt seit Task 6 jeden
  // Altkanal mit passendem `subTopic`, ein zweites Abo auf demselben Topic
  // risse also den lebenden App-Kanal ein.
  const status = useRealtimeStatusStore((s) => s.status);
  const changes = useRealtimeStatusStore((s) => s.recentChanges);
  const clearChanges = useRealtimeStatusStore((s) => s.clearChanges);

  return (
    <Screen scroll>
      <View className="flex-row items-center gap-1 pb-3 pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          className="h-11 w-11 items-center justify-center rounded-xl active:opacity-70"
        >
          <Icon name="chevron-left" size={20} color={theme.ink} />
        </Pressable>
        <Text variant="h1" className="flex-1">
          Realtime-Debug
        </Text>
      </View>

      <Card className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text variant="listTitle">Kanal</Text>
          <Pill label={status} tone={statusTone[status]} />
        </View>
        <Text variant="meta" tone="inkSecondary" numberOfLines={1}>
          {familyId ? familyTopic(familyId) : "Familie noch nicht geladen"}
        </Text>
        <Text variant="meta" tone="inkTertiary">
          {`${String(changes.length)} von max. ${String(DEBUG_CHANGE_LOG_LIMIT)} Ereignissen`}
        </Text>
      </Card>

      <Card variant="tinted" tint="warning" className="mt-3">
        <Text variant="meta">
          Kein eigener Kanal mehr: Diese Liste liest mit, was der eine App-Kanal empfangen hat, und
          füllt sich nur unter __DEV__. Ereignisse tragen seit ADR-030 auch bei DELETE ihre Zeile —
          fremde Familien erreichen dieses Topic gar nicht mehr.
        </Text>
      </Card>

      <View className="mt-5 flex-row items-center justify-between">
        <Text variant="eyebrow" tone="inkTertiary">
          Ereignisse
        </Text>
        <Button
          label="Leeren"
          variant="soft"
          tone="neutral"
          size="md"
          disabled={changes.length === 0}
          onPress={clearChanges}
        />
      </View>

      {changes.length === 0 ? (
        <Card className="mt-2">
          <Text variant="meta" tone="inkTertiary">
            Noch nichts empfangen. Änderungen an events oder event_exceptions dieser Familie
            erscheinen hier, sobald die Trigger aus 20260902065203_realtime_family_broadcast.sql
            angewendet sind.
          </Text>
        </Card>
      ) : (
        <Card className="mt-2 p-0 px-4">
          {changes.map((change, index) => (
            <View
              key={change.seq}
              className={`flex-row items-center gap-3 py-3 ${
                index === changes.length - 1 ? "" : "border-b border-line"
              }`}
            >
              <Text variant="numeric" tone="inkTertiary">
                {/* Locale vom Gerät (kein Argument), Stundenzyklus aber fest auf
                    h23: Eine Ereignis-Liste will 14:07 lesen, nicht 2:07 PM —
                    auf einem en-US-Gerät käme sonst 12-Stundenformat heraus. Die
                    aktive App-Sprache dafür heranzuziehen hieße, i18n für einen
                    Zeitstempel in einen Screen zu ziehen, der sonst keins hat. */}
                {new Date(change.receivedAt).toLocaleTimeString(undefined, {
                  hourCycle: "h23",
                })}
              </Text>
              <View className="flex-1">
                <Text variant="listTitle">{`${change.table} · ${change.type}`}</Text>
                <Text variant="meta" tone="inkSecondary" numberOfLines={1}>
                  {`row ${change.rowId ?? "—"}`}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
