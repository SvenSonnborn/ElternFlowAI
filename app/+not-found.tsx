import { Link, Stack } from "expo-router";

import { Button, Screen, Text } from "@/design-system/ui";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "404" }} />
      <Screen>
        <Text variant="hero">404</Text>
        <Text variant="body" tone="inkSecondary" className="mt-3">
          Diese Seite gibt es nicht.
        </Text>
        <Link href="/" asChild>
          <Button label="Zur Startseite" className="mt-6" />
        </Link>
      </Screen>
    </>
  );
}
