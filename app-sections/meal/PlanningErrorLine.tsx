import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Platform } from "react-native";

import type { MealErrorKey } from "@/features/meals";

import { Text } from "@/design-system/ui";

/**
 * Die Fehlerzeile der Essens-Sheets (`/meal/pick`, `/meal/schedule`) — dort
 * statt eines Toasts, weil ein Toast aus einem `formSheet` auf iOS unter dem
 * Sheet liegt (docs/TODO.md, „Toasts liegen hinter nativen Modal-Screens") und
 * das Sheet nach einem Fehler offen bleibt.
 *
 * `accessibilityRole="alert"` wird auf Web zu `role="alert"`,
 * `accessibilityLiveRegion` wirkt nur auf Android. VoiceOver meldet eine frisch
 * eingehängte Zeile von sich aus nicht, deshalb sagt sie sich auf iOS selbst
 * an — derselbe Weg wie `Toast` in app-sections/shared/Toast.tsx; der Toast,
 * den diese Zeile ersetzt, war dort trotz Verdeckung zu hören.
 */
export function PlanningErrorLine({ error }: { error: MealErrorKey | null }) {
  const { t } = useTranslation();
  const message = error ? t(error) : null;

  useEffect(() => {
    if (Platform.OS !== "ios" || !message) return;
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  if (!message) return null;
  return (
    <Text variant="body" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}
