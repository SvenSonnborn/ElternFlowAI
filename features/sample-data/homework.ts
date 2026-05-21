import { palette } from "@/design-system";

import type { HomeworkByChild } from "./types";

export const homeworkByChild: HomeworkByChild[] = [
  {
    childId: "ben",
    items: [
      {
        id: "hw-ben-1",
        subject: "Mathe",
        subjectEn: "Maths",
        title: "Seite 24, Aufgabe 3–7",
        titleEn: "Page 24, ex. 3–7",
        due: "heute",
        dueEn: "today",
        tone: palette.event.sport,
        isUrgent: true,
      },
      {
        id: "hw-ben-2",
        subject: "Deutsch",
        subjectEn: "German",
        title: "Lesetagebuch · 1 Eintrag",
        titleEn: "Reading diary · 1 entry",
        due: "morgen",
        dueEn: "tomorrow",
        tone: palette.event.schule,
      },
    ],
  },
  {
    childId: "leo",
    items: [
      {
        id: "hw-leo-1",
        subject: "Englisch",
        subjectEn: "English",
        title: "Vokabeln Unit 6 · Test Fr.",
        titleEn: "Unit 6 vocab · test Fri",
        due: "Freitag",
        dueEn: "Friday",
        tone: palette.event.arzt,
      },
      {
        id: "hw-leo-2",
        subject: "Bio",
        subjectEn: "Biology",
        title: "Referat: Photosynthese",
        titleEn: "Photosynthesis report",
        due: "21. Mai",
        dueEn: "May 21",
        tone: palette.event.schule,
      },
      {
        id: "hw-leo-3",
        subject: "Mathe",
        subjectEn: "Maths",
        title: "Übung 5b",
        titleEn: "Exercise 5b",
        due: "erledigt",
        dueEn: "done",
        tone: palette.event.meal,
        isDone: true,
      },
    ],
  },
];

export const homeworkStats = {
  dueToday: 2,
  thisWeek: 3,
  donePct: 87,
  open: 4,
  doneTodayLabel: 1,
};
