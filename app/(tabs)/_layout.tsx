import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Icon, type IconName, VoiceAssistantFAB } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const { theme } = useTheme();
  return <Icon name={name} size={22} color={focused ? theme.primaryStrong : theme.inkTertiary} />;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.primaryStrong,
          tabBarInactiveTintColor: theme.inkTertiary,
          tabBarStyle: {
            backgroundColor: theme.card,
            borderTopColor: theme.line,
            paddingTop: 8,
            height: 72,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("nav.dashboard"),
            tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="kalender"
          options={{
            title: t("nav.calendar"),
            tabBarIcon: ({ focused }) => <TabIcon name="calendar" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="essen"
          options={{
            title: t("nav.meals"),
            tabBarIcon: ({ focused }) => <TabIcon name="utensils" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="aufgaben"
          options={{
            title: t("nav.homework"),
            tabBarIcon: ({ focused }) => <TabIcon name="book-open" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="familie"
          options={{
            title: t("nav.family"),
            tabBarIcon: ({ focused }) => <TabIcon name="users" focused={focused} />,
          }}
        />
      </Tabs>
      <VoiceAssistantFAB />
    </View>
  );
}
