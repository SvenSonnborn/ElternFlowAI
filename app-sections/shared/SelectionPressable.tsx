import { Platform, Pressable, type PressableProps } from "react-native";

const SPACE_ROLES: readonly string[] = ["radio", "checkbox", "switch"];

export type SelectionPressableProps = Omit<PressableProps, "onPress"> & { onPress?: () => void };

/**
 * `Pressable` für Bedienelemente mit Rolle `radio`, `checkbox` oder `switch`.
 * react-native-web löst ein `Pressable` per Leertaste nur bei Rolle `button`
 * aus (`isValidKeyPress` im PressResponder), für diese Rollen nur per Enter —
 * dabei ist die Leertaste genau ihre Taste. Hier löst sie auf Web `onPress`
 * aus; gehaltene Wiederholungen nicht, sonst flackert ein Schalter. Bei Rolle
 * `button` bleibt es bei react-native-web, ein zweiter Handler löste doppelt
 * aus. Nativ übernimmt der Screenreader die Bedienung (ADR-054).
 */
export function SelectionPressable({ onPress, ...props }: SelectionPressableProps) {
  const spaceSelects =
    Platform.OS === "web" &&
    onPress !== undefined &&
    !props.disabled &&
    SPACE_ROLES.includes(props.accessibilityRole ?? "");
  return (
    <Pressable
      {...props}
      onPress={onPress}
      onKeyDown={
        spaceSelects
          ? (e) => {
              if (e.nativeEvent.key !== " " || e.nativeEvent.repeat) return;
              e.preventDefault();
              onPress();
            }
          : undefined
      }
    />
  );
}
