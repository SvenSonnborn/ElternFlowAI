import DateTimePicker from "@react-native-community/datetimepicker";
import { format, parseISO } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Platform, Pressable, TextInput, View } from "react-native";

import { ChildAvatar, Field, Icon, Pill, TopBar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import {
  AVATAR_COLORS,
  mapAuthError,
  useChild,
  useCreateChild,
  useCurrentParent,
  useDeleteChild,
  useUpdateChild,
} from "@/features/auth";
import { ageFromBirthday, ALLERGY_KEYS } from "@/features/children";

const LABEL_STYLE = {
  textTransform: "uppercase" as const,
  fontWeight: "700" as const,
  letterSpacing: 1.2,
};

function TagEditor({
  label,
  tags,
  placeholder,
  tone,
  onAdd,
  onRemove,
}: {
  label: string;
  tags: string[];
  placeholder: string;
  tone: "success" | "ink";
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    if (!value || tags.includes(value)) {
      setDraft("");
      return;
    }
    onAdd(value);
    setDraft("");
  }

  return (
    <View>
      <Text variant="caption" tone="inkSecondary" className="mb-2" style={LABEL_STYLE}>
        {label}
      </Text>
      {tags.length > 0 ? (
        <View className="mb-2 flex-row flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Pressable key={tag} onPress={() => onRemove(tag)} className="active:opacity-70">
              <Pill
                label={tag}
                tone={tone === "success" ? "success" : "ink"}
                leading={
                  tone === "success" ? (
                    <Icon name="heart" size={11} color={theme.success} />
                  ) : undefined
                }
                trailing={
                  // A 45°-rotated "plus" reads as a remove (✕) affordance without a literal glyph.
                  <View style={{ transform: [{ rotate: "45deg" }] }}>
                    <Icon name="plus" size={12} color={theme.inkTertiary} />
                  </View>
                }
              />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View
        className="h-12 flex-row items-center gap-2 rounded-xl border bg-card px-3.5"
        style={{ borderColor: theme.line }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={theme.inkTertiary}
          onSubmitEditing={commit}
          returnKeyType="done"
          className="flex-1 text-base"
          style={{ fontFamily: "Inter", fontSize: 14, color: theme.ink }}
        />
        <Pressable
          onPress={commit}
          hitSlop={13}
          accessibilityRole="button"
          accessibilityLabel={placeholder}
          className="active:opacity-70"
        >
          <Icon name="plus" size={18} color={theme.primary} />
        </Pressable>
      </View>
    </View>
  );
}

export function ChildProfileScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(params.id);

  const parent = useCurrentParent();
  const familyId = parent.data?.family_id;
  const childQ = useChild(params.id);
  const createChild = useCreateChild();
  const updateChild = useUpdateChild();
  const deleteChild = useDeleteChild();

  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [color, setColor] = useState<string>(AVATAR_COLORS[0]);
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [allergies, setAllergies] = useState<Set<string>>(new Set());
  const [likes, setLikes] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);

  // Hydrate the form once per loaded child (a refetch must not clobber edits).
  const hydratedId = useRef<string | null>(null);
  useEffect(() => {
    const child = childQ.data;
    if (!child || hydratedId.current === child.id) return;
    setName(child.name);
    setBirthday(parseISO(child.birthday));
    setColor(child.color);
    setSchool(child.school ?? "");
    setGrade(child.grade ?? "");
    setAllergies(new Set(child.allergies));
    setLikes(child.likes);
    setDislikes(child.dislikes);
    hydratedId.current = child.id;
  }, [childQ.data]);

  const age = birthday ? ageFromBirthday(format(birthday, "yyyy-MM-dd")) : null;
  const titleText = isEdit ? t("child.editTitle", { name: name || "…" }) : t("child.newTitle");
  const subText = isEdit ? t("child.editSub", { age: age ?? 0 }) : t("child.newSub");

  const mutationError = createChild.error ?? updateChild.error ?? deleteChild.error;
  const errorKey = mutationError ? mapAuthError(mutationError) : null;
  const isSaving = createChild.isPending || updateChild.isPending;
  const canSubmit = Boolean(familyId) && name.trim().length >= 1 && birthday !== null && !isSaving;

  function toggleAllergy(key: string) {
    setAllergies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onSave() {
    if (!canSubmit || !birthday || !familyId) return;
    const payload = {
      name: name.trim(),
      birthday: format(birthday, "yyyy-MM-dd"),
      color,
      school: school.trim() || null,
      grade: grade.trim() || null,
      // Persist stable allergy KEYS, not localized labels (see features/children/allergies.ts).
      allergies: Array.from(allergies),
      likes,
      dislikes,
    };
    try {
      if (isEdit && params.id) {
        await updateChild.mutateAsync({ id: params.id, familyId, ...payload });
      } else {
        await createChild.mutateAsync({ familyId, ...payload });
      }
      Alert.alert(t("child.saved"));
      router.back();
    } catch {
      /* error rendered below */
    }
  }

  function onDelete() {
    if (!params.id || !familyId) return;
    Alert.alert(t("child.deleteConfirmTitle"), t("child.deleteConfirmMsg"), [
      { text: t("action.cancel"), style: "cancel" },
      {
        text: t("child.delete"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteChild.mutateAsync({ id: params.id as string, familyId });
              router.back();
            } catch {
              /* error rendered on next render */
            }
          })();
        },
      },
    ]);
  }

  const allergySuggestions = ALLERGY_KEYS.filter((key) => !allergies.has(key));

  return (
    <Screen scroll>
      <TopBar
        title={titleText}
        sub={subText}
        leading={
          <Pressable
            onPress={() => router.back()}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t("action.back")}
            className="h-9 w-9 items-center justify-center rounded-xl border border-line bg-card active:opacity-70"
          >
            <Icon name="chevron-left" size={16} color={theme.inkSecondary} />
          </Pressable>
        }
        hideSettings
      />

      {isEdit && childQ.isLoading ? (
        <View className="items-center py-10">
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : isEdit && childQ.isError ? (
        <Card className="items-center py-6">
          <Text variant="body" tone="inkSecondary">
            {t("familie.loadError")}
          </Text>
        </Card>
      ) : isEdit && childQ.data === null ? (
        <Card className="items-center py-6">
          <Text variant="body" tone="inkSecondary">
            {t("child.notFound")}
          </Text>
        </Card>
      ) : (
        <>
          <View className="mb-5 items-center">
            <ChildAvatar name={name || "+"} color={color} size="xl" />
            <View className="mt-3 flex-row gap-2">
              {AVATAR_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("child.colorOption")}
                  accessibilityState={{ selected: color === c }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: c,
                    borderWidth: 2,
                    borderColor: color === c ? theme.ink : "transparent",
                  }}
                />
              ))}
            </View>
          </View>

          {errorKey ? (
            <View
              className="mb-4 rounded-xl border border-danger bg-danger-soft p-3"
              accessibilityRole="alert"
            >
              <Text variant="body" tone="danger">
                {t(errorKey)}
              </Text>
            </View>
          ) : null}

          <View className="gap-3.5">
            <Field
              label={t("child.name")}
              value={name}
              onChangeText={setName}
              placeholder={t("child.namePlaceholder")}
            />

            <Field
              label={t("child.birthday")}
              iconName="cake"
              value={birthday ? format(birthday, "dd.MM.yyyy") : ""}
              onPress={() => setPickerOpen(true)}
              placeholder={t("child.birthdayPlaceholder")}
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
              label={t("child.school")}
              iconName="school"
              value={school}
              onChangeText={setSchool}
              placeholder={t("child.schoolPlaceholder")}
            />

            <Field
              label={t("child.grade")}
              iconName="book-open"
              value={grade}
              onChangeText={setGrade}
              placeholder={t("child.gradePlaceholder")}
            />

            <View className="mt-2">
              <View className="mb-2 flex-row items-center justify-between">
                <Text variant="caption" tone="inkSecondary" style={LABEL_STYLE}>
                  {t("child.allergies")}
                </Text>
                <Icon name="alert-triangle" size={14} color={theme.warning} />
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {Array.from(allergies).map((a) => (
                  <Pressable key={a} onPress={() => toggleAllergy(a)} className="active:opacity-70">
                    <Pill
                      label={
                        ALLERGY_KEYS.includes(a as (typeof ALLERGY_KEYS)[number])
                          ? t(`onb.s4.allergies.${a}`)
                          : a
                      }
                      tone="warn"
                      leading={<Icon name="check" size={11} color={theme.accentStrong} />}
                    />
                  </Pressable>
                ))}
                {allergySuggestions.map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => toggleAllergy(key)}
                    className="active:opacity-70"
                  >
                    <Pill label={t(`onb.s4.allergies.${key}`)} tone="ink" />
                  </Pressable>
                ))}
              </View>
            </View>

            <TagEditor
              label={t("child.likes")}
              tags={likes}
              tone="success"
              placeholder={t("child.likesAdd")}
              onAdd={(v) => setLikes((prev) => [...prev, v])}
              onRemove={(v) => setLikes((prev) => prev.filter((x) => x !== v))}
            />

            <TagEditor
              label={t("child.dislikes")}
              tags={dislikes}
              tone="ink"
              placeholder={t("child.dislikesAdd")}
              onAdd={(v) => setDislikes((prev) => [...prev, v])}
              onRemove={(v) => setDislikes((prev) => prev.filter((x) => x !== v))}
            />

            <Button
              label={`${t("child.voiceAdd")} · ${t("auth.soon")}`}
              variant="soft"
              tone="accent"
              block
              className="mt-2"
              disabled
            />
            <Button
              label={t("action.save")}
              tone="primary"
              block
              size="lg"
              loading={isSaving}
              disabled={!canSubmit}
              onPress={() => {
                void onSave();
              }}
            />
            {isEdit ? (
              <Button
                label={t("child.delete")}
                tone="danger"
                variant="soft"
                block
                loading={deleteChild.isPending}
                onPress={onDelete}
              />
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}
