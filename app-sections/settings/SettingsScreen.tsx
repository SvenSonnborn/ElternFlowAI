import Constants from "expo-constants";
import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Alert, Linking, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import type { IconName } from "@/app-sections/shared/Icon";

import { ChildAvatar, Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { useThemeStore } from "@/design-system/themeStore";
import { Card, Text } from "@/design-system/ui";
import {
  mapAuthError,
  useCurrentParent,
  useFamilyChildren,
  useFamilyParents,
  useSession,
  useSignOut,
} from "@/features/auth";
import pkg from "@/package.json";

interface RowProps {
  icon: IconName;
  iconBg?: string;
  iconColor?: string;
  label: string;
  value?: string;
  isLast?: boolean;
  isDanger?: boolean;
  /** Renders the row as an inert "coming soon" entry: no chevron, no press handler. */
  soon?: boolean;
  disabled?: boolean;
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
  soon,
  disabled,
  onPress,
  trailing,
}: RowProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const containerBg = iconBg ?? "bg-bg-raised";
  const tint = iconColor ?? theme.inkSecondary;
  const labelTone = isDanger ? "danger" : "ink";
  const press = soon ? undefined : onPress;
  const shownValue = soon ? t("auth.soon") : value;

  return (
    <Pressable
      onPress={press}
      disabled={disabled}
      accessibilityRole={press ? "button" : undefined}
      accessibilityState={soon || disabled ? { disabled: true } : undefined}
      className={`flex-row items-center gap-3 py-3 ${isLast ? "" : "border-b border-line"} ${press ? "active:opacity-70" : ""} ${disabled ? "opacity-50" : ""}`}
    >
      <View className={`h-8 w-8 items-center justify-center rounded-xl ${containerBg}`}>
        <Icon name={icon} size={15} color={tint} />
      </View>
      <Text variant="listTitle" tone={labelTone} className="flex-1">
        {label}
      </Text>
      {trailing ?? (
        <View className="flex-row items-center gap-1">
          {shownValue ? (
            <Text variant="meta" tone={soon ? "inkTertiary" : "inkSecondary"}>
              {shownValue}
            </Text>
          ) : null}
          {press && !isDanger ? (
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

// expoConfig can be absent (bare web/test contexts) — fall back to package.json.
const appVersion =
  Constants.expoConfig?.version ?? (pkg as { version?: string }).version ?? "0.0.0";

// Linking.openSettings() is not implemented on web.
const canOpenOsSettings = Platform.OS !== "web";

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { theme, nativeVars } = useTheme();
  const themeName = useThemeStore((s) => s.themeName);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const isDark = themeName === "dark";
  const isDE = i18n.language.startsWith("de");
  const insets = useSafeAreaInsets();

  const { session } = useSession();
  const parentQ = useCurrentParent();
  const parent = parentQ.data;
  const familyId = parent?.family_id;
  const parentsQ = useFamilyParents(familyId);
  const childrenQ = useFamilyChildren(familyId);
  const signOut = useSignOut();

  // Degrade quietly: language, dark mode and sign-out must stay usable even
  // when the family queries are still loading or have failed.
  const memberCount =
    parentsQ.data && childrenQ.data ? String(parentsQ.data.length + childrenQ.data.length) : "—";
  const email = session?.user.email ?? "—";

  const confirmSignOut = () => {
    Alert.alert(t("set.logout"), undefined, [
      { text: t("action.cancel"), style: "cancel" },
      {
        text: t("set.logout"),
        style: "destructive",
        onPress: () => {
          // No manual navigation: clearing the session lets AuthGate/decideRoute
          // redirect this route (group "other") to /(auth)/login.
          signOut.mutate(undefined, {
            onError: (err) => Alert.alert(t(mapAuthError(err))),
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[{ flex: 1, backgroundColor: theme.bg }, nativeVars]}
      className="flex-1 bg-bg"
    >
      <Stack.Screen
        options={{
          contentStyle: { flex: 1, backgroundColor: theme.bg },
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.bg }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 48 + insets.bottom,
        }}
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
          {parent ? (
            <ChildAvatar name={parent.name} color={parent.color} />
          ) : (
            <View className="h-8 w-8 rounded-pill bg-bg-raised" />
          )}
          <View className="flex-1">
            <Text variant="bodyEmph">{parent?.name ?? "—"}</Text>
            <Text variant="caption" tone="inkSecondary" numberOfLines={1}>
              {email}
            </Text>
          </View>
          {/* Plus is unwired (no Stripe yet) — the pill must not claim an active plan. */}
          <View className="rounded-pill bg-bg-raised px-2.5 py-1">
            <Text variant="pill" tone="inkTertiary">
              {t("auth.soon")}
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
          {/* Deep-link into the OS settings — the app owns no push layer yet, so it
              cannot know (or set) the permission state itself. */}
          <Row
            icon="bell"
            label={t("set.notifications")}
            soon={!canOpenOsSettings}
            onPress={() => {
              // Rejects on platforms/OS versions without a settings deep link —
              // nothing to recover from, so swallow rather than crash.
              Linking.openSettings().catch(() => {});
            }}
          />
          <Row icon="mic" label={t("set.voice")} soon isLast />
        </Card>

        <GroupLabel>{`${t("set.familyMembers")} & ${t("set.privacy")}`}</GroupLabel>
        <Card className="p-0 px-4">
          <Row
            icon="users"
            label={t("set.familyMembers")}
            value={memberCount}
            onPress={() => {
              if (router.canGoBack()) router.back();
              router.push("/familie");
            }}
          />
          <Row icon="shield" label={t("set.privacy")} soon />
          <Row icon="globe" label={t("set.connectedApps")} soon isLast />
        </Card>

        <GroupLabel>{t("set.subscription")}</GroupLabel>
        <Card className="p-0 px-4">
          <Row
            icon="sparkles"
            iconBg="bg-accent-soft"
            iconColor={theme.accentStrong}
            label={t("set.subscription")}
            soon
          />
          <Row icon="mail" label={t("set.help")} soon />
          <Row
            icon="lock"
            label={t("set.logout")}
            isDanger
            isLast
            disabled={signOut.isPending}
            onPress={confirmSignOut}
          />
        </Card>

        <View className="mt-8 items-center">
          <Text variant="meta" tone="inkTertiary">
            {t("set.footer", { version: appVersion })}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
