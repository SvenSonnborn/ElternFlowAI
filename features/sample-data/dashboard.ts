import type { MealPick, PrepItem } from "./types";

export const tomorrowPrep: PrepItem[] = [
  { id: "p-1", title: "Schwimmsachen für Mia einpacken", tone: "orange", iconName: "school" },
  { id: "p-2", title: "Geschenk für Lisas Geburtstag (Sa.)", tone: "mint", iconName: "cake" },
  { id: "p-3", title: "Leo: Englisch-Vokabeln üben", tone: "warn", iconName: "book-open" },
];

export const mealPick: MealPick = {
  id: "meal-1",
  title: "Spaghetti mit Tomatensauce",
  emoji: "🍝",
  durationMin: 20,
  reason: "Ben liebt Nudeln · keine Allergien · 20 Min.",
  reasonItems: ["Ben liebt Nudeln", "Keine Allergien betroffen", "20 Minuten Zubereitung"],
};
