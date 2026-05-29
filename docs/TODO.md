# TODO

Aktive Follow-ups aus laufender Arbeit. Workflow: **CLAUDE.md → "Out-of-scope TODOs"** (anhängen wenn entdeckt, entfernen wenn erledigt).

## Calendar (Edit/Delete V1 — `feature/calendar-v1`)

- **EventEditScreen rekonstruiert `master`-Row aus der `CalendarOccurrence`** ([app-sections/event/EventEditScreen.tsx:111-134](app-sections/event/EventEditScreen.tsx)) statt sie frisch aus Supabase zu laden. Damit funktioniert der `forward`-Edit-Split heute nur auf der Mock-Ebene — sobald Auth lebt, würde `insertSplitEvent` mit `family_id=""` / `type_id=""` an FK-Constraints scheitern. Außerdem geht der echte `rrule_freq` (daily/monthly/yearly) verloren — Placeholder ist hardgecodet `"weekly"`. Fix: Im `useUpdateEvent`-Hook bei `scope === "forward"` den Master via `fetchEventById(eventId)` refetchen und dort übergeben; den `master`-Parameter aus dem Screen entfernen.
- **Reminder-Switches im EventDetailScreen sind stateless** ([app-sections/event/EventDetailScreen.tsx](app-sections/event/EventDetailScreen.tsx) — `ReminderRow`). Zustand wird nicht persistiert. Bei Push-Notification-Iteration: an `reminders`-Tabelle binden.
- **Multi-Day-Events sind im Edit-Form gesperrt** ([app-sections/event/EventEditScreen.tsx](app-sections/event/EventEditScreen.tsx) — `isMultiDay` Banner). Eigener Editor folgt in V2.
- **Add-Event-Flow** existiert noch nicht. `EventEditScreen` ist als Basis wiederverwendbar (mit `id=undefined` → INSERT statt UPDATE). Voice-Add-Flow ist eigene Iteration (an STT/LLM-Provider gekoppelt).
- **Recurrence-Editor**: `rrule_freq`, `rrule_interval`, `rrule_byweekday` sind im Edit-Form nicht änderbar. Eigener Spec für V2.

## Auth / Onboarding

- **Auth-Flow + Login/Onboarding-Screens fehlen** (ADR-004 hat das explizit als Out-of-Scope markiert). Bis dahin greift im Calendar der Sample-Data-Fallback, und Edit/Delete-Buttons zeigen den `cal.detail.requiresAuth`-Alert.
- Sobald Auth lebt: Konfig + Onboarding-Patterns aus `patterns/login.md` + `patterns/onboarding.md` implementieren, dann der EventEditScreen-Master-Row-Fix oben.

## Weitere Out-of-Scope-Items

- **Realtime-Subscription** auf `events` / `event_exceptions` für Multi-User-Sync.
- **Optimistic UI** in den Calendar-Mutations (aktuell invalidate-and-refetch).
- **Toast-Component** statt `Alert.alert` für transiente Hinweise (`cal.detail.requiresAuth`, Edit-Save-Done, Delete-Done).
- **Undo nach Delete** (Snackbar mit Re-Insert-Logic).
- **Conflict-Detection** beim Anlegen/Editieren (Pattern erwähnt es, gekoppelt an Add-Flow).
- **gustar.io Worker + Stripe + Expo Notifications** — eigene Iterationen.
