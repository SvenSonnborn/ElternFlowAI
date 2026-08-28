# Pattern · Toast

Transient feedback that floats over whatever screen is open. Not a route, not a sheet — it never blocks and it never waits for an answer.

Imported from the design canvas section **10 · Toast-Komponente** (`screens/toasts.jsx`, artboards _Spezifikation_ + _Im Kontext · Erfolg / Fehler / Info_). Token contract lives in `DS.components.toast`.

## Goal

- Confirm that something landed ("Termin gespeichert") without interrupting the flow.
- Report a failure with the one action that fixes it ("Erneut versuchen").
- Carry partner activity into view ("Tobi hat den Plan geändert") — the app is shared, changes arrive from elsewhere.

A toast is for what the user just did, or what just happened to their family. It is never the only place a piece of information exists.

## Anatomy

```
┌─┬──────────────────────────────────────────────┬───┐
│▌│ ┌────┐  Termin gespeichert                   │ ✕ │
│▌│ │ ✓  │  Bens Fußballtraining · morgen 16:00. │   │
│▌│ └────┘  [ Erneut versuchen ]                 │   │
│ └──────────────────────────────────────────────┴───┤
│▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁│ ← timer
└────────────────────────────────────────────────────┘
 ↑ 4px accent rail
```

1. **Accent rail** — 4 px on the leading edge, rounded on the inner corners only (`0 3px 3px 0`). Carries the variant colour. Dropped in the `solid` variant.
2. **Icon square** — 30×30, radius 11, background = variant tint, glyph = variant accent at 17 px.
3. **Body**
   - **Title** — 13.5 px / 600. Required. One line where possible.
   - **Message** — 12.5 px, `ink-secondary`, `text-wrap: pretty`. Optional.
   - **Action** — one button, 28 px high, radius 10, background = variant tint, label = variant accent. At most one.
4. **Close** — 24×24 glyph button, radius 8, `ink-tertiary`. Suppressed for toasts that only auto-dismiss.
5. **Timer bar** — 2.5 px along the bottom, variant accent at 35 % opacity, `scaleX` 1 → 0. Optional; shown only while an auto-dismiss is running.

Surface: `card` background, radius 18, shadow `lg` + hairline ring, padding 13 / 14, gap 12.

### Placement

`ToastStack` is absolutely positioned inside the screen, not in a portal above the phone frame.

| Position          | Offset | Clears        |
| ----------------- | ------ | ------------- |
| `top` _(default)_ | 52     | Status bar    |
| `bottom`          | 96     | Tab bar       |

Side inset 14, gap between stacked toasts 9, `zIndex.toast` (70) — above the tab bar and mic FAB, below the voice overlay.

**One toast at a time is the rule. Two is the hard maximum** — a third replaces the oldest. The stack is `pointer-events: none`; only the toasts themselves take taps, so nothing underneath goes dead.

## Variants

### By severity

| Variant     | Icon      | Accent           | Tint            | Used for                                          |
| ----------- | --------- | ---------------- | --------------- | ------------------------------------------------- |
| `success`   | `check`   | `success`        | `success-soft`  | Saved, added, copied                              |
| `error`     | `warning` | `danger`         | `danger-soft`   | Save failed, wrong password, conflict             |
| `info`      | `sparkle` | `primary-strong` | `primary-soft`  | Partner activity, AI working, offline mode        |

### `solid`

Fills the whole surface with the accent, drops the rail, sets text to white (message at 85 % opacity) and the icon square to white-20 %.

**Reserved for blocking or safety-critical errors** — the allergy conflict is the canonical case ("Das Rezept enthält Erdnüsse — Ben ist allergisch."). Never for a routine confirmation. A solid success toast would read as an alarm about good news.

### `compact`

Title only, no message. For results that need no elaboration: _Kopiert_, _Passwort falsch_, _Offline-Modus aktiv_.

## States

- **Entering** — 140 ms ease-out, `translateY(-8px → 0)` + fade.
- **Resting** — with a timer bar if it will auto-dismiss, without one if it won't.
- **Exiting** — 120 ms ease-in, fade + height collapse, so the toast below slides up rather than jumping.
- **Reduce motion** — no translate, no collapse; fade only.

### Auto-dismiss

| Variant   | Dismisses after |
| --------- | --------------- |
| `success` | 3200 ms         |
| `info`    | 4500 ms         |
| `error`   | never — manual  |

**Errors do not auto-dismiss.** They carry the one action that fixes the problem; a countdown would take it away while the user is still reading. A toast carrying an action should not auto-dismiss either, regardless of variant.

## Accessibility

- `role="status"` + `aria-live="polite"` for `success` and `info`; `role="alert"` + `aria-live="assertive"` for `error`. On React Native: `accessibilityLiveRegion` / `accessibilityRole`.
- The close button needs a label — it is a glyph with no text.
- Title and message are announced together. Don't split them into two live regions.

### Touch targets — the one deviation

The design draws the close button at **24×24** and the action button at **28 px** high. Non-negotiable 4 in `CLAUDE.md` requires **≥ 44×44**.

Resolve it the way the rest of the app already does: **keep the drawn size, grow the touchable box.** `SectionHeader` and the dashboard avatar row both wrap a 32 px visual in a 44 px pressable rather than using `hitSlop` — `hitSlop` is not honoured by `Pressable` on react-native-web, and neighbouring targets would overlap. The close glyph stays 24 px; its hit box is 44×44 and may extend into the toast's padding.

The action button is the same call: 28 px of visible chrome inside a 44 px-high pressable row.

## Copy

Toast copy belongs to the feature that raises the toast, not to this pattern — there is no `toast.*` namespace. Each message goes in its own screen's namespace (`cal.*`, `meals.*`, `auth.*`, …) and follows the same rules as everything else: German is canonical, always Du, never Sie.

Two rules the specimen demonstrates:

- **Title names the outcome, not the operation.** "Termin gespeichert", not "Speichern erfolgreich".
- **Message adds the specifics that let the user verify it.** "Bens Fußballtraining · morgen 16:00 Uhr." — who, what, when. Without them the toast is decoration.

## Out of scope

A toast never carries: destructive confirmation (use `confirmDialog`), a form, more than one action, or anything the user must read to continue. If it can't be missed, it isn't a toast.
