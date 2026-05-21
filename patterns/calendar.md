# Pattern · Kalender (Calendar)

The family calendar is _colour-coded by event type, not by person_ — that's what makes it readable at a glance ("oh, three orange items = sport day"). Person info is the secondary metadata.

## Event types & colours

| Type    | DE                   | EN     | Colour            |
| ------- | -------------------- | ------ | ----------------- |
| Arzt    | Arzt                 | Doctor | `#FBA1B7` pink    |
| Schule  | Schule               | School | `#4ECDC4` mint    |
| Sport   | Sport                | Sport  | `#FF9F1C` orange  |
| HA      | Hausaufgaben         | Tasks  | `#C4B5FD` violet  |
| Familie | Familie / Geburtstag | Social | `#7DD3FC` sky     |
| Essen   | Mahlzeit             | Meal   | `#34D399` success |

Map lives in `colors.ts → palette.event`.

## Variants

### V1 · Monthly + day list

- Month label + nav arrows.
- 6-week grid with date numbers. Each day shows up to 3 colour dots.
- Today: filled mint cell with white text. Dots become 85%-white on today's cell.
- Selected day below shows a colour-stripe event list. Each row has a left vertical accent bar in the event tone.
- Legend strip at the bottom of the grid.

### V2 · Week grid

- Filter row at top: "Alle (12)" + per-person avatars.
- 7 column header (Mo–So) with date numbers.
- Time blocks: tinted rectangles with a 3px left border in event tone. Position based on time-of-day (08:00–20:00 visible).
- "Today" highlights the date number in mint with a mint dot.
- Below: a "Today · 4 events" detailed list with location pins.

### V3 · Agenda (default for power users)

- Search field with mic at top.
- Day-by-day sections: "Heute · Mi 14", "Morgen · Do 15", weekday-date for further out.
- Each row: type-tinted icon · title + meta · bell toggle (reminder on/off).
- Empty days are collapsed.

## Add-event flow

Two entry points:

1. **Tap "+"** in the section header or top bar → opens a typed form sheet.
2. **Mic FAB** → voice overlay. "Trag Ben morgen um 16 Uhr Fußball ein" → confirmation card → user taps Speichern.

The voice flow shows a confirmation card with the parsed event before saving. Edits inline (tap any field) before confirming.

## Event detail sheet

Opened from any event row:

- Title, time, location, attached child avatar(s).
- Reminder switches (24h before, 1h before).
- Notes.
- Delete / edit buttons at the bottom.

## Recurrence

v1 supports: none, daily, weekdays, weekly, monthly. UI is a simple radio group inside the form sheet. No iCal-style RRULE editor.

## Conflict detection

If the user adds an event that overlaps with an existing one for the same person, show a yellow inline warning under the time field: `"Kollision mit Klavier · 18:00–18:45"`. Allow override.
