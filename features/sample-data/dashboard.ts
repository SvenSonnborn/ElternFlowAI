import { palette } from "@/design-system";

import type { CalendarEvent, MealPick, PrepItem } from "./types";

export const todayEvents: CalendarEvent[] = [
  {
    id: "evt-1",
    time: "08:00",
    durationMin: 60,
    title: "Schule",
    childId: "ben",
    who: "Ben · Schule",
    type: "schule",
    tone: palette.event.schule,
    iconName: "school",
  },
  {
    id: "evt-2",
    time: "14:00",
    durationMin: 60,
    title: "Kinderarzt Dr. Weber",
    childId: "mia",
    who: "Mia · Arzt",
    type: "arzt",
    tone: palette.event.arzt,
    iconName: "doctor",
  },
  {
    id: "evt-3",
    time: "16:30",
    durationMin: 75,
    title: "Fußballtraining",
    childId: "ben",
    who: "Ben · Sport",
    type: "sport",
    tone: palette.event.sport,
    iconName: "ball",
  },
  {
    id: "evt-4",
    time: "18:00",
    durationMin: 30,
    title: "Mathe-Hausaufgaben",
    childId: "leo",
    who: "Leo · HA",
    type: "ha",
    tone: palette.event.ha,
    iconName: "book-open",
  },
];

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
