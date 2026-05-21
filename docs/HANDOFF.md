# Eltern Flow AI — Developer Handoff

> Hand this folder to Claude Code (or any engineer) to implement the app from scratch. It contains a typed design system (`*.ts`), per-screen pattern specs (`patterns/*.md`), an icon list, and copy decks for DE + EN.

---

## 1. What you're building

**Eltern Flow AI** is a German-language (DE primary, EN secondary) AI-powered family organiser for parents with children newborn → ~20 yrs.

Core features

1. **Shared family calendar** — colour-coded by event type (Arzt, Schule, Sport, HA, Familie, Mahlzeit).
2. **Meal planner with AI suggestions** — picks meals that respect each kid's allergies/likes/dislikes, always shows reasoning, links to recipe + shopping list.
3. **Voice assistant** — the marquee feature. A big orange mic FAB exists on every primary screen; tapping opens a full-screen overlay. Voice can add events, tasks, child info, and ask for meal suggestions.
4. **Child profiles** — name, age, school, allergies, likes/dislikes. Multiple kids per family.
5. **Tasks & homework tracking** — daily + long-term, with deadlines and voice add/edit.

Brand voice: **warm, calm, modern, trustworthy**. Not cutesy. The pastel palette + Inter type carry the warmth — copy should be informative and respectful (German _Du_).

---

## 2. File map

```
design-system/
├─ colors.ts          – palette + brand aliases + event-type colour map
├─ typography.ts      – Inter scale + semantic text presets
├─ spacing.ts         – space / radius / shadow / motion / z-index / screen
├─ themes.ts          – lightTheme & darkTheme (semantic role → hex)
├─ components.ts      – variant specs for Button, Field, Card, Pill, TabBar, FAB…
├─ index.ts           – barrel + frozen `DS` object
├─ HANDOFF.md         – ← you are here
├─ README.md          – quick start for engineers
├─ ICONS.md           – icon list, stroke conventions, where each is used
├─ COPY.md            – DE/EN copy decks per screen
└─ patterns/
   ├─ dashboard.md
   ├─ dashboard-empty.md
   ├─ child-profile.md
   ├─ login.md
   ├─ onboarding.md
   ├─ meals.md
   ├─ calendar.md
   ├─ homework.md
   └─ settings-voice.md
```

The visual reference is the `index.html` design canvas in this project. Open it to see every screen at full fidelity, in light + dark, DE + EN.

---

## 3. Tech recommendations (not prescriptions)

| Concern   | Recommendation                                                            |
| --------- | ------------------------------------------------------------------------- |
| Framework | React Native + Expo (or Flutter). Designs are mobile-only.                |
| Styling   | StyleSheet objects or NativeWind — bind to the `DS` object                |
| State     | Zustand or Redux Toolkit for family/calendar state; React Query for API   |
| i18n      | `react-intl` or `i18next`. DE is the default, EN is the alternate locale  |
| Voice     | OS native STT (Speech in iOS, SpeechRecognizer on Android) → server LLM   |
| LLM       | Pick any chat completion API. Keep prompt + tools server-side             |
| Storage   | Family + child data: EU-hosted Postgres. Encrypted at rest, RLS by family |
| Auth      | Magic link + Apple + Google. No SMS.                                      |

For web prototype: React + Vite is fine; the existing demo uses React 18 inline-Babel.

---

## 4. Implementation order

A safe, demo-able order — each milestone is shippable:

1. **Foundations** — Project skeleton, theming (`themes.ts` → CSS vars), navigation (5-tab bar), top bar, typography in Inter. Render an empty dashboard.
2. **Auth + Onboarding** — Login, Login Failed, the 5-step onboarding. Persist the family entity.
3. **Child profile + Family tab** — CRUD for kids. The voice-first variant is _optional_; ship form first.
4. **Calendar** — Monthly + day view. Add-event flow (typed + voice).
5. **Homework** — By-child list view. Add task flow.
6. **Meal plan + AI suggestions** — Week plan, today hero, recipe modal. Server endpoint that takes family context and returns 1–3 ranked meals + reasons.
7. **Voice overlay** — Wire the FAB to OS STT → server LLM with tools (createEvent, createTask, addChild, suggestMeal). The KPIs live and die here.
8. **Settings + Subscription** — Language toggle, dark mode, Plus tier.
9. **Polish pass** — micro-animations, empty states, error states, accessibility.

---

## 5. Non-negotiables

- **Touch targets ≥ 44 × 44.** Mic FAB is 60. Voice overlay mic is 84.
- **Dark mode** — every screen. No exceptions.
- **DE locale is the default.** Don't hardcode strings.
- **Voice button is always reachable** — visible on Dashboard, Calendar, Meals, Homework, Profile, Family. Hidden only inside Settings sheet and the Onboarding flow.
- **AI reasoning is always shown.** When the AI proposes a meal, show why ("Ben liebt Nudeln · keine Allergien · 20 Min."). Never a black box.
- **Allergies are first-class** — every child profile flags them with a warn-coloured pill, and the meal planner must filter on them. Show an inline "Hinweis" in recipes that hide an allergen.
- **Privacy copy** — onboarding shows the "EU-hosted, no ads" promise card. Settings has a Privacy row.

---

## 6. Accessibility

- **Contrast** — all text in `textStyles.body` or larger meets WCAG AA against the bg of the surface it's on. Recheck after any colour edit.
- **Voice as accessibility feature** — for users who struggle with typing or have low vision, voice should cover every entry path. Tag voice flows with `accessibilityLabel`.
- **Reduced motion** — disable orb breathing + FAB ring pulse when `prefers-reduced-motion`.
- **Larger text** — type scale scales linearly with the OS text-size setting; don't fix font sizes.

---

## 7. State machine sketches

### Voice overlay

```
idle ── tap mic ──► listening ── stt result ──► thinking ── tool call result ──► confirming ── user confirm ──► success → idle
                          │                          │                                                                  │
                          └── tap close ──► idle     └── error ──► error_state                                          ↑
                                                                                                                          │
                                                                                          user can speak again — loops ──┘
```

### Meal suggestion

```
input(family, time-of-day, optional voice intent)
  → fetch family constraints
  → LLM rank (3 ideas)
  → return: { picks: [...3], reason: string each, ingredients: [...] }
  → UI shows top pick as hero; "Andere?" reveals other 2 in a sheet.
```

---

## 8. Tracking (suggested)

| Event                       | Why it matters                        |
| --------------------------- | ------------------------------------- |
| `voice_session_started`     | Health of the marquee feature         |
| `voice_intent_resolved`     | Tool the LLM picked + success/failure |
| `meal_suggestion_accepted`  | AI quality signal                     |
| `meal_suggestion_rejected`  | With reason chip if user gave one     |
| `onboarding_step_completed` | Funnel                                |
| `child_profile_completed`   | Conversion to value                   |
| `partner_invite_sent`       | Network effect                        |

---

## 9. Out of scope (v1)

- iPad / tablet layouts
- Web client
- Calendar provider sync (Google/Apple/Outlook) — design for later
- Recipe creation (only consume)
- Sharing outside the household
- Public family pages

Ask the PM before adding anything from this list.
