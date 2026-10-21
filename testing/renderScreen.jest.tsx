import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";

import { useTheme } from "@/design-system/ThemeProvider";
import i18n from "@/features/i18n";
import { supabase } from "@/features/supabase";

import { createTestQueryClient, renderScreen } from "./renderScreen";

function Probe() {
  const { t } = useTranslation();
  useTheme();
  const { data } = useQuery({
    queryKey: ["probe"],
    queryFn: () => {
      throw new Error("darf nie laufen");
    },
  });
  return (
    <>
      <Text>{t("action.cancel")}</Text>
      <Text>{data}</Text>
    </>
  );
}

describe("renderScreen", () => {
  it("rendert deutsch, im Theme und aus dem vorbefüllten Cache", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["probe"], "aus dem Cache");
    const { getByText } = await renderScreen(<Probe />, { queryClient });
    expect(i18n.language).toBe("de");
    expect(getByText(i18n.t("action.cancel"))).toBeTruthy();
    expect(getByText("aus dem Cache")).toBeTruthy();
  });

  it("gibt jedem Aufruf einen eigenen, nie veraltenden QueryClient", async () => {
    const a = await renderScreen(<Text>a</Text>);
    const b = await renderScreen(<Text>b</Text>);
    expect(a.queryClient).not.toBe(b.queryClient);
    expect(a.queryClient.getDefaultOptions().queries).toMatchObject({
      retry: false,
      staleTime: Infinity,
      gcTime: Infinity,
    });
  });

  it("lässt jeden Supabase-Zugriff laut scheitern", () => {
    expect(() => supabase.from("tasks")).toThrow(/from/);
  });
});
