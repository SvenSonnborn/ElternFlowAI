# Pattern · Settings sheet & Voice overlay

## Settings — bottom sheet

Not a full route. Opened by tapping the gear in any top bar. Bottom sheet at 82% height, rounded `4xl` top corners, scrim `rgba(20,24,31,0.55)`.

### Sections

1. **Profile card** — avatar, name, email, Plus subscription pill. Tap → account detail route.
2. **App preferences group**
   - Sprache → DE/EN (radio sheet on tap)
   - Dunkles Design → toggle
   - Mitteilungen → On (chev to detail)
   - Sprachassistent → "Eltern Flow Stimme" (chev to voice settings: persona, language, wake word)
3. **Familie & Daten group**
   - Familienmitglieder → count chev
   - Datenschutz → chev
   - Verknüpfte Apps → count chev (Apple Health, Google Calendar later)
4. **Konto group**
   - Eltern Flow Plus → manage (orange-tinted row, sparkle icon)
   - Hilfe & Support → chev
   - Abmelden → danger styling, no chev

Footer: `Eltern Flow AI · v{semver} · Made in Berlin` in `text-tertiary`.

### Row pattern

```
[icon-container 32×32]  [label]                  [value · chev]
[icon-container 32×32]  [label]                  [toggle]
```

Icon container uses neutral `bg-2`. The orange-tinted version is for Plus only.

---

## Voice overlay — full screen

The marquee feature. Full-bleed, takes over the screen, dismissed with a chevron-down at top-left.

### Layout

```
┌──────────────────────────────────────────────────┐
│ ⌄         SPRACHASSISTENT             ⋯          │  top row
│                                                  │
│                                                  │
│              ╭─────────╮                         │
│              │  big    │   ← 200×200 animated   │
│              │  orb    │     mint/orange/pink   │
│              ╰─────────╯     conic gradient     │
│                                                  │
│            ● Höre zu                             │
│         „Sprich mit Eltern Flow…"                │
│  „Trag Ben morgen um 16 Uhr Fußball ein."        │
│                                                  │
│       ▁▃▅▆▇█▇▆▅▃▁▃▅▆▇                            │  waveform
│                                                  │
│  [Termin]  [Aufgabe für Leo]  [Was kochen?]      │  chips
│                                                  │
│   📓        ⬤ MIC 84       +                     │  controls
└──────────────────────────────────────────────────┘
```

### Components

- **Top row** — chevron-down (close), eyebrow "Sprachassistent", `more` for options.
- **Orb** — animated, 200 px. Conic gradient layer + radial highlight. Breathing animation (1200ms `motion.duration.voice`). When listening: opacity scales to amplitude.
- **Status pill** — orange-tinted `Höre zu` while STT runs; mint-tinted `Verstanden` after a successful intent; danger-tinted `Hab dich nicht verstanden` on failure.
- **Heading** — primary listening prompt; sub-line is a rotating example.
- **Waveform** — 16 vertical bars, amplitude bound to mic level. Use orange. Idle state: low-amplitude sine.
- **Suggestion chips** — 4 maximum, rotating. Tap = inserts that command as if spoken.
- **Bottom controls** — left: "history" (last 5 voice commands), centre: big mic (84 px, primary action), right: "+" for manual entry escape hatch.

### State machine

```
idle → tap-mic → recording → stt-streaming → llm-thinking → confirming → executing → success
                                ↓                ↓                       ↓
                              error            error                  error
```

Each non-idle state renders:

- idle: prompt + chips
- recording: waveform live, "Höre zu", chips dim
- thinking: orb pulsing, "Denke nach…"
- confirming: card slides up from below the orb with parsed result + Speichern button
- success: check animation on orb, fade back to idle after 1.4 s

### Examples (DE)

| User says                                  | Tool        | Parsed payload                             |
| ------------------------------------------ | ----------- | ------------------------------------------ |
| "Trag Ben morgen 16 Uhr Fußball ein"       | createEvent | child=Ben, type=Sport, time=tomorrow 16:00 |
| "Mia hat eine Allergie auf Laktose"        | updateChild | child=Mia, allergies+=lactose              |
| "Was essen wir heute?"                     | suggestMeal | now → meal pick                            |
| "Leo hat bis Freitag Englisch-Vokabeln"    | createTask  | child=Leo, subject=Englisch, due=Fri       |
| "Schreib auf die Einkaufsliste: 1 kg Reis" | addToList   | items=[{Reis, 1kg}]                        |

### Privacy

- Show a 1-line tooltip on first launch: "Audio wird sicher in der EU verarbeitet und nicht gespeichert."
- Settings → Sprachassistent has a "Aufnahmen löschen" action.
