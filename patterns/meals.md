# Pattern · Essensplanung (Meals)

The differentiator. The AI's job is to suggest _the right thing_ for _this family_ _right now_, and to show its work.

## Goal

- Always answer "Was essen wir?" with **one defendable pick**.
- Make the reasoning visible (`Ben liebt Nudeln · keine Allergien · 20 Min.`).
- One-tap actions: _Rezept öffnen_ and _Zur Einkaufsliste_.

## Variants

### V1 · Weekly grid (default Essen tab)

- AI plan card at top: solid mint banner ("KI plant die Woche").
- Tabs: Abendessen · Mittag · Frühstück.
- 7 day rows (Mo–So): date · emoji · meal name · time · `more` kebab.
- Today's row gets `mint-tinted` background.
- Shopping list shortcut at the bottom — gradient peach card.

### V2 · Today hero

- Hero image (or gradient placeholder) at top.
- AI badge pill, meal name, meta row (time · spice · price).
- **Reason card** with 3 check rows ("Mia mag Reis · keine Tomaten", "Bens Erdnuss-Allergie beachtet", "Kürbis ist Saison & im Kühlschrank").
- Primary "Rezept öffnen" + neutral "Zur Einkaufsliste".
- Below: "Anderer Vorschlag" ghost button + "3 Alternativen" sparkle button.
- Week strip horizontally scrollable.
- Shopping summary at the bottom.

### V3 · Conversational coach

- Constraint chips at top (visible filters: allergies + time + budget).
- Chat thread with the AI (left bubbles = AI, right = user).
- Recipe cards appear _inside_ the thread, aligned to the AI's last message.
- Quick reply chips ("Veggie bitte", "Was Süßes", "Reste verwerten", "Anderes Kind?").
- Sticky composer at the bottom with mic + text.

## Recipe modal

Opened from any "Rezept öffnen" button. Bottom sheet, 86% height.

Sections (tabs inside the modal): **Zutaten** · **Zubereitung** · **Nährwerte**.

Sticky bottom row: secondary `Einkauf` + primary `Kochen starten`.

- Show an orange-tinted "Hinweis" card whenever the recipe was adjusted for an allergy.
- Header image area is 180 px. Real photo when available, gradient + emoji placeholder otherwise.

## AI suggestion contract

```ts
type MealPick = {
  id: string;
  title: string; // "Spaghetti mit Tomatensauce"
  emoji: string; // "🍝"
  durationMin: number;
  reason: string; // "Ben liebt Nudeln · keine Allergien · 20 Min."
  reasonItems: string[]; // 3 atomic facts for the V2 reason card
  alternates: MealPick[]; // 2 more, ranked
  ingredients: Ingredient[];
  flags: Flag[]; // 'allergy-safe-adjusted', 'uses-fridge-leftovers', etc.
};
```

The `reason` string is what shows on the Dashboard hero. The `reasonItems` array is what V2 renders.

## Behaviour rules

- Never propose a meal containing an active allergy for any family member. If forced (user explicitly searched), show a danger banner.
- Bias toward week variety — don't suggest the same meal within 5 days.
- Use the fridge inventory (manual entry / receipt scan future) — preferential ranking, not hard filter.
- Time-of-day defaults: if opened before 11 — Frühstück; 11–15 — Mittag; else Abendessen.

## Shopping list integration

- "Zur Einkaufsliste" appends ingredients to today's list, deduped against pantry.
- A toast confirms: `"{n} Zutaten hinzugefügt"`.
- The shopping list itself is its own route (`/meals/shopping`) — design TBD in v2.
