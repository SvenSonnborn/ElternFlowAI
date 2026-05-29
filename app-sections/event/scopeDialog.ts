import { ActionSheetIOS, Alert, Platform } from "react-native";

import type { EditScope } from "@/features/calendar";

export interface ScopeDialogLabels {
  title: string;
  this: string;
  forward: string;
  all: string;
  cancel: string;
}

/**
 * Shows a 3-option scope picker for recurring events.
 * Resolves to "this" | "forward" | "all" or `null` if the user cancelled.
 */
export function pickScope(labels: ScopeDialogLabels): Promise<EditScope | null> {
  if (Platform.OS === "ios") {
    return new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: labels.title,
          options: [labels.this, labels.forward, labels.all, labels.cancel],
          cancelButtonIndex: 3,
        },
        (idx) => {
          if (idx === 0) resolve("this");
          else if (idx === 1) resolve("forward");
          else if (idx === 2) resolve("all");
          else resolve(null);
        },
      );
    });
  }
  return new Promise((resolve) => {
    Alert.alert(
      labels.title,
      undefined,
      [
        { text: labels.this, onPress: () => resolve("this") },
        { text: labels.forward, onPress: () => resolve("forward") },
        { text: labels.all, onPress: () => resolve("all") },
        { text: labels.cancel, style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
