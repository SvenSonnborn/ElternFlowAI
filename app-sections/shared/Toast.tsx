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
 * Die Komponente hält drei Dinge selbst, die sonst niemand halten könnte:
 * ihren Auto-Dismiss-Timer, ihre Ausblend-Animation und ihren Countdown.
 * Deshalb meldet sie das Ende erst über `onDismiss` — wer statt dessen
 * `useToast().dismiss(id)` ruft, entfernt den Eintrag sofort aus dem Store und
 * überspringt das Ausblenden.
 *
 * Um die Karte liegt eine Hülle (`testID` `toast-<id>`), die beim Ausblenden
 * ihre Höhe und den Stapelabstand auf null zieht, damit der Nachbar im Stapel
 * nachrutscht statt zu springen („Exiting“ im Pattern). `onDismiss` fällt
 * erst, wenn Fade und Schrumpfen beide durch sind. Bei „Bewegung reduzieren“
 * bleibt nur der Fade, ohne Versatz und ohne Schrumpfen.
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
  // Der Countdown der Timer-Leiste, getrennt von `progress`: der eine ist das
  // Ein-/Ausblenden, der andere läuft über die volle Standzeit.
  const [countdown] = useState(() => new Animated.Value(1));
  // Ein einmal gestartetes Ausblenden darf der Timer nicht erneut anstoßen.
  const leaving = useRef(false);
  // Die Einblend-Animation läuft einmal, nicht bei jeder Änderung der
  // Bewegungs-Einstellung.
  const entered = useRef(false);
  // Die zuletzt gemessene Höhe der Hülle. Ein Ref, weil nur `close()` sie
  // liest: Eine Messung soll kein Rendern auslösen.
  const measured = useRef<number | null>(null);
  // Die Höhe, von der das Schrumpfen startet — eingefroren in `close()`. Bis
  // dahin `null`, und die Hülle trägt gar keinen Stil.
  const [collapseFrom, setCollapseFrom] = useState<number | null>(null);
  // 0 = volle Höhe, 1 = zusammengefallen. Läuft mit dem JS-Driver, weil
  // `height` und `margin` Layout-Eigenschaften sind, die der Native Driver
  // nicht animieren kann.
  const [collapse] = useState(() => new Animated.Value(0));

  const enterFrom = entry.position === "top" ? -8 : 8;

  const close = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    // Fade und Schrumpfen teilen das Timing (Spec: „in derselben Zeit wie das
    // Ausblenden“, 120 ms, ease-in).
    const exit = {
      duration: 120,
      // eslint-disable-next-line @typescript-eslint/unbound-method -- RN-Typen führen Easing-Funktionen als Methoden; Easing.js benutzt kein `this`
      easing: Easing.in(Easing.quad),
    };
    const animations = [
      Animated.timing(progress, {
        ...exit,
        toValue: 0,
        useNativeDriver: true,
      }),
    ];
    // Ohne Messung (Schließen vor dem ersten Layout) gibt es keinen Startwert;
    // dann bleibt es beim Fade, wie bei „Bewegung reduzieren“, wo das Pattern
    // das Schrumpfen ausdrücklich ausschließt.
    const from = reduceMotion === true ? null : measured.current;
    if (from != null) {
      setCollapseFrom(from);
      animations.push(
        Animated.timing(collapse, {
          ...exit,
          toValue: 1,
          useNativeDriver: false,
        }),
      );
    }
    Animated.parallel(animations).start(() => onDismiss(entry.id));
  }, [progress, collapse, reduceMotion, onDismiss, entry.id]);

  // Genau einmal pro Toast, und erst wenn die Bewegungs-Einstellung bekannt
  // ist. Ohne die Sperre würde jedes spätere `reduceMotionChanged` das Effect
  // erneut ausführen — fiele das in das Ausblenden, stünde der Toast wieder
  // auf `toValue: 1`, während `leaving` schon gesetzt ist, und ließe sich nie
  // mehr schließen.
  useEffect(() => {
    if (reduceMotion === null || entered.current) return;
    entered.current = true;
    // Auch bei „Bewegung reduzieren“ 140 ms: Das Pattern streicht dort nur
    // den Versatz (s. `outputRange` unten), nicht den Fade.
    Animated.timing(progress, {
      toValue: 1,
      duration: 140,
      // eslint-disable-next-line @typescript-eslint/unbound-method -- RN-Typen führen Easing-Funktionen als Methoden; Easing.js benutzt kein `this`
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion]);

  // Eine Frist pro Toast, aus der beide Effekte ableiten. Der Dismiss-Timer
  // läuft ab dem Einhängen, die Leiste startet erst, wenn die
  // „Bewegung reduzieren"-Abfrage aufgelöst hat — ohne gemeinsame Deadline
  // zeigte sie die volle Dauer statt der verbleibenden Frist. Und weil `close`
  // an `reduceMotion` hängt, startete auch der Timer bei einem Wechsel der
  // Systemeinstellung von vorn; ab jetzt rechnet er die Restzeit aus.
  const [deadline] = useState(() =>
    entry.durationMs == null ? null : Date.now() + entry.durationMs,
  );

  useEffect(() => {
    if (deadline == null) return;
    const timer = setTimeout(close, Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [deadline, close]);

  // Die Leiste läuft nur, wenn der Toast wirklich abläuft — und nicht bei
  // „Bewegung reduzieren", wo sie ersatzlos entfällt statt zu springen.
  useEffect(() => {
    const total = entry.durationMs;
    if (total == null || deadline == null || reduceMotion !== false) return;
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining === 0) return;
    // Anteilig setzen statt bei 1 beginnen: die Leiste zeigt die Restfrist,
    // nicht die Gesamtdauer.
    countdown.setValue(remaining / total);
    const animation = Animated.timing(countdown, {
      toValue: 0,
      duration: remaining,
      // eslint-disable-next-line @typescript-eslint/unbound-method -- RN-Typen führen Easing-Funktionen als Methoden; Easing.js benutzt kein `this`
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    // Ohne `stop()` liefe eine ältere Instanz nach einem erneuten
    // reduceMotion-Wechsel im Hintergrund weiter und träfe irgendwann ihr
    // eigenes Ziel (`scaleX: 0`) — und überschriebe damit den Stand der neu
    // gestarteten Animation mit einem sichtbaren Sprung. `setValue(1)` oben
    // deckt nur den Reset-Moment ab, nicht das Nachwirken der alten Instanz.
    return () => animation.stop();
  }, [countdown, deadline, entry.durationMs, reduceMotion]);

  // `accessibilityLiveRegion` ist in React Native Android-only; auf iOS meldet
  // VoiceOver eine frisch eingehängte View von sich aus nicht. Ohne diese
  // Ansage wäre der Toast dort stumm — und ein Toast, den niemand hört, ist
  // für Screenreader-Nutzer gar kein Toast. Auf Android bleibt es bei der
  // Live-Region, sonst käme die Meldung doppelt.
  //
  // Die Aktion gehört mit hinein: Sie ist der einzige Weg zu einem Knopf, der
  // nach fünf nicht verlängerbaren Sekunden weg ist, auf einem Screen, der
  // gerade gewechselt hat. Wird sie nicht angesagt, ist sie faktisch nicht da.
  const actionLabel = entry.action?.label;
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const parts = [entry.title];
    if (entry.message) parts.push(entry.message);
    if (actionLabel) parts.push(t("action.a11y.toastAction", { label: actionLabel }));
    AccessibilityInfo.announceForAccessibility(parts.join(". "));
  }, [t, entry.title, entry.message, actionLabel]);

  const isError = entry.variant === "error";

  return (
    // Die Hülle. Zwei Views, weil Native Driver und JS-Driver nie dieselbe View
    // animieren dürfen: innen laufen Fade und Versatz nativ, außen Höhe und
    // Rand im JS-Driver.
    //
    // Der Rand läuft negativ bis auf −gap und frisst so den `gap` des Stapels —
    // egal ob oben oder unten verankert, ob der Toast der erste oder der letzte
    // ist. Ohne ihn bliebe am Ende eine 9-px-Lücke stehen, die beim Entfernen
    // des Eintrags doch noch springt.
    //
    // Gemessen wird nur bis zum Schließen: `close()` friert den Startwert in
    // `collapseFrom` ein. Danach meldet die schrumpfende Hülle selbst jede
    // Zwischenhöhe; als Startwert genommen, liefe das Schrumpfen gegen sich
    // selbst.
    //
    // Geclippt wird nur während des Schrumpfens. Im Ruhezustand schnitte
    // `overflow: hidden` den Schatten ab. Beim Schrumpfen verhindert es, dass
    // die ausblendende Karte über den nachrutschenden Nachbarn oder (unten
    // verankert) über die Tab-Bar ragt; dass der Schatten dabei sofort
    // verschwindet, fällt unter dem gleichzeitigen Fade kaum auf.
    <Animated.View
      testID={`toast-${entry.id}`}
      onLayout={(e) => {
        measured.current = e.nativeEvent.layout.height;
      }}
      style={
        collapseFrom == null
          ? undefined
          : {
              height: collapse.interpolate({
                inputRange: [0, 1],
                outputRange: [collapseFrom, 0],
              }),
              marginBottom: collapse.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -spec.stack.gap],
              }),
              overflow: "hidden",
            }
      }
    >
      <Animated.View
        accessibilityRole={isError ? "alert" : undefined}
        accessibilityLiveRegion={isError ? "assertive" : "polite"}
        style={{
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                // „Bewegung reduzieren“: kein Versatz, weder beim Ein- noch
                // beim Ausblenden — nur der Fade über `opacity`.
                outputRange: [reduceMotion === true ? 0 : enterFrom, 0],
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
              onPress={() => {
                entry.action?.onPress();
                // Nach einer Aktion hat der Toast seinen Zweck erfüllt. `close()`
                // statt `dismiss()`, damit das Ausblenden läuft. Es gibt keine
                // Aktion, nach der ein Stehenbleiben richtig wäre — deshalb
                // Standardverhalten und kein Flag (Decision 8 der Spec).
                close();
              }}
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

        {entry.durationMs != null && reduceMotion === false ? (
          <Animated.View
            // Rein dekorativ: die Information steht schon in Titel und Aktion.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: spec.progressBar.height,
              backgroundColor: accent,
              opacity: spec.progressBar.opacity,
              // `scaleX` skaliert in React Native sonst um die Mitte — die
              // Leiste liefe von beiden Seiten nach innen zu statt von rechts
              // nach links leer. `transformOrigin` gibt es seit RN 0.74
              // (Decision 9 der Spec).
              transformOrigin: "left",
              transform: [{ scaleX: countdown }],
            }}
          />
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}
