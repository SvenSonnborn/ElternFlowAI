import type { IconName } from "@/app-sections/shared";

export type EventType = "schule" | "arzt" | "sport" | "ha" | "family" | "meal";

export interface Parent {
  name: string;
  short: string;
  email: string;
  color: string;
}

export interface Child {
  id: string;
  name: string;
  age: number;
  color: string;
  school: string;
  grade: string;
  birthday: string;
  allergies: string[];
  likes: string[];
  dislikes: string[];
}

export interface CalendarEvent {
  id: string;
  time: string;
  durationMin: number;
  title: string;
  childId?: string;
  who: string;
  type: EventType;
  tone: string;
  iconName: IconName;
}

export interface PrepItem {
  id: string;
  title: string;
  tone: "mint" | "orange" | "warn";
  iconName: IconName;
}

export interface MealPick {
  id: string;
  title: string;
  emoji: string;
  durationMin: number;
  reason: string;
  reasonItems: string[];
}

export interface WeeklyMeal {
  weekdayShort: string;
  weekdayShortEn: string;
  date: number;
  emoji: string;
  name: string;
  nameEn: string;
  durationMin: number;
  isToday: boolean;
}

export interface CalendarDayCell {
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  dots: string[];
}
