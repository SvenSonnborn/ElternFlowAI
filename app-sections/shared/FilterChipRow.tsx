import { Pressable, View } from "react-native";

import { touchTarget } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

export interface FilterChipOption<T extends string> {
  id: T;
  /** Bereits übersetzt — der Katalog-Key unterscheidet sich pro Reihe. */
  label: string;
  /** Bereits zu einem Hex-Wert aufgelöst. Nur die Kind-Reihe setzt ihn. */
  dotColor?: string;
}

interface FilterChipRowProps<T extends string> {
  /** Gruppenname für Screenreader; bewusst nicht sichtbar gerendert. */
  accessibilityLabel: string;
  options: FilterChipOption<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
}

/**
 * Einfachauswahl-Chipreihe. Generisch über die Option-ID, damit ein Aufrufer
 * mit einem engen Union-Typ (`StatusFilter`, `DueFilter`) einen ebenso eng
 * typisierten `onSelect` bekommt statt eines `string`, den er zurückcasten
 * müsste.
 */
export function FilterChipRow<T extends string>({
  accessibilityLabel,
  options,
  selectedId,
  onSelect,
}: FilterChipRowProps<T>) {
  const { theme } = useTheme();

  return (
    // Container-Rolle statt `accessible`: ein accessible-Container würde die
    // Chips für den Screenreader verschlucken, die Rolle benennt die Gruppe,
    // ohne sie unerreichbar zu machen. Die Chips selbst sind `radio`, nicht
    // `button` — die Reihe ist Einfachauswahl mit einem verpflichtenden
    // Default, genau das, was eine Radiogroup semantisch beschreibt.
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      className="flex-row flex-wrap gap-x-2"
    >
      {options.map((option) => {
        const active = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: active }}
            onPress={() => onSelect(option.id)}
            // Die Pille ist per Design 36 px hoch, die Tippfläche darum 44;
            // `hitSlop` leistet das nicht, weil React Native es an den Grenzen
            // des Elternteils beschneidet und react-native-web es gar nicht
            // kennt. Umbrochene Zeilen liegen im 44-px-Raster, deshalb kein
            // senkrechter `gap`. Das Maß ist eine Zahl statt `h-11`: NativeWind
            // rechnet rem nativ mit 14, `h-11` wären dort 38,5 pt.
            className="justify-center active:opacity-70"
            style={{ minWidth: touchTarget.min, height: touchTarget.min }}
          >
            <View
              className="h-9 flex-row items-center justify-center gap-1.5 rounded-pill border px-3"
              style={{
                backgroundColor: active ? theme.primarySoft : theme.cardSubtle,
                borderColor: active ? theme.primary : theme.line,
              }}
            >
              {option.dotColor ? (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: option.dotColor,
                  }}
                />
              ) : null}
              <Text
                variant="pill"
                style={{ color: active ? theme.primaryStrong : theme.inkSecondary }}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
