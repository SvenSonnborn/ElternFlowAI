import { View, type ViewProps } from "react-native";

type CardVariant = "base" | "tinted" | "hero";
type TintTone = "primary" | "accent" | "success" | "warning" | "neutral";

interface CardProps extends ViewProps {
  variant?: CardVariant;
  tint?: TintTone;
  className?: string;
}

const tintBg: Record<TintTone, string> = {
  primary: "bg-primary-soft",
  accent: "bg-accent-soft",
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  neutral: "bg-bg-raised",
};

const baseClass = "bg-card rounded-2xl p-4 border border-line";
const heroClass = "rounded-3xl p-4 bg-accent";

export function Card({
  variant = "base",
  tint = "primary",
  className,
  children,
  ...rest
}: CardProps) {
  const variantClass =
    variant === "base"
      ? baseClass
      : variant === "tinted"
        ? `${tintBg[tint]} rounded-2xl p-4`
        : heroClass;

  return (
    <View className={`${variantClass} ${className ?? ""}`.trim()} {...rest}>
      {children}
    </View>
  );
}
