import { useLocalSearchParams } from "expo-router";

import { Step2FamilyAndName } from "./Step2FamilyAndName";
import { Step3InvitePartner } from "./Step3InvitePartner";
import { Step4FirstChild } from "./Step4FirstChild";
import { Step5Done } from "./Step5Done";

export function OnboardingStepScreen() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  switch (step) {
    case "2":
      return <Step2FamilyAndName />;
    case "3":
      return <Step3InvitePartner />;
    case "4":
      return <Step4FirstChild />;
    case "5":
      return <Step5Done />;
    default:
      return <Step2FamilyAndName />;
  }
}
