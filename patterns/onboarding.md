# Pattern · Registration / Onboarding flow

5 steps. Each step is its own route (`/onboarding/1` … `/onboarding/5`), wrapped in a shared shell.

## Shared shell

```
┌──────────────────────────────────────────┐
│  ← back        ▰▰▱▱▱        Überspringen │   ← top bar (gear is hidden)
│                                          │
│  EYEBROW: Schritt N von 5                │
│  H2 Title                                │
│  Sub-copy (1–2 lines)                    │
│                                          │
│  ⏎ Step content                          │
│                                          │
│  ─────────────────                       │
│  [ Primary CTA ]                         │
│  [ Secondary CTA ]                       │
└──────────────────────────────────────────┘
```

- Step dots: 22×4 px each, 6 px gap. Active = mint, inactive = `line-strong`.
- Back arrow always returns; the user can step back without losing entered data.
- "Überspringen" jumps to step 5 (we'll fill what we have).

## Step 1 · Email + Password

- Email + Password fields.
- Below password: 4-bar strength meter. Mint when ≥ 3 bars.
- Required: terms checkbox (checked = primary becomes enabled).

## Step 2 · Family name

- Single field with `users` leading icon.
- Suggestion chips below ("Familie Becker", "Team Becker", "Becker-WG", "Die Beckis"). Tap fills the field.
- Privacy assurance card at the bottom: shield icon, "Eure Daten gehören euch", "Verschlüsselt in der EU gespeichert. Keine Werbung."

## Step 3 · Invite partner

- Top: card showing the current user (Anna) with `Admin · Du` pill.
- Field: partner email.
- Below: what-is-shared card with checks for calendar, tasks, meal plan, child profiles.
- Primary CTA _Einladung senden_, secondary _Später einladen_ (still moves to next step).

## Step 4 · First child

- Big avatar with colour picker.
- Name + Age side-by-side (Name flex, Age 90 px).
- School/Kita single line.
- Allergies chip group — first chip pre-tinted as a hint (e.g. Erdnüsse if a regional default applies, otherwise none selected).
- Big voice CTA at the bottom: "Lieber per Sprache erzählen" — opens the voice chat variant of child profile.

## Step 5 · Done

- Big mint orb with check.
- Recap card: parent, partner status (Pending if invited), child(ren) with allergy summary.
- Primary CTA _Zum Dashboard_, secondary _Weiteres Kind anlegen_ (loops back to step 4 with fresh fields).

## Persistence

Each step writes to a draft `Family` record server-side so a refresh restores progress. The draft becomes a real family on Step 5 completion.

## Out of flow

- Email verification can happen lazy — show a "E-Mail bestätigen" banner on dashboard until verified, but don't block.
