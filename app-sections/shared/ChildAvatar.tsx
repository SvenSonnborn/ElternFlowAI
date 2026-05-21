import { View } from "react-native";

import { Text } from "@/design-system/ui";

type Size = "sm" | "md" | "lg" | "xl";

interface ChildAvatarProps {
  name: string;
  color: string;
  size?: Size;
  className?: string;
}

const sizePx: Record<Size, number> = { sm: 24, md: 32, lg: 44, xl: 72 };
const textVariant: Record<Size, Parameters<typeof Text>[0]["variant"]> = {
  sm: "caption",
  md: "pill",
  lg: "bodyEmph",
  xl: "h2",
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

export function ChildAvatar({ name, color, size = "md", className }: ChildAvatarProps) {
  const px = sizePx[size];
  return (
    <View
      className={`items-center justify-center rounded-pill ${className ?? ""}`.trim()}
      style={{ width: px, height: px, backgroundColor: color }}
    >
      <Text variant={textVariant[size]} tone="white">
        {initials(name)}
      </Text>
    </View>
  );
}
