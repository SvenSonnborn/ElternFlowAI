import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { textStyles, type TextStyleKey } from "../typography";

type Tone =
  | "ink"
  | "inkSecondary"
  | "inkTertiary"
  | "primary"
  | "primaryStrong"
  | "accent"
  | "accentStrong"
  | "onMint"
  | "onOrange"
  | "danger"
  | "success"
  | "white";

const toneClass: Record<Tone, string> = {
  ink: "text-ink",
  inkSecondary: "text-ink-secondary",
  inkTertiary: "text-ink-tertiary",
  primary: "text-primary",
  primaryStrong: "text-primary-strong",
  accent: "text-accent",
  accentStrong: "text-accent-strong",
  onMint: "text-on-mint",
  onOrange: "text-on-orange",
  danger: "text-danger",
  success: "text-success",
  white: "text-white",
};

interface TextProps extends RNTextProps {
  variant?: TextStyleKey;
  tone?: Tone;
  className?: string;
}

export function Text({ variant = "body", tone = "ink", className, style, ...rest }: TextProps) {
  const { textTransform: _ignoredTextTransform, ...rest_of_style } = textStyles[variant] as Record<
    string,
    unknown
  >;
  // RN expects `textTransform` as a style prop with limited values — kept off the
  // base preset object to preserve compatibility; we re-apply via style below.
  const presetStyle = rest_of_style as object;
  const upper = variant === "eyebrow";

  return (
    <RNText
      className={`${toneClass[tone]} ${className ?? ""}`.trim()}
      style={[presetStyle, upper ? { textTransform: "uppercase" as const } : null, style]}
      {...rest}
    />
  );
}
