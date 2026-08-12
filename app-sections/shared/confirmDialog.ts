import { Alert, Platform } from "react-native";

export interface ConfirmLabels {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
}

/**
 * A yes/no question for a destructive action, resolved as a promise — same
 * shape as `pickScope` in app-sections/event/scopeDialog.ts.
 *
 * The web branch exists because react-native-web has no `Alert`
 * implementation: on web the call is a no-op, so a delete guarded by Alert
 * would silently never happen.
 */
export function confirmDestructive(labels: ConfirmLabels): Promise<boolean> {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(`${labels.title}\n\n${labels.body}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      labels.title,
      labels.body,
      [
        { text: labels.cancel, style: "cancel", onPress: () => resolve(false) },
        { text: labels.confirm, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
