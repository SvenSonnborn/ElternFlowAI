import { Pressable, TextInput, View, type TextInputProps } from "react-native";

import { fontFamily } from "@/design-system";
import { useTheme } from "@/design-system/ThemeProvider";
import { Text } from "@/design-system/ui";

import { Icon, type IconName } from "./Icon";

export type FieldType = "text" | "multiline";

export interface FieldProps {
  label: string;
  iconName?: IconName;
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  type?: FieldType;
  error?: string;
  editable?: boolean;
  /**
   * Callback when the field is pressed. When provided, the TextInput becomes
   * non-editable (display-only) and the whole row is wrapped in a `Pressable`
   * so an external picker (e.g., DateTimePicker) can own the interaction.
   *
   * A plain `TextInput` with `onPressIn` does not work on web: react-native-web
   * forwards `TextInput` props through an allowlist that does not include
   * `onPressIn` (verified against the installed RNW build — the rendered
   * `<input>` only gets `onBlur`/`onChange`/`onFocus`/`onKeyDown`/`onSelect`).
   * `Pressable` renders a `<div onClick>` instead, which works on every
   * platform.
   */
  onPress?: () => void;
  keyboardType?: TextInputProps["keyboardType"];
  secureTextEntry?: boolean;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoCorrect?: boolean;
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
}

/**
 * Beschriftetes Eingabefeld. Das Label steht als `accessibilityLabel` am
 * `TextInput` (bzw. am `Pressable` der `onPress`-Variante); der sichtbare
 * Label-`Text` ist `aria-hidden`, sonst sagen VoiceOver und TalkBack ihn
 * zusätzlich zum Feldnamen an, also doppelt. Weil das Label den Inhalt der
 * Zeile überdeckt, trägt die `onPress`-Variante den Wert als `aria-valuetext`.
 */
export function Field({
  label,
  iconName,
  value,
  onChangeText,
  placeholder,
  type = "text",
  error,
  editable = true,
  onPress,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
  autoCorrect,
  autoComplete,
  textContentType,
}: FieldProps) {
  const { theme } = useTheme();
  const multiline = type === "multiline";

  const rowClassName = `mt-1.5 ${multiline ? "min-h-20" : "h-12"} flex-row ${multiline ? "items-start pt-2.5" : "items-center"} gap-2 rounded-xl border bg-card px-3.5`;
  const rowStyle = { borderColor: error ? theme.danger : theme.line };

  const rowContent = (
    <>
      {iconName ? <Icon name={iconName} size={18} color={theme.inkTertiary} /> : null}
      <TextInput
        accessibilityLabel={label}
        value={value}
        {...(onChangeText ? { onChangeText } : {})}
        placeholder={placeholder}
        placeholderTextColor={theme.inkTertiary}
        // Without onChangeText the field is display-only: external value
        // updates (e.g. picker selections) still propagate because we always
        // pass `value`, but the keyboard input is locked.
        editable={editable && !onPress && !!onChangeText}
        // The Pressable wrapping this row owns the tap when onPress is set;
        // pointerEvents="none" keeps the (non-editable) TextInput from ever
        // stealing that touch on native.
        pointerEvents={onPress ? "none" : undefined}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoComplete={autoComplete}
        textContentType={textContentType}
        // Einzeilig ohne `text-base`: dessen Zeilenhöhe 24 setzt die Glyphen auf
        // iOS an den Fuß der Zeile, im gestreckten Feld rutscht der Text tiefer.
        className={multiline ? "flex-1 text-base" : "flex-1"}
        style={{
          fontFamily: fontFamily.sans,
          fontSize: 14,
          color: editable ? theme.ink : theme.inkSecondary,
          textAlignVertical: multiline ? "top" : "center",
          minHeight: multiline ? 60 : undefined,
          // Einzeilig füllt das Feld die h-12-Zeile; sonst ist es nur so hoch
          // wie seine Schrift, und ein Tipp auf den Rand fokussiert nichts.
          alignSelf: multiline ? undefined : "stretch",
        }}
      />
    </>
  );

  return (
    <View>
      <Text
        aria-hidden
        variant="caption"
        tone="inkSecondary"
        style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
      >
        {label}
      </Text>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          // Das Label überdeckt den Text der Zeile; ohne Wert hörte man nur
          // „Von (Datum)", nie das gewählte Datum.
          aria-valuetext={value}
          onPress={onPress}
          className={rowClassName}
          style={rowStyle}
        >
          {rowContent}
        </Pressable>
      ) : (
        <View className={rowClassName} style={rowStyle}>
          {rowContent}
        </View>
      )}
      {error ? (
        <Text variant="caption" tone="danger" className="mt-1">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
