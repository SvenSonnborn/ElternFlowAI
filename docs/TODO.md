# TODO

Aktive Follow-ups aus laufender Arbeit. Workflow: **CLAUDE.md → "Out-of-scope TODOs"** (anhängen wenn entdeckt, entfernen wenn erledigt).

## Calendar (Edit/Delete V1 — `feature/calendar-v1`)

- **Recurring-Series mit `rrule_count` lassen sich nicht sauber per `forward`-Edit splitten** ([features/calendar/recurrence.ts](features/calendar/recurrence.ts) → `insertSplitEvent`). Count ist relativ zu `dtstart`; nach Split wäre der korrekte Wert `master.rrule_count − (Anzahl bereits konsumierter Occurrences)`. Aktuell setzen wir `rrule_count: null` (mit Code-Kommentar). Sauberer Fix erfordert Occurrence-Tracking oder Konversion zu `rrule_until`-Bounds vor dem Split.
- **Reminder-Switches im EventDetailScreen sind stateless** ([app-sections/event/EventDetailScreen.tsx](app-sections/event/EventDetailScreen.tsx) — `ReminderRow`). Zustand wird nicht persistiert. Bei Push-Notification-Iteration: an `reminders`-Tabelle binden.
- **Multi-Day-Events sind im Edit-Form gesperrt** ([app-sections/event/EventEditScreen.tsx](app-sections/event/EventEditScreen.tsx) — `isMultiDay` Banner). Eigener Editor folgt in V2. Im Create-Form ([app-sections/event/EventCreateScreen.tsx](app-sections/event/EventCreateScreen.tsx)) ebenfalls noch nicht abgebildet — All-day deckt den 1-Tag-Fall ab.
- **Voice-Add-Flow** ist eigene Iteration (an STT/LLM-Provider gekoppelt). Pattern-doc-Eintrag bleibt offen, getypter Form-Flow ist mit V1 jetzt da.
- **Recurrence-Editor (Edit-Form)**: `rrule_freq`, `rrule_interval`, `rrule_byweekday` sind im Edit-Form nicht änderbar. Create-Form unterstützt jetzt die 5 Optionen (none/daily/weekdays/weekly/monthly) — Edit muss in V2 nachziehen, sonst kann der User einen wiederkehrenden Termin anlegen aber die Wiederholung nicht später anpassen.

## Auth / Onboarding

- **Onboarding-Resume nach Abbruch** (Approach C — Auth-Spec): User mit `current_family_id() !== null` aber abgebrochenem Onboarding (kein Partner eingeladen, kein Kind angelegt) landet aktuell direkt auf Dashboard, statt Step 3/4 wieder aufzunehmen. Aktuell durch Empty-State auf [patterns/dashboard-empty.md](../patterns/dashboard-empty.md) abgefangen — V2 sollte eine "Onboarding fortsetzen"-CTA auf dem Dashboard zeigen (sobald `children`-Count == 0 oder `family_invitations`-Count == 0), die per Deep-Link wieder in den passenden Step springt. Dezimiert die Re-Entry-Friction.

## Auth UX follow-ups

- **Allergie-Storage-Locale-Coupling auflösen** ([app-sections/onboarding/Step4FirstChild.tsx](../app-sections/onboarding/Step4FirstChild.tsx) speichert per `t(...)` die _lokalisierten_ Allergie-Labels in `children.allergies[]`). Wenn User Sprache wechselt, bleiben gespeicherte Allergien in alter Sprache. Sauber: nur Keys (z.B. `"peanuts"`) speichern, in [ChildProfileScreen](../app-sections/child/ChildProfileScreen.tsx) + Sample-Data via `t()` rendern. Eigene kleine Iteration.
- **`StrengthMeter` als shared Component extrahieren** ([app-sections/auth/RegisterScreen.tsx](../app-sections/auth/RegisterScreen.tsx) hat sie inline; [NewPasswordScreen.tsx](../app-sections/auth/NewPasswordScreen.tsx) hat _keinen_ visual meter obwohl [patterns/reset-password.md](../patterns/reset-password.md) ihn erwähnt). Extract nach `app-sections/auth/StrengthMeter.tsx`, dann in beiden Screens nutzen.

## Weitere Out-of-Scope-Items

- **Realtime-Subscription** auf `events` / `event_exceptions` für Multi-User-Sync.
- **Optimistic UI** in den Calendar-Mutations (aktuell invalidate-and-refetch).
- **Toast-Component** statt `Alert.alert` für transiente Hinweise (Edit-Save-Done, Delete-Done).
- **Undo nach Delete** (Snackbar mit Re-Insert-Logic).
- **Conflict-Detection** beim Anlegen/Editieren (Pattern erwähnt es, gekoppelt an Add-Flow).
- **Same-Family-FK auch für `events.child_id` (und ggf. `created_by`)** ([supabase/migrations/20260529091933_calendar.sql](../supabase/migrations/20260529091933_calendar.sql)). `parent_id` ist seit [20260602100000_events_parent_id.sql](../supabase/migrations/20260602100000_events_parent_id.sql) per Composite-FK `(family_id, parent_id) → parents(family_id, id)` familien-gebunden. `child_id` referenziert weiterhin nur `children(id)` — ein Kind aus einer fremden Familie ließe sich DB-seitig zuweisen (durch RLS unwahrscheinlich, aber kein DB-Guard). Analoger Composite-FK + `unique index children(family_id, id)` zieht das nach.
- **Sample-Daten-Strings via i18n** ([features/calendar/sample.ts](features/calendar/sample.ts) — `SAMPLE_SEEDS`). Title/Location sind aktuell DE-Literals. ~26 neue Catalog-Keys nötig (13 Events × 2 Sprachen); lohnt sich erst wenn Sample-Daten länger leben als die Auth-Iteration.
- **gustar.io Worker + Stripe + Expo Notifications** — eigene Iterationen.
