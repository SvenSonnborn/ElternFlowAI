import { addDays, startOfDay } from "date-fns";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

/**
 * Local midnight today, refreshed when the calendar day turns over. The
 * returned Date keeps its identity for the whole day, so the query key derived
 * from it holds still.
 *
 * Two triggers, because neither covers the other: the timer catches midnight
 * while the app is in the foreground, and the AppState listener catches the
 * midnights that passed while it was backgrounded — JS timers are suspended
 * there and would never fire.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const sync = () => {
      const current = startOfDay(new Date());
      // Keep the old instance when the day has not changed, so consumers'
      // memos and the query key do not churn on every foreground event.
      setToday((prev) => (prev.getTime() === current.getTime() ? prev : current));
    };

    // `addDays` on a local midnight lands on the next local midnight, so this
    // survives DST shifts that a flat +24h would get wrong. The extra second
    // keeps a timer that fires a hair early from re-arming at ~0ms.
    const timer = setTimeout(sync, addDays(today, 1).getTime() - Date.now() + 1_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [today]);

  return today;
}
