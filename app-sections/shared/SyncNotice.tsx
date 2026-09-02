import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import { Card, Text } from "@/design-system/ui";
import { useRealtimeStatusStore } from "@/features/realtime";

import { Icon } from "./Icon";

/**
 * Sagt, dass der Live-Kanal seit über zehn Sekunden weg ist — und damit, dass
 * die angezeigten Termine veraltet sein können.
 *
 * Rendert `null`, solange die Verbindung steht; die Schwelle selbst liegt nicht
 * hier, sondern in `useFamilyRealtime` (ein Timer für die ganze App statt einer
 * pro anzeigendem Screen, siehe `degradedDelayMs`).
 *
 * Bewusst nicht interaktiv und bewusst kein Overlay: Es gibt nichts, was der
 * Nutzer tun könnte — der Realtime-Client verbindet von selbst neu, und
 * `patterns/calendar.md` kennt für diesen Zustand kein Muster. Die Zeile
 * benutzt deshalb ausschließlich vorhandene Primitives.
 */
export function SyncNotice() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const degraded = useRealtimeStatusStore((state) => state.degraded);

  if (!degraded) return null;

  return (
    <Card variant="tinted" tint="warning" className="mb-3 flex-row items-start gap-3">
      <View className="pt-0.5">
        <Icon name="alert-triangle" size={18} color={theme.warning} />
      </View>
      <View className="flex-1">
        <Text variant="listTitle">{t("sync.offline.title")}</Text>
        <Text variant="meta" tone="inkSecondary">
          {t("sync.offline.hint")}
        </Text>
      </View>
    </Card>
  );
}
