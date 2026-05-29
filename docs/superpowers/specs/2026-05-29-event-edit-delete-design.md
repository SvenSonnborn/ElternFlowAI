# Event Edit & Delete — Design

**Date:** 2026-05-29
**Status:** Approved
**Branch:** `feature/calendar-v1`
**Predecessor:** [2026-05-29-supabase-schema-design.md](./2026-05-29-supabase-schema-design.md)

## Context

Mit Abschluss von Calendar V1 (`feature/calendar-v1`) gibt es ein funktionierendes Event-Detail-Sheet ([app-sections/event/EventDetailScreen.tsx](../../../app-sections/event/EventDetailScreen.tsx)), aber die Footer-Buttons **Bearbeiten** und **Löschen** sind Stubs, die nur `router.back()` aufrufen.

Diese Spec macht beide Aktionen funktional. Sie deckt die nicht-triviale Recurrence-Semantik (single-occurrence vs. forward-split vs. ganze Serie), Auth-Fallback-Verhalten (Sample-Mode) und Edge-Cases ab.

## Goals

1. User können einzelne Felder eines Events ändern (Titel, Datum, Start-/Endzeit, Ort, Notes).
2. User können Events löschen.
3. Bei recurring Events können beide Aktionen scoped werden: nur diese Occurrence, ab dieser, ganze Serie.
4. Verhalten im Sample-Mode (kein Login) ist klar und nicht verwirrend.
5. Form-Pattern ist wiederverwendbar (perspektivisch auch für Add-Event).

## Non-Goals

- Edit von `type_id`, `child_id`, oder `rrule_*` Feldern (eigene Spec — Recurrence-Editor ist großer Brocken)
- Multi-Day-Events editieren (zeigen disabled-Hinweis statt Editor)
- Optimistic UI (invalidate-and-refetch reicht; weniger Komplexität)
- Add-Event-Flow (folgt in eigener Iteration, kann aber `EventEditScreen`-Komponenten wiederverwenden)
- Voice-Add-Flow
- Realtime-Subscription bei Multi-User-Conflicts
- Reminder-Persistenz (Switches im Detail-Sheet bleiben stateless, eigene Spec)
- Confirm-Toast mit Undo nach Delete

## Architecture

Drei Layer, klar getrennt:

| Layer   | Pfad                                                                 | Verantwortung                                            |
| ------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| UI      | `app-sections/event/` + `app-sections/shared/Field.tsx`              | Form-Felder, Scope-Dialog, Confirm-Alert, Disabled-State |
| Data    | `features/calendar/mutations.ts` + `features/calendar/recurrence.ts` | React-Query Mutations, Recurrence-Scope-Helpers          |
| Routing | `app/event/edit/[id].tsx` + `app/_layout.tsx` Stack-Eintrag          | Form-Sheet als zweites formSheet im Stack                |

## Decisions

1. **Edit-Pattern:** Separates Form-Sheet (`EventEditScreen`). "Bearbeiten" im Detail-Sheet ruft `router.push('/event/edit/[id]?occ=YYYY-MM-DD')`. Begründung: längere Forms sind im eigenen Sheet übersichtlicher, Pattern ist für späteres Add-Event wiederverwendbar.

2. **Editierbare Felder (Minimal-Set):** `title`, `startDate`, `startTime`, `endTime`, `location`, `description` (als "Notes"). `type_id`, `child_id`, RRULE-Felder bleiben unveränderbar in V1.

3. **Recurrence-Scope:** Bei recurring Events erscheint nach Save/Delete-Tap ein ActionSheet mit drei Optionen — `this` / `forward` / `all`. Bei non-recurring Events wird scope=`all` implizit angenommen, kein Dialog. Pattern entspricht iCal-Standard und User-Erwartung.

4. **Sample-Mode-Verhalten:** Edit + Delete-Buttons sind sichtbar aber `opacity-50`. Tap zeigt `Alert.alert(t('cal.detail.requiresAuth'))`. Begründung: kommuniziert die Einschränkung ohne Phantom-Funktionalität.

5. **Confirm-Dialog vor Delete:** Immer via `Alert.alert` mit Title/OK/Cancel. Bei recurring Events folgt nach OK das Scope-ActionSheet (Doppel-Bestätigung). Begründung: Familien-App, gemeinsame Termine — Sicherheit > Speed.

6. **State-Management:** Form-State via `useState`, Mutations via React Query (`useMutation`). Begründung: Codebase nutzt bereits TanStack Query, kein neues Form-Lib für 4 Felder.

7. **Date/Time-Picker:** `@react-native-community/datetimepicker` (SDK-54-kompatibel, etabliert im Expo-Ökosystem). Auf Web fällt es auf native HTML inputs zurück.

8. **Field-Komponente:** Wir extrahieren das bestehende inline `Field` aus [ChildProfileScreen.tsx](../../../app-sections/child-profile/ChildProfileScreen.tsx) nach `app-sections/shared/Field.tsx` und reuse es in beiden Screens. Targeted Improvement im Sinne von "guter Code im Vorbeigehen".

## Recurrence-Scope Semantik

### Delete

| Scope              | Operationen                                                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `this` (recurring) | `INSERT INTO event_exceptions(event_id, occurrence_date, action='cancelled')` via `upsert` mit `onConflict: 'event_id,occurrence_date'`.                                                                                |
| `this` (single)    | `DELETE FROM events WHERE id=master`.                                                                                                                                                                                   |
| `forward`          | `UPDATE events SET rrule_until = (occurrence_date - 1 day) WHERE id=master`. Anschließend `DELETE FROM event_exceptions WHERE event_id=master AND occurrence_date >= occurrence_date` (Cleanup hinfälliger Exceptions). |
| `all`              | `DELETE FROM events WHERE id=master`. `event_exceptions` cascaden via FK `on delete cascade`.                                                                                                                           |

### Edit

| Scope              | Operationen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `this` (recurring) | `upsert` auf `event_exceptions` mit `action='modified'`, `override=jsonb({title, start_at, end_at, location, description})`, `onConflict: 'event_id,occurrence_date'`.                                                                                                                                                                                                                                                                                                                                      |
| `this` (single)    | `UPDATE events SET ... WHERE id=master`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `forward` (Split)  | (1) `UPDATE events SET rrule_until=(occurrence_date - 1 day) WHERE id=master`. (2) `INSERT INTO events (...)` mit kopierten Werten vom Master (`family_id`, `type_id`, `child_id`, `rrule_freq`, `rrule_interval`, `rrule_byweekday`, `created_by`) und überschriebenen Form-Werten (`title`, `start_at`, `end_at`, `location`, `description`), `rrule_until` und `rrule_count` werden auf `null` gesetzt. (3) `DELETE FROM event_exceptions WHERE event_id=master AND occurrence_date >= occurrence_date`. |
| `all`              | `UPDATE events SET title, start_at, end_at, location, description = ... WHERE id=master`. Wenn Zeit-Anpassung ge­ändert wurde, shifted RRULE-`dtstart` mit (start_at ist source of truth).                                                                                                                                                                                                                                                                                                                  |

### Edge-Cases

- **`cutoff < dtstart` bei `forward`:** Wenn die `occurrence_date - 1 day` vor dem Master-`start_at` liegt, ist das Master-Event durch den Split entwertet — wir behandeln das dann effektiv wie scope=`all` (Master delete bzw. update auf den neuen Werten ohne Split).
- **Bereits modifizierte Occurrence editieren mit scope=`this`:** `upsert` ersetzt die bestehende Exception. ✓
- **`rrule_count` + `forward`:** Wir setzen `rrule_until` und löschen `rrule_count` nicht zwingend — `until` wins beim RRULE-Expander.
- **Endzeit-Override beim Forward-Split:** Der neue Event übernimmt die Form-`end_at`, **nicht** die Master-Duration. User-Intent steuert.
- **Multi-Day-Event (endAt - startAt > 24h oder andere Datum-Komponente):** Edit-Form zeigt einen Disabled-Banner `t('cal.edit.error.multiDay')`, Save-Button bleibt durchgehend disabled. Delete funktioniert normal. Editor für Multi-Day folgt in eigener Iteration.

## UI Flows

### Detail-Sheet (`EventDetailScreen`)

```
Footer:
  [Löschen]  [Bearbeiten]
    │            │
    │            └─→ router.push('/event/edit/[id]?occ=YYYY-MM-DD')
    │
    └─→ session? NO  → Alert(requiresAuth)
        session? YES → Alert.alert(confirmTitle, confirmBody, [Cancel, OK])
                       OK → recurring? → ActionSheet(this/forward/all/cancel)
                            non-recurring? → useDeleteEvent.mutate({scope:'all'})
                       → onSuccess: router.back() (zurück zur Kalender-Liste)
```

### Edit-Sheet (`EventEditScreen`)

```
Mount:
  useEvent(id, occ) → fetchedOccurrence
  state: title, startDate, startTime, endTime, location, notes
  initial values from fetchedOccurrence

Body:
  <Field label="Titel"      type="text">  title
  <Field label="Datum"      type="date">  startDate (full date)
  <Field label="Von"        type="time">  startTime
  <Field label="Bis"        type="time">  endTime
  <Field label="Ort"        type="text">  location
  <Field label="Notizen"    type="multiline"> notes

Validation:
  title.trim() === '' → error 'cal.edit.error.titleRequired'
  endTime <= startTime (same date) → error 'cal.edit.error.invalidTimeRange'
  isMultiDay(event) → banner 'cal.edit.error.multiDay', Save disabled
    (isMultiDay = endAt - startAt > 24h ODER startAt.date ≠ endAt.date)

Footer:
  [Abbrechen]  [Speichern]
    │              │
    │              └─→ recurring? → ActionSheet(this/forward/all/cancel)
    │                  non-recurring? → useUpdateEvent.mutate({scope:'all', ...})
    │                  → onSuccess: router.back()
    │
    └─→ router.back() (discard)
```

## Files

### Neu

- `app/event/edit/[id].tsx` — thin re-export
- `app-sections/event/EventEditScreen.tsx` — Form-Sheet-Implementation
- `app-sections/shared/Field.tsx` — extrahiert aus ChildProfileScreen, erweitert um `type` (text|date|time|multiline) und `error`-Prop
- `features/calendar/mutations.ts` — `useUpdateEvent`, `useDeleteEvent` Hooks
- `features/calendar/recurrence.ts` — `applyEditScope`, `applyDeleteScope` Helper
- `features/calendar/recurrence.test.ts` — Unit-Tests für Scope-Logik

### Modifiziert

- `app-sections/event/EventDetailScreen.tsx` — Delete-Handler, Edit-Routing, Disabled-State im Sample-Mode
- `app-sections/child-profile/ChildProfileScreen.tsx` — Import des extrahierten `Field`
- `app/_layout.tsx` — Stack.Screen-Eintrag für `event/edit/[id]`
- `features/calendar/index.ts` — Barrel ergänzt um mutations + recurrence
- `features/i18n/locales/{de,en}.json` — neue Keys (`cal.edit.*`, `cal.edit.error.*` inkl. `multiDay`, `cal.delete.*`, `cal.scope.*`, `cal.detail.requiresAuth`)
- `package.json` — neue Dependency `@react-native-community/datetimepicker`

## Data Flow

```
[EventEditScreen] save click
   │
   ├─ validate (title, time range)
   │
   ├─ recurring && rrule_freq !== null?
   │     YES → showScopeActionSheet() → user picks scope
   │     NO  → scope='all'
   │
   └─ useUpdateEvent.mutate({ scope, eventId, occurrenceDate, masterRow, changes })
         │
         └─ mutationFn: applyEditScope(args)
              │
              ├─ scope='this' && recurring   → supabase.from('event_exceptions').upsert(...)
              ├─ scope='this' && !recurring  → supabase.from('events').update(...).eq('id', master)
              ├─ scope='forward'             → 3 ops in sequence:
              │     1) update events set rrule_until=...
              │     2) insert events (copied + overridden)
              │     3) delete event_exceptions where occurrence_date >= cutoff
              └─ scope='all'                 → supabase.from('events').update(...).eq('id', master)

   onSuccess: queryClient.invalidateQueries({ queryKey: calendarKeys.all })
              router.back()
```

Delete-Flow analog mit den entsprechenden DELETE-Statements aus der Scope-Tabelle.

## Error Handling

- **Validation-Errors:** Inline unter dem jeweiligen Feld via `<Field error="...">`-Prop. Save-Button disabled solange Errors existieren.
- **Mutation-Errors:** Inline-Banner über dem Footer: `<Text tone="danger">{t('cal.edit.error.network')} {error.message}</Text>`. Sheet bleibt offen.
- **Network-Failures:** TanStack Query retried 1x (Default aus [\_layout.tsx](../../../app/_layout.tsx)). Danach durchreichen als Error-Banner.
- **Race-Conditions:** "Event wurde inzwischen gelöscht" (UPDATE 0 rows oder PGRST-Error) → Banner mit hint. Sheet schließt nicht automatisch.

## Testing

### Unit (`features/calendar/recurrence.test.ts`)

`bun:test` mit gemocktem `supabase`-Client (Spy-Object). Pro Scope ein Test pro Operation, asserting auf die Call-Argumente von `supabase.from(...).upsert/update/insert/delete`.

Test-Matrix:
| Scenario | Erwartung |
|---|---|
| Delete this, recurring | `event_exceptions.upsert({action:'cancelled', ...})` aufgerufen |
| Delete this, single | `events.delete().eq('id', master)` aufgerufen |
| Delete forward | `events.update({rrule_until: ...}).eq('id', master)` UND `event_exceptions.delete().gte(...).eq(...)` |
| Delete all | `events.delete().eq('id', master)` |
| Edit this, recurring | `event_exceptions.upsert({action:'modified', override: {...}})` |
| Edit this, single | `events.update(changes).eq('id', master)` |
| Edit forward | 3 calls in sequence: update, insert, delete |
| Edit all | `events.update(changes).eq('id', master)` |
| Edit forward cutoff < dtstart | Verhält sich wie scope=`all` |
| Edit Multi-Day-Event | Save bleibt disabled, kein Mutation-Call |

### Manual Smoke (`bun run web`)

1. **Sample-Mode**: Open detail sheet → Edit + Delete are dimmed. Tap → Alert "Anmelden erforderlich".
2. **Edit non-recurring**: Tap Bearbeiten → Form opens with pre-filled values. Change title, save → back to detail sheet showing new title.
3. **Edit recurring `this`**: Tap Bearbeiten → ActionSheet → "Nur diesen" → save. Calendar shows changed event only on that date; other occurrences unchanged.
4. **Edit recurring `forward`**: Change time, save → "Diesen und alle folgenden". Calendar: events before cutoff unchanged, events from cutoff onwards have new time.
5. **Edit recurring `all`**: Change title → "Alle". All occurrences show new title.
6. **Delete non-recurring**: Confirm Alert → event verschwindet aus Liste.
7. **Delete recurring `this`**: Confirm → ActionSheet "Nur diesen" → einzelne Occurrence weg, Rest bleibt.
8. **Validation**: Title löschen → Save disabled + Inline-Error. Endzeit < Startzeit → Inline-Error.

### Supabase-Path-Verification (`mcp__supabase__get_logs`)

Sobald Auth + Test-User da sind: Logs sollten die korrekten SQL-Calls zeigen. Test-Events vorher per `mcp__supabase__execute_sql` als Fixtures setzen.

## Open Questions

Keine. Alle Klärungsfragen wurden im Brainstorming-Loop adressiert.

## Future Work

- Add-Event-Flow (kann `EventEditScreen` als Basis nutzen, mit `id=undefined` → INSERT statt UPDATE)
- Recurrence-Editor (RRULE-Felder in V2 editierbar machen)
- Multi-Day-Event-Editor
- Reminder-Persistenz (Switches → `reminders` Tabelle)
- Optimistic UI für schnellere Tap-Response
- Toast-Component statt `Alert.alert` für Sample-Mode-Hint
- Undo nach Delete
- Voice-Edit-Flow
