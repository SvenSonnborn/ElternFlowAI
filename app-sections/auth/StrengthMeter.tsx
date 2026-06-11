import { View } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";

export function StrengthMeter({ score }: { score: number }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>
      {[1, 2, 3, 4].map((bar) => (
        <View
          key={bar}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: score >= bar ? theme.primary : theme.line,
          }}
        />
      ))}
    </View>
  );
}
