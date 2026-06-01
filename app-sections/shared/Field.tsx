import { TextInput, View, type TextInputProps } from "react-native";

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
   * non-editable (display-only) and onPressIn fires on tap, allowing an
   * external picker (e.g., DateTimePicker) to own the interaction.
   */
  onPress?: () => void;
  keyboardType?: TextInputProps["keyboardType"];
  secureTextEntry?: boolean;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoCorrect?: boolean;
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
}

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

  return (
    <View>
      <Text
        variant="caption"
        tone="inkSecondary"
        style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
      >
        {label}
      </Text>
      <View
        className={`mt-1.5 ${multiline ? "min-h-20" : "h-12"} flex-row ${multiline ? "items-start pt-2.5" : "items-center"} gap-2 rounded-xl border bg-card px-3.5`}
        style={{ borderColor: error ? theme.danger : theme.line }}
      >
        {iconName ? <Icon name={iconName} size={18} color={theme.inkTertiary} /> : null}
        <TextInput
          value={value}
          {...(onChangeText ? { onChangeText } : {})}
          placeholder={placeholder}
          placeholderTextColor={theme.inkTertiary}
          // Without onChangeText the field is display-only: external value
          // updates (e.g. picker selections) still propagate because we always
          // pass `value`, but the keyboard input is locked.
          editable={editable && !onPress && !!onChangeText}
          onPressIn={onPress}
          multiline={multiline}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          textContentType={textContentType}
          className="flex-1 text-base"
          style={{
            fontFamily: "Inter",
            fontSize: 14,
            color: editable ? theme.ink : theme.inkSecondary,
            textAlignVertical: multiline ? "top" : "center",
            minHeight: multiline ? 60 : undefined,
          }}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="danger" className="mt-1">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
