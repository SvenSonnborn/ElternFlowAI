# Copy Decks (DE / EN)

Conventions

- German = primary. Always _Du_, never _Sie_.
- English fallback is plain, conversational ("Sign in", not "Log in to account").
- All strings live in i18n catalogs (`de.json`, `en.json`) keyed by `screen.element`.
- Date format: DE `Mi, 14. Mai`, EN `Wed, May 14`.
- Time: 24h DE, 24h EN as well (modern family-app convention).

## Global

| Key             | DE           | EN          |
| --------------- | ------------ | ----------- |
| `app.name`      | Eltern Flow  | Eltern Flow |
| `nav.dashboard` | Dashboard    | Home        |
| `nav.calendar`  | Kalender     | Calendar    |
| `nav.meals`     | Essen        | Meals       |
| `nav.homework`  | Aufgaben     | Homework    |
| `nav.family`    | Familie      | Family      |
| `action.save`   | Speichern    | Save        |
| `action.next`   | Weiter       | Next        |
| `action.back`   | Zurück       | Back        |
| `action.skip`   | Überspringen | Skip        |
| `action.done`   | Fertig       | Done        |
| `action.seeAll` | Alle ansehen | See all     |
| `action.cancel` | Abbrechen    | Cancel      |

## Auth

| Key                | DE                                                      | EN                                    |
| ------------------ | ------------------------------------------------------- | ------------------------------------- |
| `auth.signIn`      | Anmelden                                                | Sign in                               |
| `auth.signUp`      | Konto erstellen                                         | Create account                        |
| `auth.email`       | E-Mail                                                  | Email                                 |
| `auth.password`    | Passwort                                                | Password                              |
| `auth.forgot`      | Passwort vergessen?                                     | Forgot password?                      |
| `auth.stay`        | Eingeloggt bleiben                                      | Stay signed in                        |
| `auth.or`          | ODER                                                    | OR                                    |
| `auth.google`      | Mit Google anmelden                                     | Continue with Google                  |
| `auth.apple`       | Mit Apple anmelden                                      | Continue with Apple                   |
| `auth.tagline`     | Der KI-Assistent für moderne Familien.                  | The AI assistant for modern families. |
| `auth.error.title` | E-Mail oder Passwort falsch                             | Email or password incorrect           |
| `auth.error.help`  | Versuch es noch einmal oder setze dein Passwort zurück. | Try again or reset your password.     |
| `auth.magicLink`   | Magic-Link per E-Mail senden                            | Send magic link by email              |
| `auth.newHere`     | Neu hier?                                               | New here?                             |

## Onboarding (5 steps)

| Key                    | DE                                                                                 | EN                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `onb.stepCounter`      | Schritt {n} von {total}                                                            | Step {n} of {total}                                                  |
| `onb.s1.title`         | Erstelle dein Konto                                                                | Create your account                                                  |
| `onb.s1.sub`           | Mit dieser E-Mail teilst du später Kalender und Listen mit deinem Partner.         | You'll use this email to share calendar and lists with your partner. |
| `onb.s1.terms`         | Ich stimme den AGB und der Datenschutzerklärung zu.                                | I agree to the terms and privacy policy.                             |
| `onb.s2.title`         | Wie heißt deine Familie?                                                           | What's your family called?                                           |
| `onb.s2.sub`           | Du siehst diesen Namen oben auf dem Dashboard.                                     | You'll see this name at the top of your dashboard.                   |
| `onb.s2.field`         | Familienname                                                                       | Family name                                                          |
| `onb.s2.privacy.title` | Eure Daten gehören euch                                                            | Your data is yours                                                   |
| `onb.s2.privacy.sub`   | Verschlüsselt in der EU gespeichert. Keine Werbung.                                | Encrypted, stored in the EU. No ads.                                 |
| `onb.s3.title`         | Lade deinen Partner ein                                                            | Invite your partner                                                  |
| `onb.s3.sub`           | Termine, Aufgaben und Einkaufslisten werden in Echtzeit geteilt.                   | Events, tasks and shopping lists sync in real time.                  |
| `onb.s3.send`          | Einladung senden                                                                   | Send invite                                                          |
| `onb.s3.later`         | Später einladen                                                                    | Invite later                                                         |
| `onb.s4.title`         | Erzähl uns von deinem Kind                                                         | Tell us about your child                                             |
| `onb.s4.sub`           | Du kannst weitere Kinder später anlegen — oder die KI mit deiner Stimme bitten.    | You can add more kids later — or use your voice.                     |
| `onb.s4.voice`         | Lieber per Sprache erzählen                                                        | Or tell us by voice                                                  |
| `onb.s5.title`         | Alles bereit!                                                                      | All set!                                                             |
| `onb.s5.sub`           | Eltern Flow ist eingerichtet. {partner} wurde eingeladen und {child} ist angelegt. | Eltern Flow is ready. {partner} got an invite, {child} is set up.    |
| `onb.s5.cta`           | Zum Dashboard                                                                      | Open dashboard                                                       |

## Dashboard

| Key                        | DE                                                                                                                             | EN                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `dash.greeting.morning`    | Guten Morgen, {name}                                                                                                           | Good morning, {name}                                                                                     |
| `dash.greeting.day`        | Schönen Tag, {name}                                                                                                            | Have a great day, {name}                                                                                 |
| `dash.section.today`       | Heute                                                                                                                          | Today                                                                                                    |
| `dash.section.tomorrow`    | Morgen vorbereiten                                                                                                             | Prep for tomorrow                                                                                        |
| `dash.meal.question`       | Was essen wir heute?                                                                                                           | What's for dinner today?                                                                                 |
| `dash.meal.badge`          | Passt perfekt zu deiner Familie                                                                                                | Perfect for your family                                                                                  |
| `dash.meal.reason.example` | Ben liebt Nudeln · keine Allergien · 20 Min.                                                                                   | Ben loves pasta · no allergies · 20 min                                                                  |
| `dash.meal.openRecipe`     | Rezept öffnen                                                                                                                  | Open recipe                                                                                              |
| `dash.meal.toShopping`     | Zur Einkaufsliste                                                                                                              | Add to shopping list                                                                                     |
| `dash.empty.title`         | Deine Familie wartet                                                                                                           | Your family awaits                                                                                       |
| `dash.empty.sub`           | Lege Profile für deine Kinder an oder lade deinen Partner ein. Eltern Flow plant dann automatisch Termine, Essen und Aufgaben. | Add child profiles or invite your partner. Eltern Flow then plans events, meals and tasks automatically. |
| `dash.empty.addChild`      | Kind hinzufügen                                                                                                                | Add child                                                                                                |
| `dash.empty.invite`        | Partner einladen                                                                                                               | Invite partner                                                                                           |

## Voice assistant

| Key                          | DE                                                         | EN                                                |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `voice.fab.label`            | Sprachassistent                                            | Voice assistant                                   |
| `voice.overlay.eyebrow`      | Sprachassistent                                            | Voice assistant                                   |
| `voice.overlay.listening`    | Höre zu                                                    | Listening                                         |
| `voice.overlay.prompt`       | „Sprich mit Eltern Flow…"                                  | "Talk to Eltern Flow…"                            |
| `voice.overlay.exampleEvent` | „Trag bitte für Ben morgen um 16 Uhr Fußballtraining ein." | "Add football practice for Ben tomorrow at 4 pm." |
| `voice.chip.event`           | Termin anlegen                                             | Add event                                         |
| `voice.chip.task`            | Aufgabe für {name}                                         | Task for {name}                                   |
| `voice.chip.meal`            | Was kochen wir?                                            | What's for dinner?                                |
| `voice.chip.shopping`        | Einkauf hinzufügen                                         | Add to shopping                                   |

## Calendar

| Key                 | DE                 | EN                 |
| ------------------- | ------------------ | ------------------ |
| `cal.title.month`   | {monthName} {year} | {monthName} {year} |
| `cal.title.week`    | Diese Woche        | This week          |
| `cal.title.agenda`  | Agenda             | Agenda             |
| `cal.add.voice`     | Termin per Sprache | Add by voice       |
| `cal.legend.arzt`   | Arzt               | Doctor             |
| `cal.legend.schule` | Schule             | School             |
| `cal.legend.sport`  | Sport              | Sport              |
| `cal.legend.ha`     | HA                 | Tasks              |

## Meals

| Key                          | DE                                       | EN                               |
| ---------------------------- | ---------------------------------------- | -------------------------------- |
| `meals.title`                | Essensplanung                            | Meal plan                        |
| `meals.aiPlan`               | KI plant die Woche                       | Let AI plan the week             |
| `meals.aiPlan.sub`           | In 5 Sek. auf eure Familie zugeschnitten | Tailored to your family in 5 sec |
| `meals.tabs.dinner`          | Abendessen                               | Dinner                           |
| `meals.tabs.lunch`           | Mittag                                   | Lunch                            |
| `meals.tabs.breakfast`       | Frühstück                                | Breakfast                        |
| `meals.shopping.title`       | Einkaufsliste                            | Shopping list                    |
| `meals.shopping.sub`         | {n} Zutaten · automatisch aus Plan       | {n} ingredients · auto from plan |
| `meals.suggest.why`          | Warum dieser Vorschlag                   | Why this pick                    |
| `meals.suggest.other`        | Anderer Vorschlag                        | Other suggestion                 |
| `meals.suggest.alternatives` | {n} Alternativen                         | {n} alternatives                 |
| `meals.coach.title`          | Essens-Coach                             | Meal coach                       |
| `meals.coach.note`           | KI auf Familie angepasst                 | AI tuned to your family          |
| `meals.recipe.cta`           | Kochen starten                           | Start cooking                    |
| `meals.recipe.note`          | Hinweis                                  | Note                             |

## Homework

| Key            | DE                  | EN           |
| -------------- | ------------------- | ------------ |
| `hw.title`     | Hausaufgaben        | Homework     |
| `hw.dueToday`  | Heute fällig        | Due today    |
| `hw.thisWeek`  | Diese Woche         | This week    |
| `hw.longTerm`  | Langfristig         | Long term    |
| `hw.upcoming`  | Demnächst           | Upcoming     |
| `hw.doneToday` | Erledigt heute      | Done today   |
| `hw.add.voice` | Aufgabe per Sprache | Add by voice |

## Child profile

| Key               | DE                              | EN                       |
| ----------------- | ------------------------------- | ------------------------ |
| `child.name`      | Name                            | Name                     |
| `child.age`       | Alter                           | Age                      |
| `child.birthday`  | Geburtstag                      | Birthday                 |
| `child.school`    | Schule / Kita                   | School                   |
| `child.allergies` | Allergien & Unverträglichkeiten | Allergies & intolerances |
| `child.likes`     | Lieblingsessen                  | Favourite foods          |
| `child.dislikes`  | Mag nicht                       | Dislikes                 |
| `child.voiceAdd`  | Per Sprache ergänzen            | Add by voice             |

## Settings

| Key                 | DE                 | EN               |
| ------------------- | ------------------ | ---------------- |
| `set.title`         | Einstellungen      | Settings         |
| `set.language`      | Sprache            | Language         |
| `set.darkMode`      | Dunkles Design     | Dark mode        |
| `set.notifications` | Mitteilungen       | Notifications    |
| `set.voice`         | Sprachassistent    | Voice assistant  |
| `set.familyMembers` | Familienmitglieder | Family members   |
| `set.privacy`       | Datenschutz        | Privacy          |
| `set.connectedApps` | Verknüpfte Apps    | Connected apps   |
| `set.subscription`  | Eltern Flow Plus   | Eltern Flow Plus |
| `set.help`          | Hilfe & Support    | Help & support   |
| `set.logout`        | Abmelden           | Sign out         |

## Sample family (German plausibility)

The mock data below is what's used in the screens. Designers and engineers can use it for QA fixtures.

- **Familie Becker** — Anna (Admin) · Tobias
- **Ben**, 8 — Grundschule am Park, 2. Klasse — Allergie: Erdnüsse — mag: Spaghetti, Pizza, Erdbeeren — mag nicht: Pilze, Spinat
- **Mia**, 5 — Kita Sonnenblume, Vorschule — Allergie: Laktose — mag: Joghurt, Banane, Reis — mag nicht: Tomaten
- **Leo**, 12 — Goethe-Gymnasium, 7. Klasse — keine Allergien — mag: Burger, Sushi — mag nicht: Fisch, Brokkoli

## Sample event titles (German)

Use these for QA fixtures and AI prompt examples.

- "Kinderarzt Dr. Weber · U10"
- "Fußballtraining TSV"
- "Klavier · Leo"
- "Schwimmen · Mia"
- "Geburtstag Lisa"
- "Elternabend Schule"
- "Vokabeln Englisch Unit 6"
- "Referat: Photosynthese"
