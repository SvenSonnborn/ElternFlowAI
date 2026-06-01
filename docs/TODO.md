# TODO

Aktive Follow-ups aus laufender Arbeit. Workflow: **CLAUDE.md → "Out-of-scope TODOs"** (anhängen wenn entdeckt, entfernen wenn erledigt).

## Calendar (Edit/Delete V1 — `feature/calendar-v1`)

- **EventEditScreen rekonstruiert `master`-Row aus der `CalendarOccurrence`** ([app-sections/event/EventEditScreen.tsx:111-134](app-sections/event/EventEditScreen.tsx)) statt sie frisch aus Supabase zu laden. Damit funktioniert der `forward`-Edit-Split heute nur auf der Mock-Ebene — sobald Auth lebt, würde `insertSplitEvent` mit `family_id=""` / `type_id=""` an FK-Constraints scheitern. Außerdem geht der echte `rrule_freq` (daily/monthly/yearly) verloren — Placeholder ist hardgecodet `"weekly"`. Defensive Notbremse ist bereits in [features/calendar/mutations.ts](features/calendar/mutations.ts) verdrahtet: `useUpdateEvent.mutationFn` wirft mit klarer Botschaft, sobald `scope === "forward" && isRecurring && !master.family_id`. Fix: Im `useUpdateEvent`-Hook bei `scope === "forward"` den Master via `fetchEventById(eventId)` refetchen und dort übergeben; den `master`-Parameter aus dem Screen entfernen.
- **Recurring-Series mit `rrule_count` lassen sich nicht sauber per `forward`-Edit splitten** ([features/calendar/recurrence.ts](features/calendar/recurrence.ts) → `insertSplitEvent`). Count ist relativ zu `dtstart`; nach Split wäre der korrekte Wert `master.rrule_count − (Anzahl bereits konsumierter Occurrences)`. Aktuell setzen wir `rrule_count: null` (mit Code-Kommentar). Sauberer Fix erfordert Occurrence-Tracking oder Konversion zu `rrule_until`-Bounds vor dem Split.
- **Reminder-Switches im EventDetailScreen sind stateless** ([app-sections/event/EventDetailScreen.tsx](app-sections/event/EventDetailScreen.tsx) — `ReminderRow`). Zustand wird nicht persistiert. Bei Push-Notification-Iteration: an `reminders`-Tabelle binden.
- **Multi-Day-Events sind im Edit-Form gesperrt** ([app-sections/event/EventEditScreen.tsx](app-sections/event/EventEditScreen.tsx) — `isMultiDay` Banner). Eigener Editor folgt in V2.
- **Add-Event-Flow** existiert noch nicht. `EventEditScreen` ist als Basis wiederverwendbar (mit `id=undefined` → INSERT statt UPDATE). Voice-Add-Flow ist eigene Iteration (an STT/LLM-Provider gekoppelt).
- **Recurrence-Editor**: `rrule_freq`, `rrule_interval`, `rrule_byweekday` sind im Edit-Form nicht änderbar. Eigener Spec für V2.

## Auth / Onboarding

- **Auth-Flow + Login/Onboarding-Screens fehlen** (ADR-004 hat das explizit als Out-of-Scope markiert). Bis dahin greift im Calendar der Sample-Data-Fallback, und Edit/Delete-Buttons zeigen den `cal.detail.requiresAuth`-Alert.
- Sobald Auth lebt: Konfig + Onboarding-Patterns aus `patterns/login.md` + `patterns/onboarding.md` implementieren, dann der EventEditScreen-Master-Row-Fix oben.
- **Onboarding-Resume nach Abbruch** (Approach C — Auth-Spec): User mit `current_family_id() !== null` aber abgebrochenem Onboarding (kein Partner eingeladen, kein Kind angelegt) landet aktuell direkt auf Dashboard, statt Step 3/4 wieder aufzunehmen. Aktuell durch Empty-State auf [patterns/dashboard-empty.md](../patterns/dashboard-empty.md) abgefangen — V2 sollte eine "Onboarding fortsetzen"-CTA auf dem Dashboard zeigen (sobald `children`-Count == 0 oder `family_invitations`-Count == 0), die per Deep-Link wieder in den passenden Step springt. Dezimiert die Re-Entry-Friction.

## Auth UX follow-ups

- **Field-Component erweitern** ([app-sections/shared/Field.tsx](../app-sections/shared/Field.tsx)) — fehlt `secureTextEntry` (Password-Reveal-Eye), `autoCapitalize`, `autoComplete`. Passwords rendern aktuell als Plaintext im LoginScreen / RegisterScreen / NewPasswordScreen. `patterns/login.md` erwähnt explizit `eye`-Toggle und `autocomplete=email` / `current-password`. V1 funktional OK (Smoke-Tests), aber UX-Issue. Eigene kleine Iteration: Field um diese 3 Props erweitern, dann in den 3 Auth-Screens nutzen.
- **`StrengthMeter` als shared Component extrahieren** ([app-sections/auth/RegisterScreen.tsx](../app-sections/auth/RegisterScreen.tsx) hat sie inline; [NewPasswordScreen.tsx](../app-sections/auth/NewPasswordScreen.tsx) hat _keinen_ visual meter obwohl [patterns/reset-password.md](../patterns/reset-password.md) ihn erwähnt). Extract nach `app-sections/auth/StrengthMeter.tsx`, dann in beiden Screens nutzen.

## Weitere Out-of-Scope-Items

- **Realtime-Subscription** auf `events` / `event_exceptions` für Multi-User-Sync.
- **Optimistic UI** in den Calendar-Mutations (aktuell invalidate-and-refetch).
- **Toast-Component** statt `Alert.alert` für transiente Hinweise (`cal.detail.requiresAuth`, Edit-Save-Done, Delete-Done).
- **Undo nach Delete** (Snackbar mit Re-Insert-Logic).
- **Conflict-Detection** beim Anlegen/Editieren (Pattern erwähnt es, gekoppelt an Add-Flow).
- **Sample-Daten-Strings via i18n** ([features/calendar/sample.ts](features/calendar/sample.ts) — `SAMPLE_SEEDS`). Title/Location sind aktuell DE-Literals. ~26 neue Catalog-Keys nötig (13 Events × 2 Sprachen); lohnt sich erst wenn Sample-Daten länger leben als die Auth-Iteration.
- **gustar.io Worker + Stripe + Expo Notifications** — eigene Iterationen.
