# Pattern · Dashboard (populated)

The most-used screen. Opens to a snapshot of "today" — what's coming up, what to eat, what to prep.

## Goal

- Answer in one glance: **what's happening today, who's affected, what's for dinner, what to remember for tomorrow.**
- Make the AI feel useful from second one. The meal hero is the proof.

## Anatomy (top → bottom)

1. **Top bar** — `dash.greeting.morning` (or `.day`), with family name + date subtitle. Gear icon top-right.
2. **Family avatar row** _(V1)_ — quick switcher / overview. Tap to filter the dashboard by person. Trailing `+` chip adds a new member.
3. **"Heute" section** — list of today's events.
   - Each row: `[time]  [tone-tinted icon]  [title + who/tag]  [chev]`
   - Tone is by event type: Schule=mint, Arzt=pink, Sport=orange, HA=violet.
   - Tap row → event detail bottom-sheet.
4. **AI meal hero** — see _Meals_. Always present on the populated dashboard.
5. **"Morgen vorbereiten" section** — actionable items the AI extracted from tomorrow's events (pack swim kit, prep lunchbox, etc.).
6. **Mic FAB** — bottom-right, above the tab bar.
7. **Tab bar** — sticky.

## Variants

### V1 · Classic list

Default. Today list + meal hero + tomorrow prep. Best for users with 3–5 events/day.

### V2 · Hero stack

AI meal moves to the TOP. Today rendered as compact chip-cards below. Use as the **default for new accounts** where the AI moment is the wow factor.

### V3 · Day timeline

Vertical time-of-day timeline with stat cards above. Best for power users (many kids, many events). Highlights the _next_ event with a `Nächster` pill.

A/B test V1 vs V2 in onboarding cohorts. Power-user setting flips to V3.

## States

- **Populated** — at least 1 event today.
- **No events today** — show meal hero + a "Tagsüber alles ruhig — perfekt für einen Filmabend?" card. Don't hide sections; replace content.
- **AI unavailable** — meal hero falls back to a static "Wochenplan öffnen" card, no badge.

## Voice entry points

- FAB is the primary entry — opens VoiceOverlay.
- Long-press a date in the avatar row → "Was steht am … an?"
- Tapping the meal hero's empty-state card → "Was kochen wir heute?" suggestion.

## Data dependencies

```ts
type DashboardModel = {
  user: { displayName: string; locale: "de" | "en" };
  familyName: string;
  today: { date: Date; events: Event[] };
  tomorrowPrep: PrepItem[]; // derived from tomorrow's events + AI
  mealPick: MealPick | null; // see meals.md
};
```

## Accessibility

- Greeting uses an `<h1>`. Section headers are `<h2>` (visually styled as eyebrow).
- Event rows announce `[time], [title], [child name]` to screen readers.
- Mic FAB has `aria-label` from `voice.fab.label`.
- Reduce motion: disable FAB ring pulse and meal hero gradient breathing.
