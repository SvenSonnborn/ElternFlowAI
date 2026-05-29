# Supabase Schema Design — Eltern Flow AI

**Status:** Approved (Brainstorming Phase)
**Date:** 2026-05-29
**Decision-Log:** wird in ADR-004 referenziert nach Implementation

---

## 1. Context

Supabase ist initialisiert ([ADR-003](../../decision-log.md)): Client läuft, MCP ist verbunden, Auth ist verfügbar — aber das DB-Schema ist leer. Bevor Auth-Flow, Login-Screen oder irgendein Datenpfad gebaut werden kann, muss das Schema für alle Kern-Features festgelegt sein: Familien, Eltern, Kinder, Kalender, Aufgaben, Erinnerungen, Mahlzeitenplan + Rezept-Pool.

Diese Spec ist das Ergebnis einer Brainstorming-Session. Alle Architektur-Entscheidungen sind hier dokumentiert mit Begründung; das anschließende Implementation-Plan-Dokument (writing-plans) baut darauf auf und zerlegt die Umsetzung in ausführbare Schritte.

### Zielbild

Eine Familie meldet sich an (per Elternteil), legt ihre Kinder an mit Allergien/Vorlieben, plant Termine, hängt Hausaufgaben an Kinder, bekommt Erinnerungen, und füllt den Wochenplan mit Rezepten — die werden aus einem globalen Pool gezogen, auf Allergene gefiltert, und bei Bedarf via gustar.io API neu generiert. Daten zwischen Familien sind hart isoliert per Row-Level-Security.

### Was explizit nicht abgedeckt ist

- UI-Implementation, Routing, Komponenten — kommen im Implementation-Plan
- Auth-Flow Details (Magic Link vs Password, OAuth) — eigene Spec wenn Onboarding-Pattern verfeinert wird
- Edge Functions / gustar.io Worker Implementation — eigene Spec
- Push-Notification-Pipeline (Expo Push + pg_cron) — eigene Spec sobald Reminder-Feature gebaut wird
- Realtime-Subscriptions — explizit out of scope für MVP
- Cross-Family-Sharing (z.B. Familie A teilt Termin mit Familie B) — explizit out of scope

---

## 2. Decisions Summary

| #   | Thema               | Entscheidung                                                                                    | Alternative die verworfen wurde                           |
| --- | ------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Login-Modell        | Pro Elternteil ein eigener Auth-Account, beide Eltern → gleiche `family_id`                     | Gemeinsamer Familien-Account; Hybrid mit Profile-Selector |
| 2   | Recurring Events    | Ein DB-Row mit RRULE-Pattern, Vorkommen werden zur Laufzeit berechnet                           | Materialisierte Duplikate; Hybrid mit Cache               |
| 3a  | Events vs Tasks     | Zwei separate Entitäten — Events haben Zeit-Slot, Tasks haben nur Deadline                      | Eine `items`-Tabelle mit optionalen Zeit-Slots            |
| 3b  | Types-Source        | Lookup-Tabellen mit System-Defaults (`family_id IS NULL`) + Family-Custom (`family_id` gesetzt) | Postgres-Enums; nur System-Defaults; nur Family-Custom    |
| 4   | Erinnerungen        | Eigene `reminders`-Tabelle mit XOR-Bezug zu event/task, mehrere pro Event möglich               | Flag + Offset direkt am Event; rein Frontend-lokal        |
| 5a  | Recipe-Storage      | **Globaler Pool** (`created_by_family_id NULL`), Allergen-Filter beim Vorschlagen               | Family-scoped Cache pro Familie; nur API-Referenz         |
| 5b  | Recipe-Source       | gustar.io (RapidAPI: `/generateRecipe`, `/search_api`, `/generateRecipeImage`)                  | OpenAI/Claude direkt; Edamam/Spoonacular                  |
| 5c  | Allergen-Modell     | `contains_allergens text[]` als source-of-truth für Filter; `diet_tags` nur als UI-Badge        | Nur `diet_tags` von gustar.io nutzen                      |
| 5d  | Dedup               | Hash über `lower(title) + sorted(ingredients)` mit UNIQUE-Constraint                            | Kein Dedup; LLM-Similarity-Check                          |
| 6   | i18n                | JSONB für übersetzbare Felder (`{de: "..."}`), erweiterbar ohne Schema-Migration                | DE+EN als separate Spalten; eigene Translation-Tabelle    |
| 7a  | Allergien/Vorlieben | Felder auf parents UND children dupliziert (`allergies, intolerances, likes, dislikes`)         | Gemeinsame `family_members` Basis-Tabelle                 |
| 7b  | Meal-Slots          | Mehrere pro Tag (`breakfast`, `lunch`, `dinner`, `snack`) als enum                              | Nur ein Slot pro Tag                                      |
| 7c  | Avatare             | Nur Theme-Farbe (`color text`), kein Foto im MVP                                                | Foto-Upload via Storage Bucket                            |

---

## 3. Architecture

### Ownership-Prinzip

Alles hängt an einer `family`. Jeder Datensatz hat entweder direkt `family_id` oder ist über einen FK indirekt zuordenbar (z.B. `event_exceptions.event_id → events.family_id`). RLS-Policies basieren konsequent auf "ist der eingeloggte User Mitglied dieser Familie?" via Helper-Function `current_family_id()`.

Eine bewusste Ausnahme: `recipes` mit `created_by_family_id IS NULL` ist ein globaler Pool, sichtbar für alle authenticated User.

### Cascading

- `parents.family_id` ON DELETE **RESTRICT** — Familie löschen erfordert erst alle Eltern zu entfernen (Schutz vor "letzter Elternteil löscht Familie aus Versehen")
- `children.family_id` ON DELETE **CASCADE** — Familie weg → Kinder weg
- `events.child_id`, `tasks.child_id` ON DELETE **SET NULL** — Kind weg → Termin/Task bleibt aber ohne Kind-Bezug
- `meal_plan_entries.recipe_id` ON DELETE **RESTRICT** — Rezept-Löschung blockiert wenn referenziert (Pool ist eh quasi immutable)
- `recipes.created_by_family_id` ON DELETE **CASCADE** — privates Familien-Rezept weg wenn Familie weg (NIE versehentlich in globalen Pool wandern lassen)

### ER-Übersicht (high-level)

```
auth.users (Supabase Auth)
    │ 1:1
    ▼
parents ────────► families ◄──────── children
    │                │                   │
    │                ├─ events ─────► event_exceptions
    │                │     │
    │                │     ▼
    │                │   event_types (oder NULL = system default)
    │                │
    │                ├─ tasks ───────► task_types
    │                │
    │                ├─ reminders (event_id XOR task_id)
    │                │
    │                └─ meal_plan_entries ──► recipes (GLOBAL POOL)
    │
    └─ created_by auf events, tasks, meal_plan_entries
```

---

## 4. Schema

> Notation: Felder mit `?` sind nullable. JSONB-Felder mit erwarteter Shape kommentiert. Indizes nur dort gelistet, wo sie nicht-trivial sind (PK + FK kriegen automatisch Indices).

### 4.1 Core: families, parents, children

```sql
CREATE TABLE families (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  settings     jsonb NOT NULL DEFAULT '{}',  -- {week_start: 'monday', default_locale: 'de', meal_slots: ['lunch','dinner']}
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  short           text NOT NULL,                  -- "S" für Avatar
  color           text NOT NULL,                  -- Theme-Token-Name, z.B. "primary"
  locale          text NOT NULL DEFAULT 'de',
  allergies       text[] NOT NULL DEFAULT '{}',
  intolerances    text[] NOT NULL DEFAULT '{}',
  likes           text[] NOT NULL DEFAULT '{}',
  dislikes        text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX parents_family_id_idx ON parents(family_id);

CREATE TABLE children (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name            text NOT NULL,
  birthday        date NOT NULL,                  -- age wird daraus berechnet (client-side oder GENERATED COLUMN)
  color           text NOT NULL,
  school          text,                            -- "Grundschule Beispielhausen"
  grade           text,                            -- "3a"
  allergies       text[] NOT NULL DEFAULT '{}',
  intolerances    text[] NOT NULL DEFAULT '{}',
  likes           text[] NOT NULL DEFAULT '{}',
  dislikes        text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX children_family_id_idx ON children(family_id);
```

### 4.2 Type-Lookups

```sql
CREATE TABLE event_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL,                  -- z.B. 'schule', 'training'
  label       jsonb NOT NULL,                 -- {de:"Schule", en?:"School"}
  icon        text NOT NULL,                  -- Icon-Name aus docs/ICONS.md
  color       text NOT NULL,                  -- Theme-Token
  family_id   uuid REFERENCES families(id) ON DELETE CASCADE,  -- NULL = System-Default
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX event_types_global_slug_idx ON event_types(slug) WHERE family_id IS NULL;
CREATE UNIQUE INDEX event_types_family_slug_idx ON event_types(slug, family_id) WHERE family_id IS NOT NULL;
CREATE INDEX event_types_family_id_idx ON event_types(family_id);

-- task_types: identische Struktur wie event_types (gleiche Spalten + Indizes)
CREATE TABLE task_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL,
  label       jsonb NOT NULL,
  icon        text NOT NULL,
  color       text NOT NULL,
  family_id   uuid REFERENCES families(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX task_types_global_slug_idx ON task_types(slug) WHERE family_id IS NULL;
CREATE UNIQUE INDEX task_types_family_slug_idx ON task_types(slug, family_id) WHERE family_id IS NOT NULL;
CREATE INDEX task_types_family_id_idx ON task_types(family_id);
```

**Seed (System-Defaults):**

- `event_types`: `schule`, `training`, `arzt`, `family`, `meal`
- `task_types`: `hausaufgaben`, `besorgung`, `eltern-aufgabe`

### 4.3 Events + Recurring + Exceptions

```sql
CREATE TYPE rrule_freq_enum AS ENUM ('daily','weekly','monthly','yearly');

CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type_id         uuid NOT NULL REFERENCES event_types(id) ON DELETE RESTRICT,
  child_id        uuid REFERENCES children(id) ON DELETE SET NULL,

  title           text NOT NULL,                   -- user-input, kein jsonb
  description     text,
  location        text,
  start_at        timestamptz NOT NULL,
  end_at          timestamptz NOT NULL,
  all_day         boolean NOT NULL DEFAULT false,

  -- RRULE (alle NULL = single occurrence):
  rrule_freq       rrule_freq_enum,
  rrule_interval   int NOT NULL DEFAULT 1,
  rrule_byweekday  int[],                          -- ISO: 1=Mo, 7=So
  rrule_until      timestamptz,
  rrule_count      int,

  created_by      uuid REFERENCES parents(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CHECK (end_at >= start_at),
  CHECK ((rrule_count IS NULL) OR (rrule_until IS NULL))  -- nicht beide gleichzeitig
);

CREATE INDEX events_family_start_idx ON events(family_id, start_at);
CREATE INDEX events_child_id_idx ON events(child_id) WHERE child_id IS NOT NULL;

CREATE TYPE event_exception_action_enum AS ENUM ('cancelled','modified');

CREATE TABLE event_exceptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence_date   date NOT NULL,                -- welches Vorkommen
  action            event_exception_action_enum NOT NULL,
  override          jsonb,                          -- {title?, start_at?, end_at?, location?}
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (event_id, occurrence_date)
);
```

**Expansion-Logik (Anwendungsschicht):** Client/Server holt `events` für Range, expandiert RRULEs via `rrule` NPM-Library, overlay `event_exceptions`.

### 4.4 Tasks

```sql
CREATE TABLE tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type_id         uuid NOT NULL REFERENCES task_types(id) ON DELETE RESTRICT,
  child_id        uuid REFERENCES children(id) ON DELETE SET NULL,

  title           text NOT NULL,
  description     text,
  subject         text,                            -- nur für Hausaufgaben: "Mathe"
  due_date        date NOT NULL,
  due_time        time,                            -- optional ("bis morgen" reicht meist)

  is_done         boolean NOT NULL DEFAULT false,
  completed_at    timestamptz,
  completed_by    uuid REFERENCES parents(id) ON DELETE SET NULL,

  created_by      uuid REFERENCES parents(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CHECK ((is_done = false) OR (completed_at IS NOT NULL))
);

CREATE INDEX tasks_family_due_idx ON tasks(family_id, due_date) WHERE is_done = false;
CREATE INDEX tasks_child_id_idx ON tasks(child_id) WHERE child_id IS NOT NULL;
```

**Bewusst nicht:** Recurring auf tasks (wiederkehrende "Aufgaben" sind semantisch all-day events), generisches `metadata jsonb`.

### 4.5 Reminders

```sql
CREATE TABLE reminders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,  -- denormalisiert für RLS-Performance
  event_id              uuid REFERENCES events(id) ON DELETE CASCADE,
  task_id               uuid REFERENCES tasks(id) ON DELETE CASCADE,
  offset_minutes        int NOT NULL,                  -- 1440 = 1d vorher, 120 = 2h vorher
  recipient_parent_id   uuid REFERENCES parents(id) ON DELETE CASCADE,  -- NULL = beide Eltern
  sent_at               timestamptz,                   -- Push-Audit + Idempotenz
  created_at            timestamptz NOT NULL DEFAULT now(),

  CHECK ((event_id IS NOT NULL) <> (task_id IS NOT NULL))  -- XOR
);

CREATE INDEX reminders_pending_idx ON reminders(family_id) WHERE sent_at IS NULL;
```

**Trigger zum Denormalisieren von family_id:**

```sql
CREATE FUNCTION public.set_reminder_family_id() RETURNS trigger AS $$
BEGIN
  IF NEW.event_id IS NOT NULL THEN
    SELECT family_id INTO NEW.family_id FROM public.events WHERE id = NEW.event_id;
  ELSE
    SELECT family_id INTO NEW.family_id FROM public.tasks WHERE id = NEW.task_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

CREATE TRIGGER reminders_set_family_id BEFORE INSERT ON reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_reminder_family_id();
```

**Out of scope (eigene Spec):** Push-Pipeline (pg_cron + Edge Function + Expo Push Service).

### 4.6 Recipes (Globaler Pool)

```sql
CREATE TYPE recipe_source_enum AS ENUM ('gustar_generated','gustar_searched','gustar_crawled','user_custom');

CREATE TABLE recipes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source                   recipe_source_enum NOT NULL,
  source_external_id       text,                       -- gustar.io recipe id (search/crawl)
  source_url               text,
  created_by_family_id     uuid REFERENCES families(id) ON DELETE CASCADE,  -- NULL = globaler Pool (immutable). Gesetzt = privates Familien-Rezept (mit Familie gelöscht, NIE in den Pool versetzt)

  title                    jsonb NOT NULL,             -- {de: "Pasta Carbonara"}
  description              jsonb,
  image_url                text,
  duration_min             int,
  servings                 int,
  difficulty               text,                       -- 'easy'|'medium'|'hard'

  ingredients              jsonb NOT NULL,             -- [{amount:"200", unit:"g", name:{de:"Spaghetti"}}, ...]
  instructions             jsonb NOT NULL,             -- [{de:"Wasser kochen..."}, ...]

  diet_tags                text[] NOT NULL DEFAULT '{}',   -- ['vegan','gluten-free'] (UI-Badges, KEIN Filter)
  contains_allergens       text[] NOT NULL DEFAULT '{}',   -- ['milk','eggs','wheat'] (FILTER source-of-truth, normalisiert)
  keywords                 text[] NOT NULL DEFAULT '{}',

  recipe_dedup_hash        text NOT NULL,              -- sha256(lower(title.de) || sorted(ingredients))
  fetched_at               timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX recipes_dedup_hash_idx ON recipes(recipe_dedup_hash);
CREATE UNIQUE INDEX recipes_source_external_idx
  ON recipes(source, source_external_id)
  WHERE source_external_id IS NOT NULL;
CREATE INDEX recipes_contains_allergens_gin ON recipes USING GIN (contains_allergens);
CREATE INDEX recipes_diet_tags_gin ON recipes USING GIN (diet_tags);
CREATE INDEX recipes_keywords_gin ON recipes USING GIN (keywords);
```

**Dedup-Hash-Berechnung (Anwendungsschicht beim Insert):**

```ts
const normalize = (s: string) => s.toLowerCase().trim();
const ingredientKey = (i: Ingredient) => `${normalize(i.name.de)}|${i.amount}|${i.unit}`;
const hash = sha256(
  normalize(recipe.title.de) + "||" + recipe.ingredients.map(ingredientKey).sort().join("~"),
);
```

### 4.7 Meal Plan

```sql
CREATE TYPE meal_slot_enum AS ENUM ('breakfast','lunch','dinner','snack');

CREATE TABLE meal_plan_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  date                date NOT NULL,
  meal_slot           meal_slot_enum NOT NULL,
  recipe_id           uuid NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  servings_override   int,                         -- sonst recipe.servings
  notes               text,
  created_by          uuid REFERENCES parents(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (family_id, date, meal_slot)
);

CREATE INDEX meal_plan_family_date_idx ON meal_plan_entries(family_id, date);
```

---

## 5. Recipe-Vorschlag: Cache-Hit & gustar.io-Aufruf

### Read-Pfad: "Schlag mir ein Rezept für Slot X vor"

```sql
-- Familie hat: allergies={'milk','peanut'}, intolerances={'lactose'}, dislikes={'fish'}
SELECT * FROM recipes
WHERE (created_by_family_id IS NULL OR created_by_family_id = current_family_id())
  AND NOT (contains_allergens && ARRAY['milk','peanut','lactose'])
  AND NOT (keywords && ARRAY['fish'])
ORDER BY random()
LIMIT 1;
```

- **Treffer:** existing `recipe_id` → INSERT in `meal_plan_entries`. Andere Familien profitieren auch.
- **Kein Treffer:** Edge Function ruft `gustar.io/generateRecipe` mit family-spezifischem Prompt (Allergien als "vermeiden", Likes als "bevorzugen"), klassifiziert die response (siehe unten), insert in `recipes` → INSERT in `meal_plan_entries`.

### Allergen-Klassifizierung (für `contains_allergens`)

gustar.io liefert `diet_tags`, aber die decken nicht alle Allergene 1:1 ab (z.B. "Hafermilch" → kein `milk`-Allergen, aber gustar.io setzt vermutlich kein Tag dazu). `contains_allergens` braucht eine semantische Analyse der Zutaten.

**Implementation (in Edge Function nach gustar.io-Call, vor Insert):**

- Prompt an LLM (z.B. Claude Haiku oder gustar.io selber wenn dort geeignet): "Welche Allergene sind in dieser Zutaten-Liste enthalten? Beachte Substitute wie Hafermilch, laktosefreie Milch, Sojasahne. Antworte als JSON-Array mit Allergen-Codes."
- Allergen-Codes-Whitelist (gepflegt im Code): `milk`, `lactose`, `egg`, `wheat`, `gluten`, `soy`, `peanut`, `treenut`, `fish`, `shellfish`, `sesame`, `mustard`, `celery`, `sulfite`, `lupin`, `mollusk`
- Resultat in `contains_allergens` schreiben. Falls LLM-Call fehlschlägt: Insert mit leerem Array + Warning-Log, manuelle Klassifizierung später.

### Dedup-Flow

```sql
-- Beim Insert: hash berechnen, dann INSERT ON CONFLICT
WITH new_recipe AS (
  INSERT INTO recipes (..., recipe_dedup_hash)
  VALUES (..., :hash)
  ON CONFLICT (recipe_dedup_hash) DO NOTHING
  RETURNING id
)
SELECT id FROM new_recipe
UNION ALL
SELECT id FROM recipes WHERE recipe_dedup_hash = :hash AND NOT EXISTS (SELECT 1 FROM new_recipe)
LIMIT 1;
```

Atomisch + race-condition-frei. Falls Hash existiert → use existing, sonst → insert new.

---

## 6. RLS Strategy

### Helper-Function

```sql
CREATE FUNCTION public.current_family_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT family_id FROM public.parents WHERE auth_user_id = (select auth.uid()) LIMIT 1
$$;
```

`STABLE` → Postgres ruft pro Query nur einmal auf. `SECURITY INVOKER` → liest `parents` mit User-Rechten (RLS auf parents erlaubt eigene Familie).

### Policy-Matrix

Alle Policies haben `TO authenticated`, alle `UPDATE`s haben `USING` UND `WITH CHECK` mit gleichem Predicate.

| Tabelle                                             | SELECT                                                                                                    | INSERT                                | UPDATE                                                            | DELETE                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| `families`                                          | `id = current_family_id()`                                                                                | nur via RPC `create_family()`         | eigene Familie                                                    | nur via RPC                       |
| `parents`                                           | `family_id = current_family_id()`                                                                         | nur via RPC (Onboarding/Invite)       | eigene Row (`auth_user_id = auth.uid()`)                          | eigene Row                        |
| `children`                                          | `family_id = current_family_id()`                                                                         | gleich                                | gleich                                                            | gleich                            |
| `event_types`, `task_types`                         | `family_id IS NULL OR family_id = current_family_id()`                                                    | `family_id = current_family_id()`     | `family_id = current_family_id()`                                 | `family_id = current_family_id()` |
| `events`, `tasks`, `meal_plan_entries`, `reminders` | `family_id = current_family_id()`                                                                         | gleich                                | gleich + `WITH CHECK`                                             | gleich                            |
| `event_exceptions`                                  | `event_id IN (SELECT id FROM events WHERE family_id = current_family_id())`                               | gleich                                | gleich                                                            | gleich                            |
| `recipes`                                           | `auth.uid() IS NOT NULL AND (created_by_family_id IS NULL OR created_by_family_id = current_family_id())` | `auth.uid() IS NOT NULL` (Pool offen) | `created_by_family_id = current_family_id()` (nur eigene private) | gleich                            |

### Onboarding via SECURITY DEFINER RPCs

Henne-Ei-Problem: neuer User hat keinen `parents`-Eintrag → `current_family_id()` ist NULL → kein Insert möglich. Lösung: zwei RPCs die RLS bewusst bypassen, mit explizitem `auth.uid()`-Check intern.

```sql
CREATE FUNCTION public.create_family(p_family_name text, p_parent_name text, p_short text, p_color text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_family_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.parents WHERE auth_user_id = v_uid) THEN
    RAISE EXCEPTION 'user already belongs to a family';
  END IF;
  INSERT INTO public.families (name) VALUES (p_family_name) RETURNING id INTO v_family_id;
  INSERT INTO public.parents (auth_user_id, family_id, name, short, color)
    VALUES (v_uid, v_family_id, p_parent_name, p_short, p_color);
  RETURN v_family_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_family FROM public;
GRANT EXECUTE ON FUNCTION public.create_family TO authenticated;
```

Analog `accept_invitation(p_token uuid)` für Partner-Einladung via `family_invitations(token, family_id, expires_at, created_by)`-Helper-Tabelle.

### Sicherheits-Punkte (aus Supabase-Skill)

- `SECURITY DEFINER` immer mit explicit `auth.uid()`-Check (sonst von anonymous callable, weil public schema)
- `EXECUTE` revoke von `public`, grant nur an `authenticated`
- `SET search_path = ''` (verhindert search_path-injection bei DEFINER)
- Function-body referenziert alle Tables fully qualified (`public.parents`)
- Keine `auth.role()`-Checks (deprecated, kann mit anonymous sign-ins silent durchgehen)
- Keine `raw_user_meta_data`-Authorization (User-editable, nur `app_metadata` ist sicher)

---

## 7. i18n-Strategie

Drei String-Klassen im Schema:

| Klasse               | Typ                    | Beispiel                                                  | Begründung                                                                                              |
| -------------------- | ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| User-Input           | `text`                 | `events.title`, `parent.name`, `child.school`             | Nicht übersetzbar — was der User tippt bleibt wie es ist                                                |
| System-Defaults      | `jsonb {de, en?, ...}` | `event_types.label`, `task_types.label`                   | Von uns ausgeliefert, sollen mit App-Sprache mitziehen                                                  |
| External API content | `jsonb {de, en?, ...}` | `recipes.title`, `recipes.instructions`, ingredient names | gustar.io liefert DE — JSONB lässt EN nachträglich ergänzen (z.B. via LLM-Worker) ohne Schema-Migration |

**Frontend-Helper:**

```ts
function pickLocale<T extends Record<string, string>>(field: T, locale: string): string {
  return field[locale] ?? field.de ?? Object.values(field)[0];
}
```

**JSONB-Indizes wenn nötig:**

- `CREATE INDEX recipes_title_de_idx ON recipes USING GIN ((title->'de') gin_trgm_ops)` für Volltextsuche
- `CREATE INDEX event_types_label_de_idx ON event_types ((label->>'de'))` für Sortierung

---

## 8. Out of Scope (eigene Specs)

- **Push-Notification-Pipeline** — `pg_cron` Job liest `reminders WHERE sent_at IS NULL AND <due>`, Edge Function ruft Expo Push Service. Eigene Spec sobald Reminder-Feature gebaut wird.
- **gustar.io-Worker / Edge Function** — Implementation des Cache-Hit-Pfads + Allergen-Klassifikation. Eigene Spec im Implementation-Plan.
- **Auth-Flow Details** — Email/Password vs Magic Link vs OAuth (Apple/Google). Wird im Implementation-Plan für Login-Screen entschieden.
- **Realtime-Subscriptions** — Wenn beide Eltern gleichzeitig die App nutzen sollen, brauchen wir `supabase_realtime`-Publikation auf den family-scoped Tabellen. Explizit not-MVP.
- **Soft-Delete** — Aktuell hard delete via Cascade. Wenn "Papierkorb"-Feature gewünscht: separate Spec.
- **Cross-Family-Sharing** — z.B. Sportverein-Termin sichtbar für mehrere Familien. Komplexes Sharing-Modell, eigene Spec wenn relevant.
- **TypeScript-Types-Generation** — `supabase gen types typescript` läuft post-migration; Wiring + CI-Check eigener Mini-Plan.
- **Family-Settings UI** — Settings (`families.settings jsonb`) wird beim Onboarding gesetzt, UI für Änderung später.

---

## 9. Verification (für Implementation-Plan)

Akzeptanzkriterien sobald Schema in der DB ist:

1. **`supabase db advisors security`** → 0 Findings (alle RLS enabled, alle Policies vorhanden).
2. **`supabase db advisors performance`** → keine "missing index on FK"-Warnings.
3. **MCP `list_tables(verbose=true)`** → alle 11 Tabellen + FK-Constraints sichtbar.
4. **Seed-Migration** → `event_types` und `task_types` enthalten System-Defaults (`family_id IS NULL`).
5. **RLS-Smoke-Test:** zwei Test-Familien anlegen, von Familie 1 sehen → nur eigene Daten. SQL via MCP `execute_sql` mit `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = ...`.
6. **Dedup-Test:** zweimal identisches Rezept inserten → nur 1 Row in `recipes`, beide Inserts geben gleiches `id` zurück.
7. **Recurring-Expansion:** ein RRULE-Event anlegen, Client-Library expandiert für Range korrekt (Unit-Test).
8. **Onboarding-RPC:** `create_family()` als authenticated User → erzeugt families+parents-Row atomar. Zweiter Aufruf mit gleichem User → schlägt fehl mit klarer Fehlermeldung.
