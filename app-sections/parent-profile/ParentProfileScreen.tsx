import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";

import { ChildAvatar, Field, Icon, TopBar } from "@/app-sections/shared";
import { useTheme } from "@/design-system/ThemeProvider";
import { Button, Card, Screen, Text } from "@/design-system/ui";
import {
  AVATAR_COLORS,
  capShort,
  deriveShort,
  mapAuthError,
  normalizeShort,
  useCurrentParent,
  useParent,
  useSession,
  useUpdateParent,
} from "@/features/auth";

export function ParentProfileScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();

  const { session } = useSession();
  const me = useCurrentParent();
  const parentQ = useParent(params.id);
  const updateParent = useUpdateParent();

  // Only the signed-in parent's own row is writable ("parents: update self").
  // A partner's row opens as a read-only view rather than a form that would
  // fail at the policy.
  const isSelf = me.data?.id !== undefined && me.data.id === params.id;

  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [color, setColor] = useState<string>(AVATAR_COLORS[0]);
  // `name` is NOT NULL, so an empty field can only mean the user cleared it —
  // but only after they have touched it. Before that, an empty field is just an
  // unhydrated one and must stay silent.
  const [nameTouched, setNameTouched] = useState(false);

  // Hydrate the form once per loaded row (a refetch must not clobber edits).
  const hydratedId = useRef<string | null>(null);
  useEffect(() => {
    const row = parentQ.data;
    if (!row || hydratedId.current === row.id) return;
    setName(row.name);
    setShort(row.short);
    setColor(row.color);
    hydratedId.current = row.id;
  }, [parentQ.data]);

  const trimmedName = name.trim();
  const errorKey = updateParent.error ? mapAuthError(updateParent.error) : null;
  const nameError = nameTouched && trimmedName.length === 0 ? t("parent.nameRequired") : undefined;
  const canSubmit = Boolean(params.id) && trimmedName.length > 0 && !updateParent.isPending;

  async function onSave() {
    if (!canSubmit || !params.id) return;
    try {
      await updateParent.mutateAsync({
        id: params.id,
        name: trimmedName,
        short: normalizeShort(short, trimmedName),
        color,
      });
      // No success alert: the invalidated queries repaint the family roster
      // behind this screen, so going back *is* the confirmation.
      router.back();
    } catch {
      /* error rendered below */
    }
  }

  const isLoading = parentQ.isLoading || me.isLoading;
  const isError = parentQ.isError || me.isError;
  const row = parentQ.data;

  const title = isSelf ? t("parent.editTitle", { name: trimmedName || "…" }) : (row?.name ?? "");
  const sub = isSelf ? t("parent.editSub") : t("parent.viewSub");

  return (
    <Screen scroll>
      <TopBar
        title={title}
        sub={sub}
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

      {isLoading ? (
        <View className="items-center py-10">
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : isError ? (
        <Card className="items-center py-6">
          <Text variant="body" tone="inkSecondary">
            {t("familie.loadError")}
          </Text>
        </Card>
      ) : !row ? (
        <Card className="items-center py-6">
          <Text variant="body" tone="inkSecondary">
            {t("parent.notFound")}
          </Text>
        </Card>
      ) : (
        <>
          <View className="mb-5 items-center">
            <ChildAvatar
              name={name}
              // Preview exactly what a save would store, so an emptied field
              // visibly falls back to the name-derived default.
              short={isSelf ? normalizeShort(short, trimmedName) : row.short}
              color={color}
              size="xl"
            />
            {isSelf ? (
              // Each swatch sits centred in its own 44x44 box, and the boxes tile
              // edge to edge. The earlier `hitSlop={8}` on a 28px swatch also
              // measured 44, but the slop of neighbouring swatches met inside the
              // 8px gap: a tap just right of one swatch landed on the next.
              <View className="mt-3 flex-row">
                {AVATAR_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setColor(c)}
                    accessibilityRole="button"
                    accessibilityLabel={t("parent.colorOption")}
                    accessibilityState={{ selected: color === c }}
                    className="h-11 w-11 items-center justify-center"
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: c,
                        borderWidth: 2,
                        borderColor: color === c ? theme.ink : "transparent",
                      }}
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}
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
              label={t("parent.name")}
              value={name}
              onChangeText={
                isSelf
                  ? (v) => {
                      setName(v);
                      setNameTouched(true);
                    }
                  : undefined
              }
              editable={isSelf}
              placeholder={t("parent.namePlaceholder")}
              error={nameError}
              autoCapitalize="words"
            />

            <View>
              <Field
                label={t("parent.short")}
                value={short}
                onChangeText={isSelf ? (v) => setShort(capShort(v)) : undefined}
                editable={isSelf}
                placeholder={deriveShort(trimmedName)}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {isSelf ? (
                <Text variant="caption" tone="inkTertiary" className="mt-1.5">
                  {t("parent.shortHint")}
                </Text>
              ) : null}
            </View>

            {/* The email lives in auth.users, not on the parents row — readable
                for yourself out of the session, never for a partner. */}
            {isSelf ? (
              <View>
                <Field
                  label={t("parent.email")}
                  value={session?.user.email ?? "—"}
                  editable={false}
                />
                <Text variant="caption" tone="inkTertiary" className="mt-1.5">
                  {t("parent.emailHint")}
                </Text>
              </View>
            ) : null}

            {isSelf ? (
              <Button
                label={t("action.save")}
                tone="primary"
                block
                size="lg"
                className="mt-2"
                loading={updateParent.isPending}
                disabled={!canSubmit}
                onPress={() => {
                  void onSave();
                }}
              />
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}
