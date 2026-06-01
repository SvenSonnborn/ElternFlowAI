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

## Step 2 · Family name + Your name

- Family-name field with `users` leading icon. Suggestion chips: "Familie {Localpart}", "Team {Localpart}", … (tap fills the field). **Hidden when the user arrived via an invitation** (`elternflow://invite/<token>` was stashed by deepLinkHandler) — the invited partner joins the existing family rather than naming a new one.
- Parent-name field with `user` leading icon (your own name).
- Avatar color picker: 6 chips from `AVATAR_COLORS`. The initial `short` (e.g. "AN" for "Anna") is auto-derived from the parent name on submit.
- Privacy assurance card at the bottom: shield icon, "Eure Daten gehören euch", "Verschlüsselt in der EU gespeichert. Keine Werbung."

**Commit-Pfad:** Step 2 is the only step that commits a row before the user reaches Step 5 — Submit calls `rpc("create_family")` (or `rpc("accept_invitation")` on the invite path). From this point on, the user has a `parents` row and the AuthGate would in principle allow `(tabs)`, but the AuthGate has an explicit carve-out so the user stays in `(onboarding)` until Step 5 explicitly leaves.

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

Approach C (per ADR-005): Step 2 commits via `rpc("create_family")`. Steps 3 + 4 are optional INSERTs (skip = no INSERT). Step 5 is a read-only recap — it never commits, it just reads. No `family_drafts` table, no local-only buffer.

If the user closes the app between Step 2 and Step 5: the `parents` row already exists, so on re-open AuthGate routes to `/(tabs)`. The dashboard's empty-state ([dashboard-empty.md](./dashboard-empty.md)) catches missing children and partners.

## Out of flow

- Email verification can happen lazy — show a "E-Mail bestätigen" banner on dashboard until verified, but don't block.
