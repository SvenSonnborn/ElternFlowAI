import { palette } from "@/design-system";

import type { CalendarDayCell } from "./types";

import { todayEvents } from "./dashboard";

// May 2026 starts on a Friday. ISO week: Mo–So.
// Pre-pad with last 3 days of April (28, 29, 30) so the grid begins on Monday.
// Visible cells: 6 rows × 7 cols = 42.
const TODAY = 14;

const dotMap: Record<number, string[]> = {
  14: [palette.event.arzt, palette.event.sport, palette.event.schule],
  16: [palette.event.arzt],
  18: [palette.event.sport, palette.event.ha],
  21: [palette.event.schule],
  24: [palette.event.arzt, palette.event.sport, palette.event.ha],
  27: [palette.event.sport],
};

function buildMonthGrid(): CalendarDayCell[] {
  const cells: CalendarDayCell[] = [];
  // April 27–30 are previous-month padding (Mon–Thu)
  for (let n = 27; n <= 30; n++) {
    cells.push({ day: n, isCurrentMonth: false, isToday: false, dots: [] });
  }
  // May 1–31
  for (let n = 1; n <= 31; n++) {
    cells.push({
      day: n,
      isCurrentMonth: true,
      isToday: n === TODAY,
      dots: dotMap[n] ?? [],
    });
  }
  // Pad to 42 with June 1+
  let pad = 1;
  while (cells.length < 42) {
    cells.push({ day: pad++, isCurrentMonth: false, isToday: false, dots: [] });
  }
  return cells;
}

export const monthGridMay2026 = buildMonthGrid();
export const monthLabelDe = "Mai";
export const monthLabelEn = "May";
export const yearLabel = 2026;
export const selectedDayDe = "Mittwoch, 14. Mai";
export const selectedDayEn = "Wednesday, May 14";

// Reuse today's events for the selected day list.
export { todayEvents as selectedDayEvents };
