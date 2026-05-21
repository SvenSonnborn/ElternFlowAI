# Pattern · Hausaufgaben (Homework / tasks)

Same data model as calendar events under the hood, but a different mental frame: tasks have **deadlines**, not start times. The screen exists because parents track HA differently than meetings.

## Goal

- See what's due today at the top.
- Browse by child or by status, switchable.
- Add via voice ("Ben hat morgen Mathe-Test über Bruchrechnen").

## Variants

### V1 · By child (default)

- Stat strip at top: Fällig heute · Diese Woche · Quote (% completed).
- Per kid: avatar header + open/closed count pill + task rows.
- Rows: checkbox · subject pill + urgent pill if `due ≤ today` · title · "Fällig: …" · bell icon.

### V2 · Today / Upcoming / Done

- Progress ring card (62%) at top + sub stats.
- "Heute fällig" section, "Demnächst" section, "Erledigt heute" section.
- Done items dim to 65% opacity and strike-through.

### V3 · Kanban

- Three horizontal columns: Heute · Diese Woche · Langfristig.
- Cards have a colour left-border matching column status.
- Drag-to-reorder support optional (v2).
- Voice example card at the bottom.

## Data model

```ts
type Task = {
  id: string;
  childId: string;
  subject: string; // "Mathe", "Englisch"
  title: string;
  due: Date;
  doneAt?: Date;
  urgency: "today" | "thisWeek" | "longTerm";
  reminderAt?: Date;
  source: "manual" | "voice" | "ai-extracted";
};
```

## Urgency derivation

Server-side, recompute on read:

- `today` if `due` ≤ end of today
- `thisWeek` if `due` ≤ end of this ISO-week
- `longTerm` otherwise

Override possible: user can flag a `longTerm` task as `urgent`.

## Gamification (light touch)

When a child completes a task, the row shows a tiny green `+5 XP` pill briefly (Toast pattern with `motion.duration.slower`). Aggregate XP is visible only in the family tab — never on the main homework view. Keep this opt-in via Settings (default off for kids under 8).

## Voice add

`"Ben hat morgen Mathe Hausaufgaben bis Freitag"` parses to:

```json
{
  "childId": "ben",
  "subject": "Mathe",
  "title": "Mathe Hausaufgaben",
  "due": "<friday>",
  "urgency": "thisWeek"
}
```

Always show a confirmation card before persisting. The user can tap the subject pill to change it (drop-down of recent subjects) without re-recording.
