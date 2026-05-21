import { ActivityIndicator, Pressable, type PressableProps, View } from "react-native";

import { Text } from "./Text";

type Variant = "solid" | "soft" | "ghost";
type Tone = "primary" | "accent" | "neutral" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  className?: string;
}

const sizeClass: Record<Size, string> = {
  sm: "h-9 px-3.5 rounded-lg",
  md: "h-11 px-4 rounded-xl",
  lg: "h-12 px-5 rounded-xl",
};

const solidBg: Record<Tone, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  neutral: "bg-card",
  danger: "bg-danger",
};

const softBg: Record<Tone, string> = {
  primary: "bg-primary-soft",
  accent: "bg-accent-soft",
  neutral: "bg-bg-raised",
  danger: "bg-danger-soft",
};

const solidText: Record<Tone, Parameters<typeof Text>[0]["tone"]> = {
  primary: "onMint",
  accent: "white",
  neutral: "ink",
  danger: "white",
};

const softText: Record<Tone, Parameters<typeof Text>[0]["tone"]> = {
  primary: "primaryStrong",
  accent: "accentStrong",
  neutral: "ink",
  danger: "danger",
};

export function Button({
  label,
  variant = "solid",
  tone = "primary",
  size = "md",
  block,
  loading,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const variantBg =
    variant === "solid" ? solidBg[tone] : variant === "soft" ? softBg[tone] : "bg-transparent";

  const textTone =
    variant === "solid" ? solidText[tone] : variant === "soft" ? softText[tone] : "ink";

  const border = tone === "neutral" && variant !== "ghost" ? "border border-line" : "";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={`flex-row items-center justify-center gap-2 ${sizeClass[size]} ${variantBg} ${border} ${
        block ? "w-full" : ""
      } ${isDisabled ? "opacity-50" : "active:opacity-80"} ${className ?? ""}`.trim()}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" />
      ) : (
        <View>
          <Text variant="button" tone={textTone}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
