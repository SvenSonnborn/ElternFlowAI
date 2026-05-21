# Pattern · Child profile (create / edit)

A single screen serves both — create starts empty, edit pre-fills. The route distinguishes (`/family/new` vs `/family/:id`).

## Goal

- Capture enough about a child for the AI to be useful: **name, age, school, allergies, likes, dislikes**.
- Make the allergy step _feel important_ — it gates meal logic.
- Offer voice as an alternative to filling everything by hand.

## Required fields

| Field         | Required | Notes                                          |
| ------------- | -------- | ---------------------------------------------- |
| Name          | yes      | Single line                                    |
| Age           | yes      | Integer; show "Jahre / Monate" switcher for ≤2 |
| School / Kita | no       | Free text                                      |
| Birthday      | no       | Date picker, format `DD.MM.YYYY`               |
| Allergies     | no       | Multi-select chips with `+ Andere`             |
| Likes         | no       | Multi-select chips, suggestions from AI corpus |
| Dislikes      | no       | Same as Likes                                  |

## Variants

### V1 · Standard form

Avatar at top + standard labeled inputs. Default for accessibility & habit.

### V2 · Card-section

Hero card with avatar + name + 6-colour picker. Sections below collapse into card groups: Quick fields · Allergies · Taste profile. Best for _editing_ a complete profile.

### V3 · Voice chat

A back-and-forth with the AI captures the same data. Captured pills appear in a sticky summary card at the top so the user can see what's been collected. Listen waveform when the user holds the FAB. Includes a "Lieber per Formular" escape hatch.

## Allergy emphasis

- Allergy chip uses **warn tone** (orange) when set, never mint.
- Recipes that omit an allergen for the child must show the omission inline ("Mia: laktosefrei zubereitet — Parmesan weggelassen.").

## Avatar

- 6-colour swatches; deterministic colour per kid (hash of name → palette.avatar). Photo upload optional.
- Sizes: `xl` (72) on this screen; `lg` (56) in onboarding step 4.

## State transitions

```
empty form (create) ── save ──► saved row in family list
edit (id)            ── save ──► toast "Profil aktualisiert"
voice chat           ── done ──► same save path, with the captured fields prefilled
```
