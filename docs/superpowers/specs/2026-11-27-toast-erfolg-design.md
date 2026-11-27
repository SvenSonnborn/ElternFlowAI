# Erfolgs-Toasts und schrumpfendes Ausblenden — Design

Roadmap-Schritt 5 („Toast“). Branch `feat/toast-success`. Kleine Änderung, kurze Spec.

## Ziel und Warum

Erfolgsmeldungen sollen auf Web und nativ gleich aussehen. Die letzten zwei laufen noch über
`showAlert`, also über einen Dialog, der auf Web anders aussieht als nativ und den man wegtippen
muss. Sie werden zum Toast. Außerdem schrumpft ein Toast beim Ausblenden in der Höhe, damit der
zweite Toast im Stapel nachrutscht, statt zu springen ([patterns/toast.md](../../../patterns/toast.md),
„Exiting“).

## Ziele

1. `child.saved` in [ChildProfileScreen.tsx](../../../app-sections/child-profile/ChildProfileScreen.tsx)
   und `auth.newPassword.saved` in [NewPasswordScreen.tsx](../../../app-sections/auth/NewPasswordScreen.tsx)
   erscheinen als `success`-Toast statt als `showAlert`.
2. Beim Ausblenden laufen Höhe **und** der Stapelabstand (`DS.components.toast.stack.gap`) auf null,
   in derselben Zeit wie das Ausblenden (120 ms, ease-in). Der Nachbar rutscht nach, ohne Sprung
   am Ende.
3. Bei „Bewegung reduzieren“ gilt, was das Pattern verlangt: Ein- und Ausblenden als reiner Fade
   (140 ms bzw. 120 ms), kein Versatz, kein Schrumpfen. Heute springt der Toast dort ohne Animation.

## Nicht-Ziele

- Keine neue Copy. `docs/COPY.md` gehört dem Designer; beide Toasts zeigen nur ihren Titel
  (`compact`). „Passwort geändert. Bitte erneut anmelden.“ darf auf schmalen Geräten umbrechen.
- Die übrigen `showAlert`-Aufrufe (Fehlermeldungen, Hinweise) bleiben.
- `solid`, Toasts über `formSheet`-Screens und die Radien-Benennung bleiben in `docs/TODO.md` stehen.

## Darf nicht passieren

- Ein Toast geht beim Screenwechsel verloren. Geprüft: Beide Screens sind keine `formSheet`s und
  wechseln nach dem Speichern den Screen; der Passwort-Ablauf bleibt nach dem Abmelden in der
  `(auth)`-Gruppe, `decideRoute` liefert `null`, der Navigator samt `ToastProvider` bleibt montiert.
- Der Schatten des Toasts wird im Ruhezustand abgeschnitten.
- Ein Toast lässt sich nicht mehr schließen oder meldet `onDismiss` doppelt.

## Ansätze

- **A — Hülle mit gemessener Höhe (gewählt).** Um den bestehenden Toast kommt eine äußere
  `Animated.View`. Sie misst ihre Höhe per `onLayout` und lässt beim Schließen `height` und einen
  negativen `marginBottom` (0 → −gap) laufen, ohne Native Driver. Innen bleiben Fade und Versatz
  mit Native Driver wie bisher. Der negative Rand frisst den Stapelabstand in jeder Lage: oben- wie
  unten verankerter Stapel, erster wie letzter Toast. Bleibt bei React Natives `Animated`, ändert
  den Vertrag von `onDismiss` nicht.
- **B — Reanimated-Layout-Animationen (`exiting` + `LinearTransition`).** Verworfen: Reanimated
  käme zum ersten Mal in den App-Code, der Toast müsste umgeschrieben werden oder zwei
  Animationssysteme liefen nebeneinander, das Nachrutschen auf Web ist unsicher.
- **C — `LayoutAnimation`.** Verworfen: auf react-native-web ein No-op, dort bliebe der Sprung.

## Entscheidungen

- Beide Toasts: `variant: "success"`, Position `top` (Default), wie „Rezept eingeplant“ in
  [MealScheduleScreen.tsx](../../../app-sections/meal/MealScheduleScreen.tsx). `show()` vor der
  Navigation.
- `onDismiss` fällt erst, wenn innere und äußere Animation fertig sind.
- Unter „Bewegung reduzieren“ wird die Höhe nicht animiert; der Nachbar springt — so verlangt es
  das Pattern.
- Die beiden erledigten Einträge in [docs/TODO.md](../../TODO.md) („Toast statt `showAlert` für
  Erfolgsmeldungen“, „Das Ausblenden kollabiert die Höhe nicht“) fallen im Commit des Codes weg;
  am Branch-Ende verschwindet Schritt 5 aus der Roadmap. Kein ADR geplant: alles folgt dem
  Pattern, das Warum der Hülle steht als Kommentar am Code.

## Dem Umsetzenden überlassen

- Ob die Hülle während des Schrumpfens clippt (der Inhalt überlappt sonst kurz den nachrutschenden
  Toast, während er ausblendet). Im Ruhezustand darf sie nicht clippen.
- Wie die Höhe gehalten wird (State oder Ref) und wie innere und äußere Animation gekoppelt werden.
- Teststrategie im Detail. Mindestens: Jest-Tests, dass nach dem Speichern ein `success`-Toast mit
  dem jeweiligen Titel im Store steht (für `NewPasswordScreen` neu anzulegen); ein Test, dass
  `onDismiss` genau einmal nach dem Ausblenden fällt; ein Sichtlauf auf Web mit zwei gestapelten
  Toasts, bei dem der obere zuerst geht.
