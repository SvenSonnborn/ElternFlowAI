import type { IconName } from "@/app-sections/shared";

export interface CalendarOccurrence {
  eventId: string;
  occurrenceDate: string;
  startAt: Date;
  endAt: Date;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  childId: string | null;
  isException: boolean;
  isRecurring: boolean;
  type: {
    slug: string;
    color: string;
    iconName: IconName;
    labelDe: string;
    labelEn: string;
  };
}

export interface MarkedDot {
  key: string;
  color: string;
}

export type MarkedDates = Record<
  string,
  {
    dots?: MarkedDot[];
    marked?: boolean;
    selected?: boolean;
    selectedColor?: string;
  }
>;
