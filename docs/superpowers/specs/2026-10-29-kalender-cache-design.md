# Kalender-Cache — Design

**Status:** Entwurf (Brainstorming)
**Date:** 2026-10-29
**Branch:** `fix/kalender-cache`, Roadmap 8.3 „Kalender-Cache (Doppelanzeige und #111 zusammen)"
**Issue:** [#111](https://github.com/SvenSonnborn/ElternFlowAI/issues/111), die offene Overlay-Hälfte. Die Server-Hälfte (Idempotenz über `vars.id`, `apply_event_change` mit Request-Id) ist seit ADR-044 erledigt.
**Decision-Log:** ein kurzer ADR (051) am Branch-Ende

## 1. Worum es geht

Was der Server gespeichert hat, steht im Kalender **genau einmal**: auch wenn das Neuladen danach scheitert, und auch wenn zwei Monatsansichten gleichzeitig offen sind. Heute bricht das an vier Stellen, alle im Kalender:

1. **Anlegen und Bearbeiten, Neuladen scheitert.** `useCreateEvent.onSettled` ([createMutation.ts](../../../features/calendar/createMutation.ts)) und `useUpdateEvent.onSettled` ([mutations.ts](../../../features/calendar/mutations.ts)) warten auf `qc.invalidateQueries(...)` und räumen danach den Overlay-Eintrag ab. Das Promise löst auch dann auf, wenn der Refetch scheitert. Der gespeicherte Termin bzw. die Änderung verschwindet dann ohne Meldung, bis ein späteres Laden gelingt.
2. **Doppelanzeige.** `invalidateQueries` wartet auf **alle** aktiven Range-Queries. Steht der Kalender auf November und das Dashboard auf Oktober (Expo Router lässt besuchte Tabs montiert), zeigt der Kalender den neuen Termin zweimal, sobald seine Query zurück ist: einmal als Server-Zeile (echte UUID), einmal als Overlay-Zeile (`optimistic-<n>`). Das dauert, bis auch die Oktober-Query durch ist.
3. **Löschen, Neuladen scheitert.** `useDeleteEvent.onSuccess` gibt sein `invalidateQueries` zurück. Der geteilte Pending-Delete-Store ([features/shared/pendingDeletes.ts](../../../features/shared/pendingDeletes.ts)) gibt den Termin frei, sobald `mutateAsync` durch ist. Scheitert der Refetch, steht der gelöschte Termin aus dem alten Cache wieder da.
4. **Dashboard blendet bei gescheitertem Neuladen alles aus.** `DashboardScreen` rendert die „Heute"-Liste nicht, sobald `error` gesetzt ist (`isLoading || error ? null`). TanStack setzt `error` auch, wenn nur ein Refetch scheitert und die alten Daten noch da sind. Wer im Funkloch speichert, sieht dort gar nichts mehr, egal was das Overlay tut. `prepPending` hängt an derselben Bedingung.

Aufgaben und Essen sind nicht betroffen: Beide patchen ihren Cache in `onMutate` (`patchTaskCaches`, ADR-043), ein gescheiterter Refetch holt dort nichts zurück.

## 2. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**

1. Ein gespeicherter Termin, eine gespeicherte Änderung und eine ausgeführte Löschung bleiben in jeder Ansicht sichtbar bzw. ausgeblendet, bis **diese** Ansicht Serverdaten hat, die nach dem Speichern geladen wurden.
2. Kein Termin erscheint je zweimal, auch nicht, während zwei Ansichten zu verschiedenen Zeiten nachladen.
3. Die Kalender-Mutationen invalidieren `calendarKeys.eventsRoot` und `calendarKeys.oneRoot` statt `calendarKeys.all`, wie der Realtime-Pfad seit ADR-030. `types` und `reminders` hängen an keiner Termin-Änderung (`reminders.ts` invalidiert seine eigene Query).
4. Das Dashboard zeigt bei einem gescheiterten Neuladen den letzten bekannten Stand. Leer bleibt die Liste nur, solange noch nie Daten angekommen sind.
5. Für jeden der vier Fälle gibt es einen Test, der vor dem Fix rot ist.

**Nicht-Ziele**

- **Keine Cache-Patches.** Das Overlay-Modell aus ADR-027 Decision 1 bleibt. Die Server-Zeile beim Anlegen direkt in den Cache zu schreiben, wäre machbar, beim Bearbeiten und Löschen aber nicht: `apply_event_change` gibt nur `"applied"`/`"already_applied"` zurück, und die Zeile eines `forward`-Splits kennt der Client nicht (meine Entscheidung).
- **Keine visuelle Markierung** für „gespeichert, aber noch nicht neu geladen" (ADR-027 Decision 6). Keine neue Copy.
- **Ein neuer Termin bleibt auch nach dem Speichern nicht antippbar**, bis seine Ansicht neu geladen hat. Die Overlay-Zeile behält ihre synthetische Id `optimistic-<n>`. Offline schlüge das Öffnen ohnehin fehl, online dauert die Phase etwa eine Sekunde (mit Sven abgestimmt).
- **Das Detail-Sheet bekommt kein Overlay** (ADR-027 Decision 7). Öffnet jemand nach einer gespeicherten Änderung, deren Neuladen scheiterte, das Detail, zeigt es den alten Stand aus `calendarKeys.one`, bis ein Laden gelingt (meine Entscheidung).
- **Änderungen ohne Overlay-Eintrag** bleiben, wie sie sind: Regeländerungen (`vars.recurrence`) und `all`/`forward` mit geändertem Datum (`canApplyOptimistically`). Scheitert dort das Neuladen, zeigt der Kalender den alten Stand, bis ein Laden gelingt, wie heute.
- **Die beiden Overlays werden nicht vereint** (ADR-027 Decision 8). Der geteilte Pending-Delete-Store bleibt unverändert, Aufgaben und Essen hängen an ihm.
- Das Kollisionsfenster jenseits des geladenen Monats bleibt in `docs/TODO.md`.

**Anti-Ziele**

- **Ein Overlay-Eintrag überstimmt neuere Serverdaten.** Hat eine Ansicht nach dem Speichern geladen, gilt dort allein der Server. Ändert oder löscht danach jemand anderes den Termin, darf kein alter Eintrag ihn zurückholen.
- **Der Fehlerweg wird langsamer.** `onSettled` invalidiert bei einem Fehler weiterhin nicht. Die Begründung steht am `if` in beiden Hooks.
- **Ein alter Stand blitzt auf.** Zwischen Overlay und Serverdaten darf es keinen Frame ohne den Termin geben (die Lehre aus ADR-026).
- **Aufgaben, Essen oder das Undo-Fenster ändern ihr Verhalten.**

## 3. Entwurf

### 3.1 Zwei Phasen eines Overlay-Eintrags

| Phase                 | Beginn                | Ende                                                                                                 |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| **unterwegs**         | `onMutate`, wie heute | Fehler: sofort entfernt, Toast mit Retry. Keine Antwort nach 30 s: Watchdog entfernt ihn, wie heute. |
| **gespeichert** (neu) | Erfolg der Mutation   | wenn keine Ansicht ihn mehr braucht (3.3) oder beim Abmelden                                         |

- In der Phase „unterwegs" gilt der Eintrag in jeder Ansicht, wie heute.
- In der Phase „gespeichert" gibt es keinen Watchdog. Offline über Stunden ist der Eintrag weiter richtig: Er zeigt, was gespeichert ist.
- Der Übergang passiert in `onSuccess`/`onSettled`, **bevor** invalidiert wird, damit der Zeitpunkt des Speicherns vor jedem Neuladen feststeht.
- **Später Erfolg nach dem Watchdog:** Hat der Watchdog den Eintrag schon entfernt und meldet der Server danach doch Erfolg, kommt der Eintrag in der Phase „gespeichert" zurück. Sonst kehrte Fall 1 genau bei langsamen Netzen zurück, wo Refetches am ehesten scheitern. Der Termin verschwindet dann kurz und kommt wieder, das ist ehrlicher als ein stilles Verschwinden (meine Entscheidung). Hatte `onMutate` gar keinen Eintrag angelegt (Event-Typ nicht im Cache), bleibt es wie heute.

### 3.2 Die Regel pro Ansicht

Ein Eintrag in der Phase „gespeichert" gilt in einer Ansicht genau dann, wenn die Serverdaten dieser Ansicht **älter** sind als das Speichern. Sind sie neuer, gilt dort allein der Server.

- „Neuer" heißt: aus einem Laden, das **nach** dem Speichern begonnen hat. Ein Laden, das vorher begann und erst danach ankommt, zählt nicht, denn es kann den Stand vor dem Speichern tragen.
- **Die Regel gilt, der Mechanismus dient ihr.** Mein Vorschlag: der Zeitpunkt des Speicherns im Eintrag, verglichen mit `dataUpdatedAt` der Range-Query, und **vor** dem Invalidieren `qc.cancelQueries({ queryKey: calendarKeys.eventsRoot })`. `invalidateQueries` allein reicht nicht: Sein `cancelRefetch` bricht ein laufendes Laden nur ab, wenn die Query schon Daten hat, und es lädt nur aktive Queries neu (geprüft in `@tanstack/query-core` 5.105, `Query.fetch`). Ein erstes Laden (Kaltstart, frisch gewischter Monat) oder das Laden eines gerade verlassenen Monats käme sonst nach dem Speichern an, zählte als „neuer" und gälte wegen `staleTime` 30 s lang als frisch. `cancelQueries` bricht jedes laufende Laden unter `eventsRoot` ab, auch diese. Vor dem Festlegen per context7 gegen die installierte Version prüfen.
- Eine Ansicht ohne Serverdaten (neuer Monat, erstes Laden gescheitert) ist „älter" und zeigt das Overlay, wie heute.
- **Ein neuer Termin wird über seine echte Id zugeordnet.** Der `create`-Eintrag trägt zusätzlich `vars.id`. Die angezeigte Id bleibt `optimistic-<n>`, der Termin bleibt also nicht antippbar. Zwei Folgen:
  - Enthalten die Serverdaten einer Ansicht schon eine Zeile mit dieser Id, gilt dort der Server, in jeder Phase. Das deckt ein Laden ab, das das eigene Realtime-Echo angestoßen hat und das den Termin trägt, aber vor dem Speichern-Zeitpunkt ankam.
  - Ein späteres `update` oder `delete` mit `eventId === vars.id` trifft auch die Overlay-Zeile. Fall: Kalender auf November, Oktober inaktiv im Cache. Der Nutzer legt einen Termin in der Überlappung an, löscht oder ändert ihn vom November aus und wischt zurück auf Oktober. Ohne die Zuordnung käme dort der gelöschte Termin bzw. der alte Stand zurück, auch ohne jeden Fehler. Die Reihenfolge „erst filtern, dann patchen" (ADR-027 Decision 9) gilt dabei auch für die Overlay-Zeilen.
- Die Regel gilt für alle drei Arten: `create` hängt die Zeile an, `update` patcht die Occurrence, `delete` (3.4) blendet sie aus.
- Damit löst sich die Doppelanzeige auf: Der Kalender auf November hat neu geladen, dort gilt der Server. Das Dashboard auf Oktober wartet noch, dort gilt das Overlay. Jede Ansicht zeigt den Termin einmal.

### 3.3 Wann ein Eintrag den Store verlässt

Ein Eintrag in der Phase „gespeichert" verlässt den Store, sobald **keine Range-Query im Cache** mehr Daten von vor dem Speichern trägt. Inaktive Queries zählen mit: Wechselt der Nutzer zurück in einen gecachten Monat, zeigt TanStack zuerst die alten Daten, und dort wird der Eintrag noch gebraucht. Eine Query **ohne** Daten zählt ebenfalls als „braucht ihn noch", wie in 3.2 (meine Entscheidung). Nach `gcTime` ist eine solche Query weg und zählt nicht mehr. Eine nie geladene, gescheiterte inaktive Query hält den Eintrag also höchstens bis dahin.

- Abmelden leert den Store weiterhin (`useSignOut` → `clear`).
- Der Mechanismus bleibt dem Builder überlassen (6.). Ein Eintrag, der bis zum Abmelden einfach liegen bleibt, ist **kein** Ersatz: Jede Ansicht müsste ihn bei jedem Rendern prüfen, und der Store wüchse über die Sitzung.

### 3.4 Löschen

`useDeleteEvent` legt bei Erfolg einen Eintrag der neuen Art `delete` in den Kalender-Overlay-Store, mit demselben Ziel (`PendingEventDelete`: `eventId`, `occurrenceKey`, `scope`) und dem Zeitpunkt des Speicherns. Der Eintrag beginnt direkt in der Phase „gespeichert".

- Er entsteht, **bevor** der Pending-Delete-Store den Termin freigibt, damit kein Frame ohne Ausblendung dazwischen liegt. Der Pending-Delete-Store selbst bleibt unverändert.
- Ausgeblendet wird mit `hidesOccurrence` aus [features/calendar/pendingDeletes.ts](../../../features/calendar/pendingDeletes.ts), dieselbe Regel wie im Undo-Fenster.
- Die Reihenfolge „erst filtern, dann patchen" aus `visibleOccurrences` (ADR-027 Decision 9) gilt auch für diese Art: Eine Löschung gewinnt gegen ein gleichzeitiges Update.
- Das ändert ADR-027 Decision 2 („`useDeleteEvent` bleibt unangetastet"). Der neue ADR hält das fest.

### 3.5 Invalidierung

Alle drei Mutationen invalidieren `eventsRoot` und `oneRoot` statt `all`. Weiter gilt:

- Kein Invalidieren bei einem Fehler.
- **Keine der drei Mutationen wartet mehr auf das Neuladen** (meine Entscheidung). Über die Sichtbarkeit entscheidet jetzt die Overlay-Regel, und sonst braucht niemand das Warten: `useSignOut` → `flush()` braucht nur das abgeschlossene DELETE, damit es noch angemeldet läuft, nicht den Refetch danach. Heute wartet das Abmelden hinter einem hängenden Refetch bis zum 30-s-Watchdog. Die Speichern-Sperre (`submitLock.ts`) hängt nicht am Settle der Mutation.
- Die Kommentare an beiden `onSettled` und an `useDeleteEvent.onSuccess` beschreiben heute das alte Warum (Warten gegen das Aufblitzen) und werden angepasst. Ebenso der Docstring von `COMMIT_TIMEOUT_MS` in `features/shared/pendingDeletes.ts`, der sich auf das zurückgegebene `invalidateQueries` beruft.

### 3.6 Dashboard

Die „Heute"-Liste und `prepPending` unterscheiden „noch nie Daten" von „Neuladen gescheitert, alte Daten da". Nur im ersten Fall bleibt die Liste leer, wie heute: kein „alles ruhig", solange die Daten fehlen. Der Kalender-Tab liest `error` heute gar nicht und bleibt, wie er ist.

`prepPending` ändert sich nur in seiner Termin-Hälfte. Die Aufgaben-Hälfte (`tasks.error`) hat dasselbe Muster, gehört aber nicht zum Kalender und kommt als Eintrag nach `docs/TODO.md` (meine Entscheidung).

## 4. Prüfen

- `bun test`: die Regel pro Ansicht (alle drei Arten, Daten älter und neuer als das Speichern, keine Daten, Daten mit der echten Id), Löschen und Ändern eines neuen Termins über `vars.id`, die Regel für das Verlassen des Stores, der Phasenübergang in allen drei Mutationen (Erfolg mit gescheitertem Refetch, Fehler, Watchdog nur in der Phase „unterwegs", später Erfolg nach dem Watchdog), ein vor dem Speichern begonnenes erstes Laden zählt nicht als Bestätigung. Vorhanden: [optimisticEvents.test.ts](../../../features/calendar/optimisticEvents.test.ts), [createMutation.test.ts](../../../features/calendar/createMutation.test.ts), [mutations.test.ts](../../../features/calendar/mutations.test.ts).
- `bun run test:rn`: `useFamilyEvents` mit zwei aktiven Monaten, deren Antworten zu verschiedenen Zeiten kommen. Kein Zeitpunkt zeigt den Termin zweimal oder gar nicht ([hooks.jest.tsx](../../../features/calendar/hooks.jest.tsx)). Dazu das Dashboard mit gescheitertem Neuladen bei vorhandenen Daten.
- Jeder Test muss vor dem Fix rot sein.
- Sichtlauf (Web gegen lokale Supabase, Solo-Prozess `Web (lokal)`, Playwright mit abgefangenen Antworten): Anlegen, Bearbeiten und Löschen bei abgebrochenem Refetch, Termin bleibt bzw. bleibt weg. Doppelanzeige: Kalender auf dem Folgemonat, Dashboard auf dem aktuellen, die Antwort für das Dashboard verzögert.
- `bun run typecheck`, `bun lint`, `bun format:check`, dann `coderabbit review --base main`.

## 5. Doku am Branch-Ende

- ADR-051, kurz: Overlay-Einträge leben bis zur bestätigten Serverprojektion pro Ansicht. Ergänzt ADR-027: Decision 2 gilt nicht mehr, die Watchdog-Konsequenz nur noch für die Phase „unterwegs", und die Begründung von Decision 7 („erreichbar nur im Refetch-Fenster") trägt nicht mehr, weil die Phase „gespeichert" offline lange dauern kann. Engere Invalidierung wie ADR-030, kein Warten auf den Refetch.
- `docs/TODO.md`: die drei Einträge löschen („Ein erfolgreicher Speichervorgang kann unsichtbar werden …", „Doppelte Anzeige, solange zwei Range-Queries aktiv sind", „Die Mutations-`onSettled`-Blöcke invalidieren weiterhin `calendarKeys.all`"). Neue Lücken, die dabei auffallen, kommen dazu.
- `docs/roadmap.md`: 8.3 als erledigt, „Die nächsten Branches" nachziehen.
- `docs/architecture.md`, falls es das Overlay oder seine Lebensdauer beschreibt.
- PR schließt #111.

## 6. Dem Builder überlassen

- Die Form der Einträge (Phasenfeld, Zeitpunkt, `delete`-Art) und wie eine Ansicht ihren Datenstand an `visibleOccurrences` übergibt.
- Der Mechanismus für 3.3 (etwa ein Abonnement auf den Query-Cache), solange er die Regel trifft und `features/calendar/optimisticEvents.ts` unter `bun test` ladbar bleibt.
- Wie `useFamilyEvents` dem Dashboard „noch nie Daten" meldet.
- Reihenfolge und Zuschnitt der Plan-Aufgaben.
