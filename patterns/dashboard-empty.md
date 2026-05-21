# Pattern · Empty Dashboard (onboarding state)

Shown the first time a user lands on the dashboard with no children or partner added yet. Same route, different state — the populated dashboard's data hooks just return empty.

## Goal

- Reassure the user the app is ready.
- Direct them to **one of three actions**: add child, invite partner, or talk.
- Showcase that voice can replace forms.

## Anatomy

1. **Top bar** — title `Willkommen!`, sub `Lass uns deine Familie einrichten`.
2. **Hero illustration zone** — five orb shapes (mint/orange/pink/violet/sky) arranged like a tiny family. Pure CSS / SVG, no raster.
3. **Heading** — large h2.
4. **Sub-copy** — 2 short sentences max.
5. **Primary CTA** — _Kind hinzufügen_ (mint solid).
6. **Secondary CTA** — _Partner einladen_ (neutral soft).
7. **Voice tip card** — orange-tinted, encourages saying "Lege ein Profil für Ben, 8 Jahre an".
8. Mic FAB.
9. Tab bar.

## Variants

### V1 · Illustration + two CTAs (default)

What's shown in the design. Maximum reassurance, two clear paths.

### V2 · Setup checklist

Same screen, but the content is a progress card + 5-step setup list with one CTA per row. Use for users who skipped the multi-step onboarding flow. Each item: icon → title → sub → action button or chev.

### V3 · AI conversation

Renders an AI greeting bubble + 4 suggested replies ("Ich habe 2 Kinder, 8 und 5", "Patchwork-Familie", "Alleinerziehend", "Lieber durch ein Formular"). The voice prompt card lives below. Reserve for an A/B cohort.

## Empty within empty

If the user dismisses every CTA and the FAB, the screen stays — it's never blank. Show a "Tipp" rotation card every 5 minutes that surfaces voice examples.

## Transition into populated

The moment the first child is created, the empty hero is replaced with the populated dashboard's content in a soft cross-fade (300ms `motion.duration.slow`). No reload, no second loading state.
