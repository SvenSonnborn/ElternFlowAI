import { addDays, format, startOfWeek } from "date-fns";

import type { MealPlanDay, MealPlanEntryWithRecipe, MealSlot } from "./types";

/**
 * Ein Kalendertag als `yyyy-MM-dd` aus **lokaler** Zeit. `meal_plan_entries.date`
 * ist eine `date`-Spalte ohne Zone; `toISOString()` auf lokaler Mitternacht
 * würde östlich von UTC einen Tag zu früh landen.
 */
export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Der Montag der Woche, in der `date` liegt. DE ist primäre Locale. */
export function weekStartFor(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** Die sieben Kalendertage einer Woche, Mo–So. */
export function weekDayKeys(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, offset) => toDateKey(addDays(weekStart, offset)));
}

/**
 * Alle vier Slots leer. Als Literal statt aus einer Konstante gebaut: wächst das
 * `meal_slot_enum`, bricht hier der Typcheck — genau da, wo eine Entscheidung
 * fällig ist.
 */
function emptySlots(): Record<MealSlot, MealPlanEntryWithRecipe | null> {
  return { breakfast: null, lunch: null, dinner: null, snack: null };
}

/**
 * Die Woche als genau sieben Tage — leere eingeschlossen, damit das Mo–So-Raster
 * aus `patterns/meals.md` ohne Sonderbehandlung für Lücken rendert.
 *
 * Höchstens ein Eintrag je Tag und Slot ist keine Annahme, sondern das
 * `unique (family_id, date, meal_slot)` aus der Migration.
 */
export function groupByDay(
  entries: MealPlanEntryWithRecipe[],
  weekStart: Date,
  today: Date,
): MealPlanDay[] {
  const todayKey = toDateKey(today);
  const days = new Map<string, MealPlanDay>();

  for (const date of weekDayKeys(weekStart)) {
    days.set(date, { date, isToday: date === todayKey, slots: emptySlots() });
  }

  for (const entry of entries) {
    // PostgREST liefert eine `date`-Spalte bereits als 'yyyy-MM-dd'.
    const day = days.get(entry.date);
    // Die Query filtert das Fenster schon; das hier fängt den Fall ab, dass ein
    // Aufrufer eine andere Woche gruppiert als die, die er geladen hat.
    if (!day) continue;
    day.slots[entry.meal_slot] = entry;
  }

  return [...days.values()];
}

/**
 * Der Slot, den der Nutzer gerade meint. Regel aus `patterns/meals.md`
 * ("Behaviour rules"): vor 11 Frühstück, 11–15 Mittag, sonst Abendessen.
 * `snack` wird nie automatisch gewählt.
 */
export function slotForTime(now: Date): MealSlot {
  const hour = now.getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  return "dinner";
}
