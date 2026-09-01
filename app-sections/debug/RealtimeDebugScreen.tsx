/* eslint-disable i18next/no-literal-string -- Dev-Werkzeug: Der Screen wird nur
   unter `__DEV__` verlinkt und nie ausgeliefert. Die i18n-Kataloge tragen die
   Designer-Copy aus docs/COPY.md; ein Debug-Screen gehört dort nicht hinein
   (ADR-028, Decision 8). */
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { Icon, Pill, type PillTone } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { useCurrentParent } from "@/features/auth";
import {
  calendarChannelTopic,
  useCalendarRealtime,
  type CalendarChange,
  type CalendarRealtimeStatus,
} from "@/features/calendar";

/** Genug, um eine Testreihe zu überblicken, wenig genug für eine flüssige Liste. */
const MAX_ENTRIES = 50;

const statusTone: Record<CalendarRealtimeStatus, PillTone> = {
  idle: "neutral",
  subscribing: "warn",
  subscribed: "success",
  timedOut: "warn",
  error: "danger",
  closed: "ink",
};

/**
 * `receivedAt` allein taugt nicht als React-Key — zwei Ereignisse teilen sich
 * ohne Weiteres dieselbe Millisekunde.
 */
interface LoggedChange extends CalendarChange {
  seq: number;
}

/**
 * Fenster in den Realtime-Strom, das die Übertragungsstrecke sichtbar macht,
 * bevor Issue #51 sie an `useFamilyEvents` hängt. Bewusst roh: Zeitstempel,
 * Tabelle, Typ, Ids — keine Aufbereitung, die einen Fehler verstecken könnte.
 */
export function RealtimeDebugScreen() {
  const { theme } = useTheme();
  const parentQuery = useCurrentParent();
  const familyId = parentQuery.data?.family_id ?? null;

  const [changes, setChanges] = useState<LoggedChange[]>([]);
  const seq = useRef(0);

  const append = useCallback((change: CalendarChange) => {
    seq.current += 1;
    const entry: LoggedChange = { ...change, seq: seq.current };
    setChanges((prev) => [entry, ...prev].slice(0, MAX_ENTRIES));
  }, []);

  const { status } = useCalendarRealtime(familyId, append);

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
          {familyId ? calendarChannelTopic(familyId) : "Familie noch nicht geladen"}
        </Text>
        <Text variant="meta" tone="inkTertiary">
          {`${String(changes.length)} von max. ${String(MAX_ENTRIES)} Ereignissen`}
        </Text>
      </Card>

      <Card variant="tinted" tint="warning" className="mt-3">
        <Text variant="meta">
          Lösch-Ereignisse laufen ohne RLS-Prüfung ein: Sie tragen nur die Row-Id, keine Event-Id —
          und sie können aus fremden Familien stammen. Ein leeres „event“ ist also kein Fehler
          dieses Screens.
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
          onPress={() => setChanges([])}
        />
      </View>

      {changes.length === 0 ? (
        <Card className="mt-2">
          <Text variant="meta" tone="inkTertiary">
            Noch nichts empfangen. Änderungen an events oder event_exceptions dieser Familie
            erscheinen hier, sobald die Publikation supabase_realtime beide Tabellen führt.
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
                {new Date(change.receivedAt).toLocaleTimeString("de-DE")}
              </Text>
              <View className="flex-1">
                <Text variant="listTitle">{`${change.table} · ${change.type}`}</Text>
                <Text variant="meta" tone="inkSecondary" numberOfLines={1}>
                  {`row ${change.rowId ?? "—"} · event ${change.eventId ?? "—"}`}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
