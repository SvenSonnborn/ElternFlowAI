import { Pressable, View } from "react-native";

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
    // `py-1` ist kein Abstand, sondern Voraussetzung für das Touch-Target der
    // Chips: React Native beschneidet `hitSlop` an den Grenzen des Elternteils,
    // und ohne Polsterung ist dieser Container bei einer einzeiligen Reihe
    // exakt so hoch wie ein Chip (36px) — die 4px oben und unten fielen dann
    // ersatzlos weg. Zwischen umbrochenen Reihen liefert `gap-2` dieselben 4px.
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      className="flex-row flex-wrap gap-2 py-1"
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
            // Der Chip ist per Design 36px hoch; hitSlop bringt das
            // Touch-Target auf 44, ohne die Optik anzufassen. Wirksam wird das
            // erst durch das `py-1` des Containers — siehe dort. (TypePicker
            // und MemberPicker benutzen denselben hitSlop ohne diese
            // Polsterung; dort greift er deshalb nicht, siehe docs/TODO.md.)
            hitSlop={{ top: 4, bottom: 4 }}
            className="h-9 flex-row items-center justify-center gap-1.5 rounded-pill border px-3 active:opacity-70"
            style={{
              minWidth: 44,
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
          </Pressable>
        );
      })}
    </View>
  );
}
