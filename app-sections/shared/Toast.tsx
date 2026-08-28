import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, View } from "react-native";

import { DS, type Theme } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

import type { ToastEntry, ToastVariant } from "./toastStore";

import { Icon, type IconName } from "./Icon";

const spec = DS.components.toast;

/**
 * Farbrolle und Glyph je Variante. Die Spezifikation nennt sie als CSS-Namen
 * (`var(--success)`), hier stehen die Theme-Schlüssel — dieselbe Rolle, nur
 * so, wie `useTheme()` sie ausgibt.
 */
const VARIANT: Record<ToastVariant, { accent: keyof Theme; tint: keyof Theme; icon: IconName }> = {
  success: { accent: "success", tint: "successSoft", icon: "check" },
  error: { accent: "danger", tint: "dangerSoft", icon: "alert-triangle" },
  info: { accent: "primaryStrong", tint: "primarySoft", icon: "sparkles" },
};

/**
 * `true`, wenn das System „Bewegung reduzieren" gesetzt hat — `null`, solange
 * es noch nicht geantwortet hat.
 *
 * Der Unterschied ist nicht kosmetisch: mit `false` als Startwert liefe die
 * Einblend-Animation für genau die Nutzer einmal voll durch, die sie
 * abbestellt haben, weil die Abfrage asynchron ist.
 */
function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduce(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

interface ToastProps {
  entry: ToastEntry;
  /** Wird gerufen, **nachdem** die Ausblend-Animation gelaufen ist. */
  onDismiss: (id: string) => void;
}

/**
 * Eine Toast-Zeile nach [patterns/toast.md](../../patterns/toast.md).
 *
 * Die Komponente hält zwei Dinge selbst, die sonst niemand halten könnte:
 * ihren Auto-Dismiss-Timer und ihre Ausblend-Animation. Deshalb meldet sie das
 * Ende erst über `onDismiss` — wer statt dessen `useToast().dismiss(id)` ruft,
 * entfernt den Eintrag sofort aus dem Store und überspringt das Ausblenden.
 */
export function Toast({ entry, onDismiss }: ToastProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const reduceMotion = useReduceMotion();
  const v = VARIANT[entry.variant];
  const accent = theme[v.accent];
  const tint = theme[v.tint];

  // 0 = ausgeblendet, 1 = sichtbar. Ein Wert für Opazität und Versatz, damit
  // beide nicht auseinanderlaufen können. Lazy `useState` statt `useRef`: der
  // Wert wird im Style gelesen, und `react-hooks/refs` verbietet `.current`
  // während des Renderns — die State-Variante ist genauso stabil.
  const [progress] = useState(() => new Animated.Value(0));
  // Ein einmal gestartetes Ausblenden darf der Timer nicht erneut anstoßen.
  const leaving = useRef(false);
  // Die Einblend-Animation läuft einmal, nicht bei jeder Änderung der
  // Bewegungs-Einstellung.
  const entered = useRef(false);

  const enterFrom = entry.position === "top" ? -8 : 8;

  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: reduceMotion === true ? 0 : 120,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => onDismiss(entry.id));
  }, [progress, reduceMotion, onDismiss, entry.id]);

  // Genau einmal pro Toast, und erst wenn die Bewegungs-Einstellung bekannt
  // ist. Ohne die Sperre würde jedes spätere `reduceMotionChanged` das Effect
  // erneut ausführen — fiele das in das Ausblenden, stünde der Toast wieder
  // auf `toValue: 1`, während `leaving` schon gesetzt ist, und ließe sich nie
  // mehr schließen.
  useEffect(() => {
    if (reduceMotion === null || entered.current) return;
    entered.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 0 : 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion]);

  useEffect(() => {
    if (entry.durationMs == null) return;
    const timer = setTimeout(close, entry.durationMs);
    return () => clearTimeout(timer);
  }, [entry.durationMs, close]);

  // `accessibilityLiveRegion` ist in React Native Android-only; auf iOS meldet
  // VoiceOver eine frisch eingehängte View von sich aus nicht. Ohne diese
  // Ansage wäre der Toast dort stumm — und ein Toast, den niemand hört, ist
  // für Screenreader-Nutzer gar kein Toast. Auf Android bleibt es bei der
  // Live-Region, sonst käme die Meldung doppelt.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AccessibilityInfo.announceForAccessibility(
      entry.message ? `${entry.title}. ${entry.message}` : entry.title,
    );
  }, [entry.title, entry.message]);

  const isError = entry.variant === "error";

  return (
    <Animated.View
      accessibilityRole={isError ? "alert" : undefined}
      accessibilityLiveRegion={isError ? "assertive" : "polite"}
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [enterFrom, 0],
            }),
          },
        ],
        minHeight: spec.base.minHeight,
        borderRadius: spec.base.radius,
        backgroundColor: theme.card,
        paddingVertical: spec.base.paddingY,
        paddingHorizontal: spec.base.paddingX,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spec.base.gap,
        overflow: "hidden",
        // Der Ring ersetzt den 1px-Rahmen (siehe shadow.ring im Bundle); auf
        // Native trägt `elevation` den Schatten, auf Web die Box-Shadow-Kette.
        borderWidth: 1,
        borderColor: theme.line,
        ...Platform.select({
          android: { elevation: 6 },
          default: {
            shadowColor: "#2C3E50",
            shadowOpacity: 0.12,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
          },
        }),
      }}
    >
      {/* Akzent-Schiene an der Führungskante, innen abgerundet */}
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: spec.base.rail.width,
          backgroundColor: accent,
          borderTopRightRadius: spec.base.rail.radius,
          borderBottomRightRadius: spec.base.rail.radius,
        }}
      />

      <View
        style={{
          width: spec.icon.size,
          height: spec.icon.size,
          borderRadius: spec.icon.radius,
          backgroundColor: tint,
          alignItems: "center",
          justifyContent: "center",
          marginLeft: 2,
        }}
      >
        <Icon name={v.icon} size={spec.icon.glyphSize} color={accent} />
      </View>

      <View style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        <Text variant="listTitle" tone="ink" style={{ fontSize: spec.title.fontSize }}>
          {entry.title}
        </Text>
        {entry.message ? (
          <Text
            variant="meta"
            tone="inkSecondary"
            style={{ fontSize: spec.message.fontSize, marginTop: spec.message.marginTop }}
          >
            {entry.message}
          </Text>
        ) : null}
        {entry.action ? (
          <Pressable
            onPress={entry.action.onPress}
            accessibilityRole="button"
            // Sichtbar bleiben die 28 px aus dem Design, tastbar sind 44:
            // `hitSlop` scheidet aus, weil `Pressable` es auf react-native-web
            // ignoriert (dieselbe Begründung wie in `SectionHeader`). Die Höhe
            // tragen die 28 + 2×8; die Breite braucht `minWidth`, weil ein
            // kurzes Label wie „OK" sonst auf ~37 px zusammenfällt.
            style={{ alignSelf: "flex-start", minWidth: 44, paddingVertical: 8, marginTop: 1 }}
          >
            <View
              style={{
                height: spec.action.height,
                paddingHorizontal: spec.action.paddingX,
                borderRadius: spec.action.radius,
                backgroundColor: tint,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text variant="pill" style={{ color: accent, fontSize: spec.action.fontSize }}>
                {entry.action.label}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </View>

      {/* 24px-Glyph in einer 44er-Trefferfläche — die wächst nach oben und
          rechts ins Padding, der Knopf bleibt optisch, wo das Design ihn setzt. */}
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={t("action.close")}
        style={{
          width: 44,
          height: 44,
          marginTop: -10,
          marginRight: -10,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="x" size={spec.close.glyphSize} color={theme.inkTertiary} />
      </Pressable>
    </Animated.View>
  );
}
