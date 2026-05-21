# Icons

All icons are stroke-based, Lucide-style (https://lucide.dev) at stroke 2, round caps & joins. Two exceptions are filled/multicoloured brand marks.

## Stroke conventions

- Default stroke: `2`
- Chevrons, plus, check: `2.4` (visually heavier)
- Linecap: `round`, linejoin: `round`
- Default size: `18`
- Inside an icon container: container 30 → icon 16, container 36 → icon 18, container 42 → icon 20

## Icon set (used in the designs)

| key        | Lucide name       | Where used                                                |
| ---------- | ----------------- | --------------------------------------------------------- |
| `home`     | `home`            | Tab bar · Dashboard                                       |
| `calendar` | `calendar`        | Tab bar · Kalender · agenda rows                          |
| `utensils` | `utensils`        | Tab bar · Essensplanung · meal rows                       |
| `book`     | `book-open`       | Tab bar · Hausaufgaben · recipe button                    |
| `users`    | `users`           | Tab bar · Familie · invite partner                        |
| `gear`     | `settings`        | Top bar right (every screen)                              |
| `mic`      | `mic`             | FAB · voice overlay · voice add buttons                   |
| `plus`     | `plus`            | Add anything                                              |
| `check`    | `check`           | Checkboxes, completed checklist items, allergy badge tick |
| `chev`     | `chevron-right`   | Row affordance                                            |
| `chevL`    | `chevron-left`    | Back, prev week                                           |
| `chevD`    | `chevron-down`    | Bottom sheet close gesture, selects                       |
| `bell`     | `bell`            | Notification on event rows, reminder toggle               |
| `heart`    | `heart`           | Favourite recipe, "likes" food chip                       |
| `sparkle`  | `sparkles`        | AI badges, AI suggestion buttons                          |
| `clock`    | `clock`           | Duration, due time                                        |
| `pin`      | `map-pin`         | Location of an event                                      |
| `cart`     | `shopping-cart`   | Shopping list                                             |
| `search`   | `search`          | Agenda search                                             |
| `filter`   | `filter`          | List filter                                               |
| `eye`      | `eye`             | Password reveal                                           |
| `more`     | `more-horizontal` | Row kebab, voice overlay options                          |
| `edit`     | `pencil`          | Edit profile avatar                                       |
| `trash`    | `trash-2`         | Delete (rare; usually in row swipe)                       |
| `arrow`    | `arrow-right`     | Continue, suggestion chip                                 |
| `doctor`   | `stethoscope`     | Arzt event type                                           |
| `ball`     | `volleyball`      | Sport event type (works for football/practice)            |
| `school`   | `graduation-cap`  | Schule event type, kid's school field                     |
| `cake`     | `cake`            | Birthday events                                           |
| `apple`    | `apple`           | (Reserved — fruit/lunch packing)                          |
| `mail`     | `mail`            | Email field, partner invite                               |
| `lock`     | `lock`            | Password field                                            |
| `homework` | `file-text`       | (Reserved — alt homework glyph)                           |
| `shield`   | `shield`          | Privacy / data promise                                    |
| `globe`    | `globe`           | Language switcher                                         |
| `moon`     | `moon`            | Dark mode toggle                                          |
| `warning`  | `alert-triangle`  | Allergy warning, login error, danger states               |

## Brand glyphs (filled / multicoloured)

- `google` — Google "G" 4-colour mark, used on auth sign-in
- `apple_logo` — Apple silhouette, used on auth sign-in

Don't restyle these or apply currentColor.

## Sizing matrix

| Icon container size | Common usage                   | Icon size |
| ------------------- | ------------------------------ | --------- |
| 24                  | Inside a list item leading box | 14        |
| 28                  | Inline chip                    | 14        |
| 30                  | Tinted box prefix              | 15–16     |
| 36                  | Card section icon              | 18        |
| 42                  | Hero card / agenda row         | 20        |
| 38 (top-bar gear)   | Top-right gear                 | 18        |
| 60 (mic FAB)        | Floating mic                   | 24        |
| 84 (voice overlay)  | Big mic                        | 32        |

## Why we use containers

Most icons live inside a _tinted square_ whose background is the icon's tone at ~13% alpha. That gives every event/category a soft colour wash without competing with real content. Pattern:

```ts
container = {
  width: 36,
  height: 36,
  radius: 12,
  background: `color-mix(in srgb, ${toneHex} 13%, transparent)`,
  color: toneHex,
};
```
