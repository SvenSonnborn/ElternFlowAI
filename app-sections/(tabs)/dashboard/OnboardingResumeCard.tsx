import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button, Card, Text } from "@/design-system/ui";
import { ONBOARDING_RESUME_HREF, type OnboardingResumeStep } from "@/features/auth";

/**
 * Sub-Copy und Button-Label je offenem Schritt. Die Labels sind bewusst die
 * beiden Keys aus `dash.empty.*`: es sind dieselben zwei Aktionen wie im
 * Empty-State-Screen, und zwei Übersetzungen für denselben Satz driften.
 */
const COPY = {
  3: { sub: "dash.resume.invite", cta: "dash.empty.invite" },
  4: { sub: "dash.resume.child", cta: "dash.empty.addChild" },
} as const satisfies Record<OnboardingResumeStep, { sub: string; cta: string }>;

interface OnboardingResumeCardProps {
  step: OnboardingResumeStep;
}

/**
 * Die „Einrichtung fortsetzen"-Karte für User, die das Onboarding nach Step 2
 * verlassen haben (siehe {@link onboardingResumeStep}).
 *
 * Steht ganz oben, über der ersten Sektion: die Leer-Karten von „Heute",
 * Meal-Hero und „Morgen vorbereiten" beschreiben einen Tag, diese Karte den
 * Zustand des Accounts. Eine einzelne, solide CTA — der Meal-Hero ist die
 * einzige andere Aktion in Sicht und trägt bewusst `variant="soft"`.
 */
export function OnboardingResumeCard({ step }: OnboardingResumeCardProps) {
  const { t } = useTranslation();
  const copy = COPY[step];

  return (
    <Card className="mb-1 gap-3">
      <View>
        <Text variant="listTitle" tone="ink">
          {t("dash.resume.title")}
        </Text>
        <Text variant="caption" tone="inkSecondary">
          {t(copy.sub)}
        </Text>
      </View>
      <Button
        label={t(copy.cta)}
        tone="primary"
        variant="solid"
        block
        onPress={() => router.push(ONBOARDING_RESUME_HREF[step])}
      />
    </Card>
  );
}
