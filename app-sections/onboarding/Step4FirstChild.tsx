import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, View } from "react-native";

import { Field, Icon } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Text } from "@/design-system/ui";
import { AVATAR_COLORS, mapAuthError, useCreateChild, useCurrentParent } from "@/features/auth";
import { ALLERGY_KEYS, type AllergyKey } from "@/features/children";

import { OnboardingShell } from "./OnboardingShell";

export function Step4FirstChild() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const parent = useCurrentParent();
  const createChild = useCreateChild();

  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [color, setColor] = useState<string>(AVATAR_COLORS[0]);
  const [school, setSchool] = useState("");
  const [allergies, setAllergies] = useState<Set<AllergyKey>>(new Set());

  const familyId = parent.data?.family_id;
  const errorKey = createChild.error ? mapAuthError(createChild.error) : null;
  const canSubmit =
    Boolean(familyId) && name.trim().length >= 1 && birthday !== null && !createChild.isPending;

  function toggleAllergy(a: AllergyKey) {
    setAllergies((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  }

  async function onSave() {
    if (!familyId || !canSubmit || !birthday) return;
    try {
      await createChild.mutateAsync({
        familyId,
        name: name.trim(),
        birthday: format(birthday, "yyyy-MM-dd"),
        color,
        school: school.trim() || null,
        // Persist stable allergy KEYS, not localized labels — switching language
        // must not strand stored allergies in the old locale. Rendered via t().
        allergies: Array.from(allergies),
      });
      router.push("/(onboarding)/5");
    } catch {
      /* error rendered below */
    }
  }

  function onSkip() {
    router.push("/(onboarding)/5");
  }

  const initial = name.charAt(0).toUpperCase() || t("onb.s4.avatarFallback");

  return (
    <OnboardingShell
      step={4}
      showSkip
      onSkip={onSkip}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={t("onb.s4.save")}
            tone="primary"
            variant="solid"
            size="lg"
            block
            loading={createChild.isPending}
            onPress={() => {
              void onSave();
            }}
            disabled={!canSubmit}
          />
          <Button
            label={`${t("onb.s4.voice")} · ${t("auth.soon")}`}
            tone="neutral"
            variant="soft"
            size="lg"
            block
            disabled
          />
        </View>
      }
    >
      <Text variant="h2" tone="ink" style={{ marginTop: 12 }}>
        {t("onb.s4.title")}
      </Text>
      <Text variant="body" tone="inkSecondary" style={{ marginTop: 8 }}>
        {t("onb.s4.sub")}
      </Text>

      {errorKey ? (
        <View
          className="mt-4 rounded-xl border border-danger bg-danger-soft p-3"
          accessibilityRole="alert"
        >
          <Text variant="body" tone="danger">
            {t(errorKey)}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: 16, marginTop: 24 }}>
        <View style={{ alignItems: "center" }}>
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text variant="h2" tone="white">
              {initial}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {AVATAR_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                hitSlop={8}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: c,
                  borderWidth: 2,
                  borderColor: color === c ? theme.ink : "transparent",
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: color === c }}
              />
            ))}
          </View>
        </View>

        <Field
          label={t("onb.s4.nameField")}
          value={name}
          onChangeText={setName}
          placeholder={t("onb.s4.namePlaceholder")}
        />

        <Field
          label={t("onb.s4.birthdayField")}
          iconName="calendar"
          value={birthday ? format(birthday, "dd.MM.yyyy") : ""}
          onPress={() => setPickerOpen(true)}
          placeholder={t("onb.s4.birthdayPlaceholder")}
        />

        {pickerOpen ? (
          <DateTimePicker
            value={birthday ?? new Date(2018, 0, 1)}
            mode="date"
            maximumDate={new Date()}
            onChange={(event, d) => {
              if (Platform.OS !== "ios") setPickerOpen(false);
              if (event.type === "dismissed" || !d) return;
              setBirthday(d);
              if (Platform.OS === "ios") setPickerOpen(false);
            }}
          />
        ) : null}

        <Field
          label={t("onb.s4.schoolField")}
          iconName="book-open"
          value={school}
          onChangeText={setSchool}
          placeholder={t("onb.s4.schoolPlaceholder")}
        />

        <View>
          <Text
            variant="caption"
            tone="inkSecondary"
            style={{ textTransform: "uppercase", fontWeight: "700", letterSpacing: 1.2 }}
          >
            {t("onb.s4.allergiesLabel")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {ALLERGY_KEYS.map((a) => {
              const selected = allergies.has(a);
              return (
                <Pressable
                  key={a}
                  onPress={() => toggleAllergy(a)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: selected ? theme.primarySoft : theme.card,
                    borderWidth: 1,
                    borderColor: selected ? theme.primary : theme.line,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  {selected ? <Icon name="check" size={14} color={theme.primaryStrong} /> : null}
                  <Text variant="caption" tone={selected ? "primaryStrong" : "inkSecondary"}>
                    {t(`onb.s4.allergies.${a}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </OnboardingShell>
  );
}
