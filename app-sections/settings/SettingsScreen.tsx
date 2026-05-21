import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, Switch, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { IconName } from "@/app-sections/shared/Icon";

import { ChildAvatar, Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { useThemeStore } from "@/design-system/themeStore";
import { Card, Text } from "@/design-system/ui";
import { children, familyName, parents } from "@/features/sample-data";
import pkg from "@/package.json";

interface RowProps {
  icon: IconName;
  iconBg?: string;
  iconColor?: string;
  label: string;
  value?: string;
  isLast?: boolean;
  isDanger?: boolean;
  onPress?: () => void;
  trailing?: React.ReactNode;
}

function Row({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  isLast,
  isDanger,
  onPress,
  trailing,
}: RowProps) {
  const { theme } = useTheme();
  const containerBg = iconBg ?? "bg-bg-raised";
  const tint = iconColor ?? theme.inkSecondary;
  const labelTone = isDanger ? "danger" : "ink";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      className={`flex-row items-center gap-3 py-3 ${isLast ? "" : "border-b border-line"} active:opacity-70`}
    >
      <View className={`h-8 w-8 items-center justify-center rounded-xl ${containerBg}`}>
        <Icon name={icon} size={15} color={tint} />
      </View>
      <Text variant="listTitle" tone={labelTone} className="flex-1">
        {label}
      </Text>
      {trailing ?? (
        <View className="flex-row items-center gap-1">
          {value ? (
            <Text variant="meta" tone="inkSecondary">
              {value}
            </Text>
          ) : null}
          {onPress && !isDanger ? (
            <Icon name="chevron-right" size={16} color={theme.inkTertiary} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <Text variant="caption" tone="inkTertiary" className="mb-2 ml-1 mt-5 uppercase">
      {children}
    </Text>
  );
}

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const themeName = useThemeStore((s) => s.themeName);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const isDark = themeName === "dark";
  const isDE = i18n.language.startsWith("de");
  const me = parents[0];
  const version = (pkg as { version?: string }).version ?? "0.0.0";
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between pb-3 pt-4">
          <Text variant="h2">{t("set.title")}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("action.done")}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            className="px-2 py-1 active:opacity-70"
            hitSlop={12}
          >
            <Text variant="bodyEmph" tone="primaryStrong">
              {t("action.done")}
            </Text>
          </Pressable>
        </View>

        <Card className="flex-row items-center gap-3">
          <ChildAvatar name={me.short} color={me.color} />
          <View className="flex-1">
            <Text variant="bodyEmph">{me.name}</Text>
            <Text variant="caption" tone="inkSecondary" numberOfLines={1}>
              {me.email}
            </Text>
          </View>
          <View className="rounded-pill bg-accent-soft px-2.5 py-1">
            <Text variant="pill" style={{ color: theme.accentStrong }}>
              Plus
            </Text>
          </View>
        </Card>

        <GroupLabel>{t("set.title")}</GroupLabel>
        <Card className="p-0 px-4">
          <Row
            icon="globe"
            label={t("set.language")}
            value={isDE ? "Deutsch" : "English"}
            onPress={() => void i18n.changeLanguage(isDE ? "en" : "de")}
          />
          <Row
            icon="moon"
            label={t("set.darkMode")}
            trailing={
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: theme.line, true: theme.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={theme.line}
              />
            }
          />
          <Row
            icon="bell"
            label={t("set.notifications")}
            value={t("action.on")}
            onPress={() => {}}
          />
          <Row icon="mic" label={t("set.voice")} value="Eltern Flow" onPress={() => {}} isLast />
        </Card>

        <GroupLabel>{`${t("set.familyMembers")} & ${t("set.privacy")}`}</GroupLabel>
        <Card className="p-0 px-4">
          <Row
            icon="users"
            label={t("set.familyMembers")}
            value={String(parents.length + children.length)}
            onPress={() => {
              if (router.canGoBack()) router.back();
              router.push("/familie");
            }}
          />
          <Row icon="shield" label={t("set.privacy")} onPress={() => {}} />
          <Row icon="globe" label={t("set.connectedApps")} value="0" onPress={() => {}} isLast />
        </Card>

        <GroupLabel>{t("set.subscription")}</GroupLabel>
        <Card className="p-0 px-4">
          <Row
            icon="sparkles"
            iconBg="bg-accent-soft"
            iconColor={theme.accentStrong}
            label={t("set.subscription")}
            value={t("action.manage")}
            onPress={() => {}}
          />
          <Row icon="mail" label={t("set.help")} onPress={() => {}} />
          <Row icon="lock" label={t("set.logout")} isDanger isLast onPress={() => {}} />
        </Card>

        <View className="mt-8 items-center">
          <Text variant="meta" tone="inkTertiary">
            {`${familyName} · Eltern Flow · v${version} · Made in Berlin`}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
