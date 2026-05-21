import { ScrollView, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ScreenProps extends ViewProps {
  scroll?: boolean;
  className?: string;
  contentClassName?: string;
}

export function Screen({
  scroll = false,
  className,
  contentClassName,
  children,
  ...rest
}: ScreenProps) {
  const inner = (
    <View className={`flex-1 px-5 pt-2 ${className ?? ""}`.trim()} {...rest}>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-bg">
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName={`pb-32 ${contentClassName ?? ""}`.trim()}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}
