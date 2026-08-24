import { addDays, format, set, startOfDay, startOfWeek } from "date-fns";
import { de as deLocale, enUS as enLocale } from "date-fns/locale";

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
 * Der Datumsbereich einer Woche als Text — „11.–17. Mai" bzw. „May 11–17".
 *
 * Wechselt die Woche den Monat, muss er zweimal auftauchen („27. Apr. – 3.
 * Mai"): „27.–3. Mai" wäre schlicht falsch. Der Trenner folgt derselben Regel
 * wie im Duden und im Chicago Manual — ohne Leerzeichen zwischen zwei nackten
 * Zahlen, mit Leerzeichen, sobald beide Seiten einen Monat tragen.
 *
 * Die Sprache steuert mehr als den Monatsnamen, deshalb zwei Muster statt
 * eines lokalisierten: Deutsch stellt den Tag voran und punktiert ihn, Englisch
 * stellt den Monat voran — dieselbe Begründung wie `dueDatePattern` in
 * app-sections/task/TaskForm.tsx.
 *
 * `date` darf irgendein Tag der Woche sein; wie `useMealPlans` zieht die
 * Funktion selbst auf den Montag, damit Label und Raster nie auseinanderlaufen.
 */
export function formatWeekRange(date: Date, lang: "de" | "en"): string {
  const start = weekStartFor(date);
  const end = addDays(start, 6);
  const locale = lang === "de" ? deLocale : enLocale;
  const spansMonths = start.getMonth() !== end.getMonth();

  if (lang === "de") {
    return spansMonths
      ? `${format(start, "d. MMM", { locale })} – ${format(end, "d. MMM", { locale })}`
      : `${format(start, "d.")}–${format(end, "d. MMMM", { locale })}`;
  }

  return spansMonths
    ? `${format(start, "MMM d", { locale })} – ${format(end, "MMM d", { locale })}`
    : `${format(start, "MMMM d", { locale })}–${format(end, "d")}`;
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
 * `snack` wird nie automatisch gewählt — der Rückgabetyp schließt ihn deshalb
 * aus, statt Aufrufer einen unerreichbaren Zweig schreiben zu lassen.
 */
export function slotForTime(now: Date): Exclude<MealSlot, "snack"> {
  const hour = now.getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  return "dinner";
}

/**
 * Der nächste Zeitpunkt, zu dem `slotForTime` etwas anderes liefert.
 *
 * Drei Grenzen, nicht zwei: 11:00 und 15:00 innerhalb des Tages, dazu
 * Mitternacht — nach 15:00 gilt `dinner` bis zum Tageswechsel, danach wieder
 * `breakfast`. `startOfDay(addDays(…))` rechnet kalendarisch und übersteht
 * damit die DST-Umstellung, die ein `+24h` verfehlen würde.
 */
export function nextSlotBoundary(now: Date): Date {
  const hour = now.getHours();
  if (hour < 11) return set(now, { hours: 11, minutes: 0, seconds: 0, milliseconds: 0 });
  if (hour < 15) return set(now, { hours: 15, minutes: 0, seconds: 0, milliseconds: 0 });
  return startOfDay(addDays(now, 1));
}
