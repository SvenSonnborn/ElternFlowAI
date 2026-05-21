import { palette } from "@/design-system";

import type { Child, Parent } from "./types";

export const parents: Parent[] = [
  { name: "Anna Becker", short: "Anna", email: "anna@becker.de", color: palette.mint[500] },
  { name: "Tobias Becker", short: "Tobi", email: "tobi@becker.de", color: palette.orange[500] },
];

export const children: Child[] = [
  {
    id: "ben",
    name: "Ben",
    age: 8,
    color: palette.avatar.sky,
    school: "Grundschule am Park",
    grade: "2. Klasse",
    birthday: "04.07.2017",
    allergies: ["Erdnüsse"],
    likes: ["Spaghetti", "Pizza", "Erdbeeren", "Pfannkuchen", "Apfel"],
    dislikes: ["Pilze", "Spinat", "Blumenkohl"],
  },
  {
    id: "mia",
    name: "Mia",
    age: 5,
    color: palette.avatar.pink,
    school: "Kita Sonnenblume",
    grade: "Vorschule",
    birthday: "18.09.2020",
    allergies: ["Laktose"],
    likes: ["Joghurt", "Banane", "Reis"],
    dislikes: ["Tomaten"],
  },
  {
    id: "leo",
    name: "Leo",
    age: 12,
    color: palette.avatar.violet,
    school: "Gymnasium Goethe",
    grade: "7. Klasse",
    birthday: "30.11.2013",
    allergies: [],
    likes: ["Burger", "Sushi"],
    dislikes: ["Fisch", "Brokkoli"],
  },
];

export const familyName = "Familie Becker";
