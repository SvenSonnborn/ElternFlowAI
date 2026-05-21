import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { ChildAvatar, Icon, Pill, TopBar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import { children, homeworkByChild, homeworkStats } from "@/features/sample-data";

export function AufgabenScreen() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const lang = i18n.language.startsWith("de") ? "de" : "en";

  const stats = [
    {
      n: String(homeworkStats.dueToday),
      label: t("hw.dueToday"),
      bg: "bg-warning-soft",
      tone: theme.warning,
    },
    {
      n: String(homeworkStats.thisWeek),
      label: t("hw.thisWeek"),
      bg: "bg-primary-soft",
      tone: theme.primaryStrong,
    },
    {
      n: `${homeworkStats.donePct}%`,
      label: t("hw.doneRate"),
      bg: "bg-success-soft",
      tone: theme.success,
    },
  ];

  return (
    <Screen scroll>
      <TopBar
        title={t("hw.title")}
        sub={t("hw.sub", { open: homeworkStats.open, done: homeworkStats.doneTodayLabel })}
      />

      <View className="flex-row gap-2">
        {stats.map((s) => (
          <View key={s.label} className={`flex-1 rounded-2xl p-3 ${s.bg}`}>
            <Text variant="h2" style={{ color: s.tone, fontSize: 22 }}>
              {s.n}
            </Text>
            <Text variant="caption" tone="inkSecondary" className="mt-0.5">
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      {homeworkByChild.map((kid) => {
        const child = children.find((c) => c.id === kid.childId);
        if (!child) return null;
        const openCount = kid.items.filter((it) => !it.isDone).length;
        return (
          <View key={kid.childId} className="mt-5">
            <View className="mb-2 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2.5">
                <ChildAvatar name={child.name} color={child.color} />
                <View>
                  <Text variant="bodyEmph">{child.name}</Text>
                  <Text variant="caption" tone="inkSecondary">
                    {child.grade}
                  </Text>
                </View>
              </View>
              <Pill tone="ink" label={t("hw.openCount", { count: openCount })} />
            </View>
            <View className="gap-2">
              {kid.items.map((item) => {
                const title = lang === "de" ? item.title : item.titleEn;
                const subject = lang === "de" ? item.subject : item.subjectEn;
                const due = lang === "de" ? item.due : item.dueEn;
                return (
                  <Card
                    key={item.id}
                    className={`flex-row items-center gap-2.5 ${
                      item.isUrgent ? "bg-warning-soft" : ""
                    }`}
                  >
                    <View
                      className="h-5 w-5 items-center justify-center rounded-md"
                      style={{
                        backgroundColor: item.isDone ? theme.success : "transparent",
                        borderWidth: item.isDone ? 0 : 1.5,
                        borderColor: theme.lineStrong,
                      }}
                    >
                      {item.isDone ? <Icon name="check" size={13} color="#FFFFFF" /> : null}
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <View
                          className="rounded-pill px-2 py-0.5"
                          style={{ backgroundColor: `${item.tone}22` }}
                        >
                          <Text variant="pill" style={{ color: item.tone }}>
                            {subject}
                          </Text>
                        </View>
                        {item.isUrgent ? <Pill label={t("hw.dueToday")} tone="warn" /> : null}
                      </View>
                      <Text
                        variant="listTitle"
                        tone={item.isDone ? "inkTertiary" : "ink"}
                        style={item.isDone ? { textDecorationLine: "line-through" } : undefined}
                        className="mt-1"
                      >
                        {title}
                      </Text>
                      <Text variant="caption" tone="inkSecondary" className="mt-0.5">
                        {t("hw.due", { when: due })}
                      </Text>
                    </View>
                    <Icon name="bell" size={16} color={theme.inkTertiary} />
                  </Card>
                );
              })}
            </View>
          </View>
        );
      })}

      <Button label={t("hw.addVoice")} variant="soft" tone="accent" block className="mt-5" />
    </Screen>
  );
}
