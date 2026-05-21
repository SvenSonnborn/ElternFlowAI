import { View } from "react-native";

import { Text } from "@/design-system/ui";

export type PillTone = "mint" | "orange" | "warn" | "success" | "danger" | "ink" | "neutral";

interface PillProps {
  label: string;
  tone?: PillTone;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}

const bg: Record<PillTone, string> = {
  mint: "bg-primary-soft",
  orange: "bg-accent-soft",
  warn: "bg-warning-soft",
  success: "bg-success-soft",
  danger: "bg-danger-soft",
  ink: "bg-bg-raised",
  neutral: "bg-card",
};

const textTone: Record<PillTone, Parameters<typeof Text>[0]["tone"]> = {
  mint: "primaryStrong",
  orange: "accentStrong",
  warn: "accentStrong",
  success: "success",
  danger: "danger",
  ink: "ink",
  neutral: "ink",
};

export function Pill({ label, tone = "neutral", leading, trailing, className }: PillProps) {
  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-pill px-2.5 py-1 ${bg[tone]} ${className ?? ""}`.trim()}
    >
      {leading}
      <Text variant="pill" tone={textTone[tone]}>
        {label}
      </Text>
      {trailing}
    </View>
  );
}
