-- Eltern Flow AI: Recipes (global pool) + Meal Plan
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.6, 4.7, 5, 6)
-- Plan: docs/superpowers/plans/2026-05-29-supabase-schema-implementation.md (Section G)

-- ============================================================
-- Enums
-- ============================================================

drop type if exists public.recipe_source_enum cascade;
create type public.recipe_source_enum as enum (
  'gustar_generated',
  'gustar_searched',
  'gustar_crawled',
  'user_custom'
);

drop type if exists public.meal_slot_enum cascade;
create type public.meal_slot_enum as enum (
  'breakfast',
  'lunch',
  'dinner',
  'snack'
);

-- ============================================================
-- recipes (global pool)
-- ============================================================

drop table if exists public.recipes cascade;

create table public.recipes (
  id                       uuid primary key default gen_random_uuid(),
  source                   public.recipe_source_enum not null,
  source_external_id       text,
  source_url               text,
  -- NULL = globaler Pool (immutable, sichtbar für alle authenticated User).
  -- Gesetzt = privates Familien-Rezept: mit Familie kaskadierend gelöscht,
  -- NIEMALS in den globalen Pool überführt (bewusste ON DELETE CASCADE).
  created_by_family_id     uuid references public.families(id) on delete cascade,

  title                    jsonb not null,       -- {de: "Pasta Carbonara", en?: "..."}
  description              jsonb,
  image_url                text,
  duration_min             int,
  servings                 int,
  difficulty               text,                 -- 'easy'|'medium'|'hard'

  ingredients              jsonb not null,       -- [{amount:"200", unit:"g", name:{de:"Spaghetti"}}, ...]
  instructions             jsonb not null,       -- [{de:"Wasser kochen..."}, ...]

  -- contains_allergens: SOURCE OF TRUTH für Allergen-Filter beim Vorschlagen.
  -- Normalisierte Codes (milk, egg, wheat, ...) — wird semantisch aus Zutaten
  -- klassifiziert (Edge Function), NICHT aus diet_tags abgeleitet.
  contains_allergens       text[] not null default '{}',

  -- diet_tags: NUR UI-Badges ('vegan', 'gluten-free', ...). Kein Filter-Einsatz.
  -- Von gustar.io geliefert; semantisch weniger präzise als contains_allergens.
  diet_tags                text[] not null default '{}',

  keywords                 text[] not null default '{}',

  -- sha256(lower(title.de) || sorted(ingredient keys)) — verhindert Duplikate
  -- aus mehrfachen gustar.io-Calls oder gleichzeitigen Edge-Function-Instanzen.
  recipe_dedup_hash        text not null,

  fetched_at               timestamptz not null default now(),
  created_at               timestamptz not null default now()
);

comment on table public.recipes is
  'Global recipe pool. created_by_family_id NULL = global (readable by all, immutable by families). '
  'created_by_family_id set = private family recipe (cascades with family deletion, never promoted to pool).';

comment on column public.recipes.contains_allergens is
  'Source-of-truth for allergen filtering. Normalized codes (milk, egg, wheat, ...) derived via '
  'semantic ingredient analysis in Edge Function. NOT derived from diet_tags.';

comment on column public.recipes.diet_tags is
  'UI-only badges (vegan, gluten-free, ...) from gustar.io. Do NOT use for allergen filtering — '
  'use contains_allergens instead.';

comment on column public.recipes.recipe_dedup_hash is
  'sha256(lower(title.de) || "||" || sorted(ingredient-name+amount+unit keys)). '
  'UNIQUE constraint prevents duplicates from concurrent gustar.io calls.';

-- Indexes
create unique index recipes_dedup_hash_idx
  on public.recipes(recipe_dedup_hash);

create unique index recipes_source_external_idx
  on public.recipes(source, source_external_id)
  where source_external_id is not null;

create index recipes_contains_allergens_gin
  on public.recipes using gin (contains_allergens);

create index recipes_diet_tags_gin
  on public.recipes using gin (diet_tags);

create index recipes_keywords_gin
  on public.recipes using gin (keywords);

-- RLS
alter table public.recipes enable row level security;
alter table public.recipes force row level security;

-- SELECT: global pool (NULL) OR own private recipes.
-- Note: auth.uid() IS NOT NULL check is implicit via TO authenticated, but
-- written explicitly per spec for documentation clarity.
drop policy if exists "recipes: select global or own private" on public.recipes;
create policy "recipes: select global or own private"
  on public.recipes for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (
      created_by_family_id is null
      or created_by_family_id = public.current_family_id()
    )
  );

-- INSERT: any authenticated user can add to the pool (pool grows from all families' usage).
-- Intentionally NOT family-scoped — the global pool is a shared resource.
drop policy if exists "recipes: insert authenticated" on public.recipes;
create policy "recipes: insert authenticated"
  on public.recipes for insert
  to authenticated
  with check ( (select auth.uid()) is not null );

-- UPDATE: only own private recipes (global pool is immutable from client side).
drop policy if exists "recipes: update own private" on public.recipes;
create policy "recipes: update own private"
  on public.recipes for update
  to authenticated
  using ( created_by_family_id = public.current_family_id() )
  with check ( created_by_family_id = public.current_family_id() );

-- DELETE: only own private recipes (global pool rows are permanent).
drop policy if exists "recipes: delete own private" on public.recipes;
create policy "recipes: delete own private"
  on public.recipes for delete
  to authenticated
  using ( created_by_family_id = public.current_family_id() );

-- ============================================================
-- meal_plan_entries
-- ============================================================

drop table if exists public.meal_plan_entries cascade;

create table public.meal_plan_entries (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  date                date not null,
  meal_slot           public.meal_slot_enum not null,
  -- ON DELETE RESTRICT: recipe deletion is blocked if referenced in a meal plan.
  -- Global pool recipes are effectively permanent; private recipes should be
  -- removed from all meal plans before deletion.
  recipe_id           uuid not null references public.recipes(id) on delete restrict,
  servings_override   int,                    -- overrides recipe.servings when set
  notes               text,
  created_by          uuid references public.parents(id) on delete set null,
  created_at          timestamptz not null default now(),

  unique (family_id, date, meal_slot)
);

comment on table public.meal_plan_entries is
  'One entry per family+date+slot. recipe_id ON DELETE RESTRICT prevents accidental '
  'recipe removal while still referenced in a meal plan.';

comment on column public.meal_plan_entries.servings_override is
  'When set, overrides recipe.servings for this specific entry (e.g. cooking for more guests).';

create index meal_plan_family_date_idx on public.meal_plan_entries(family_id, date);

alter table public.meal_plan_entries enable row level security;
alter table public.meal_plan_entries force row level security;

drop policy if exists "meal_plan: select own family" on public.meal_plan_entries;
create policy "meal_plan: select own family"
  on public.meal_plan_entries for select
  to authenticated
  using ( family_id = public.current_family_id() );

drop policy if exists "meal_plan: insert own family" on public.meal_plan_entries;
create policy "meal_plan: insert own family"
  on public.meal_plan_entries for insert
  to authenticated
  with check ( family_id = public.current_family_id() );

drop policy if exists "meal_plan: update own family" on public.meal_plan_entries;
create policy "meal_plan: update own family"
  on public.meal_plan_entries for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

drop policy if exists "meal_plan: delete own family" on public.meal_plan_entries;
create policy "meal_plan: delete own family"
  on public.meal_plan_entries for delete
  to authenticated
  using ( family_id = public.current_family_id() );
