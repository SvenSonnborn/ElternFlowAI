import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";

import { DS } from "@/design-system";
import { Button, Card, Text } from "@/design-system/ui";

import { Icon } from "./Icon";

export function VoiceAssistantFAB() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const size = DS.components.micFab.size;
  const right = DS.components.micFab.rightInset;
  const bottom = DS.components.micFab.bottomInset;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("voice.fab.label")}
        onPress={() => setOpen(true)}
        className="absolute items-center justify-center rounded-pill bg-accent active:opacity-90"
        style={{
          width: size,
          height: size,
          right,
          bottom,
          shadowColor: "#FF9F1C",
          shadowOpacity: 0.34,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 12 },
          elevation: 10,
        }}
      >
        <Icon name="mic" size={26} color="#FFFFFF" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 items-center justify-center bg-overlay p-6">
          <Card className="w-full max-w-md">
            <Text variant="eyebrow" tone="accentStrong">
              {t("voice.overlay.eyebrow")}
            </Text>
            <Text variant="h2" className="mt-2">
              {t("voice.overlay.prompt")}
            </Text>
            <Text variant="meta" tone="inkSecondary" className="mt-3">
              {t("voice.overlay.exampleEvent")}
            </Text>
            <Button
              label={t("action.cancel")}
              variant="soft"
              tone="neutral"
              block
              className="mt-5"
              onPress={() => setOpen(false)}
            />
          </Card>
        </View>
      </Modal>
    </>
  );
}
