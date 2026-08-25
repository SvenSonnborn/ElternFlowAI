import type { Translate } from "@/features/shared";

import { palette } from "@/design-system";

import type { Child, Parent } from "./types";

/** Resolves a list of `sample.food.*` keys in the caller's language. */
function foods(translate: Translate, keys: string[]): string[] {
  return keys.map((key) => translate(`sample.food.${key}`));
}

/**
 * Nothing on a `Parent` is copy — a person's name, their short form and their
 * e-mail address read the same in every language, so this stays a constant
 * instead of taking a `Translate` it would never use.
 */
export const sampleParents: Parent[] = [
  { name: "Anna Becker", short: "Anna", email: "anna@becker.de", color: palette.mint[500] },
  { name: "Tobias Becker", short: "Tobi", email: "tobi@becker.de", color: palette.orange[500] },
];

/**
 * School, grade and food preferences are copy and come from `sample.*`; names,
 * ids, ages, colours and allergy keys do not. `birthday` stays DD.MM.YYYY in
 * both languages — that is the format `child.birthdayPlaceholder` asks for in
 * the EN catalog too.
 */
export function getSampleChildren(translate: Translate): Child[] {
  return [
    {
      id: "ben",
      name: "Ben",
      age: 8,
      color: palette.avatar.sky,
      school: translate("sample.school.ben"),
      grade: translate("sample.grade.ben"),
      birthday: "04.07.2017",
      allergies: ["peanuts"],
      likes: foods(translate, ["spaghetti", "pizza", "strawberries", "pancakes", "apple"]),
      dislikes: foods(translate, ["mushrooms", "spinach", "cauliflower"]),
    },
    {
      id: "mia",
      name: "Mia",
      age: 5,
      color: palette.avatar.pink,
      school: translate("sample.school.mia"),
      grade: translate("sample.grade.mia"),
      birthday: "18.09.2020",
      allergies: ["milk"],
      likes: foods(translate, ["yogurt", "banana", "rice"]),
      dislikes: foods(translate, ["tomatoes"]),
    },
    {
      id: "leo",
      name: "Leo",
      age: 12,
      color: palette.avatar.violet,
      school: translate("sample.school.leo"),
      grade: translate("sample.grade.leo"),
      birthday: "30.11.2013",
      allergies: [],
      likes: foods(translate, ["burger", "sushi"]),
      dislikes: foods(translate, ["fish", "broccoli"]),
    },
  ];
}

/**
 * The one piece of sample copy that reaches a production screen: the Dashboard
 * subtitle renders it via `dash.subtitle`. Tracked in docs/TODO.md to be
 * replaced by the real `families.name` once it is decided what the subtitle
 * shows while that query is still loading.
 */
export function getSampleFamilyName(translate: Translate): string {
  return translate("sample.family.name");
}
