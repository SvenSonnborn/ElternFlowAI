import type { OpaqueColorValue } from "react-native";

import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

type FeatherName = React.ComponentProps<typeof Feather>["name"];
type MCIName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type LucideAlias =
  | "home"
  | "calendar"
  | "book-open"
  | "users"
  | "user"
  | "settings"
  | "mic"
  | "plus"
  | "check"
  | "chevron-right"
  | "chevron-left"
  | "chevron-down"
  | "chevron-up"
  | "bell"
  | "heart"
  | "clock"
  | "map-pin"
  | "shopping-cart"
  | "more-horizontal"
  | "alert-triangle"
  | "arrow-right"
  | "edit"
  | "mail"
  | "lock"
  | "trash"
  | "eye"
  | "filter"
  | "search"
  | "shield"
  | "globe"
  | "moon"
  | "utensils"
  | "school"
  | "cake"
  | "doctor"
  | "ball"
  | "sparkles"
  | "fire";

const featherMap: Partial<Record<LucideAlias, FeatherName>> = {
  home: "home",
  calendar: "calendar",
  "book-open": "book-open",
  users: "users",
  user: "user",
  settings: "settings",
  mic: "mic",
  plus: "plus",
  check: "check",
  "chevron-right": "chevron-right",
  "chevron-left": "chevron-left",
  "chevron-down": "chevron-down",
  "chevron-up": "chevron-up",
  bell: "bell",
  heart: "heart",
  clock: "clock",
  "map-pin": "map-pin",
  "shopping-cart": "shopping-cart",
  "more-horizontal": "more-horizontal",
  "alert-triangle": "alert-triangle",
  "arrow-right": "arrow-right",
  edit: "edit-2",
  mail: "mail",
  lock: "lock",
  trash: "trash-2",
  eye: "eye",
  filter: "filter",
  search: "search",
  shield: "shield",
  globe: "globe",
  moon: "moon",
};

const mciMap: Partial<Record<LucideAlias, MCIName>> = {
  utensils: "silverware-fork-knife",
  school: "school",
  cake: "cake-variant",
  doctor: "stethoscope",
  ball: "soccer",
  sparkles: "star-four-points",
  fire: "fire",
};

interface IconProps {
  name: LucideAlias;
  size?: number;
  color?: string | OpaqueColorValue;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, color = "currentColor", strokeWidth: _ }: IconProps) {
  const feather = featherMap[name];
  if (feather) return <Feather name={feather} size={size} color={color} />;
  const mci = mciMap[name];
  if (mci) return <MaterialCommunityIcons name={mci} size={size} color={color} />;
  return null;
}

export type { LucideAlias as IconName };
