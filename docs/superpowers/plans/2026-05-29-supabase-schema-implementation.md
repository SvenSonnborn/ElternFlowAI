# Supabase Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Baue das komplette DB-Schema (11 Spec-Kern-Tabellen + 1 Onboarding-Helper-Tabelle `family_invitations` = 12 total, 2 Onboarding-RPCs, 1 Trigger, vollständige RLS-Matrix) gemäß [`docs/superpowers/specs/2026-05-29-supabase-schema-design.md`](../specs/2026-05-29-supabase-schema-design.md) in der Supabase-Cloud-Instanz auf, sichere durch Tests die Familien-Isolation ab, und committe alles als reproduzierbare Migration-Files ins Repo.

**Architecture:** Iteration direkt gegen die Remote-DB via MCP `execute_sql` (keine lokale Supabase-Instanz nötig). Jede Section produziert eine Snapshot-Migration unter `supabase/migrations/<unix_ts>_<name>.sql` für Reproduzierbarkeit. RLS-Tests laufen via SQL-Smoke (set local role + JWT-claim simulation) und MCP `get_advisors`. Plan-Reihenfolge respektiert FK-Abhängigkeiten.

**Tech Stack:** Postgres 15 (Supabase Hosted), MCP-Tools (`execute_sql`, `apply_migration`, `list_tables`, `get_advisors`, `generate_typescript_types`), `@supabase/supabase-js` v2.106 (bereits installiert).

---

## Pre-flight & Conventions

### Conventions

- **Migrations-Naming:** `supabase/migrations/<unix_timestamp>_<descriptive_name>.sql` — Supabase-Standard. Timestamp wird beim Anlegen jeweils einmal generiert (`date -u +%Y%m%d%H%M%S`).
- **SQL-Style:** Lowercase keywords (`create table`, `select`), snake_case Identifier, 2-space-Indent, trailing comma in column-lists vermeiden.
- **Execution-Pattern pro Task:**
  1. SQL in `supabase/migrations/<ts>_<name>.sql` schreiben
  2. SQL via MCP `execute_sql` an Remote-DB schicken
  3. Verifizieren via MCP `list_tables verbose=true` und `get_advisors security`
  4. Eventuelle Smoke-Test-SQL via MCP `execute_sql`
  5. Git commit (nur die Migration-Datei + ggf. Doku)
- **Migration-Idempotenz:** Jede Migration startet mit `drop ... if exists cascade` für die in ihr definierten Objekte, damit Re-Run safe ist. Spec-konformer Endzustand bleibt gleich.
- **RLS-Default:** Jede Tabelle bekommt sofort `alter table … enable row level security` + `force row level security` — sonst Linting-Findings.

### File Structure (alles wird in dieser Session erzeugt)

```
supabase/
  migrations/
    <ts1>_helpers_and_core.sql       # Section A
    <ts2>_onboarding_rpcs.sql        # Section B
    <ts3>_type_lookups.sql           # Section C
    <ts4>_calendar.sql               # Section D
    <ts5>_tasks.sql                  # Section E
    <ts6>_reminders.sql              # Section F
    <ts7>_recipes_and_meal_plan.sql  # Section G
docs/
  decision-log.md                     # ADR-004 angehängt (Section H)
```

Keine Code-Änderungen in `features/supabase/` nötig — Client läuft schon. TypeScript-Types werden in Section H generiert und nach `features/supabase/database.types.ts` geschrieben.

---

## Section A — Helpers & Core (families, parents, children, RLS, current_family_id)

### Task A1: Migration-Datei anlegen + Extensions sicherstellen

**Files:**

- Create: `supabase/migrations/<ts>_helpers_and_core.sql`

- [ ] **Step 1: Timestamp generieren und Dateiname festlegen**

Run: `date -u +%Y%m%d%H%M%S`
Notiere den Timestamp (z.B. `20260529103000`). Im Folgenden TS_A genannt.

- [ ] **Step 2: Migration-Datei mit Extensions-Block anlegen**

Datei: `supabase/migrations/<TS_A>_helpers_and_core.sql`

```sql
-- Eltern Flow AI: Core schema (families, parents, children) + RLS helper
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.1, 6)

-- Required extensions (Supabase ships them, ensure they're enabled)
create extension if not exists pgcrypto with schema extensions;  -- gen_random_uuid
```

- [ ] **Step 3: Extensions-Block via MCP ausführen**

Tool: `mcp__supabase__execute_sql`
Query: Der gesamte Inhalt aus Step 2.
Expected: `result.error = null`. Re-run safe.

- [ ] **Step 4: Verifizieren**

Tool: `mcp__supabase__list_extensions`
Expected: `pgcrypto` hat `installed_version` ≠ null.

### Task A2: `families` Tabelle

**Files:**

- Modify: `supabase/migrations/<TS_A>_helpers_and_core.sql` (anhängen)

- [ ] **Step 1: SQL anhängen**

Anhängen an die Migration-Datei:

```sql
-- families
drop table if exists public.families cascade;

create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.families is 'Top-level entity. Every other row in the schema is owned by exactly one family.';
```

- [ ] **Step 2: Ausführen**

Tool: `mcp__supabase__execute_sql` mit dem Block aus Step 1.
Expected: kein Fehler.

- [ ] **Step 3: Verifizieren**

Tool: `mcp__supabase__list_tables` mit `schemas=["public"]`, `verbose=false`.
Expected: Eintrag `families` in `tables`.

### Task A3: `parents` Tabelle (mit auth.users FK)

**Files:**

- Modify: `supabase/migrations/<TS_A>_helpers_and_core.sql`

- [ ] **Step 1: SQL anhängen**

```sql
-- parents
drop table if exists public.parents cascade;

create table public.parents (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  family_id     uuid not null references public.families(id) on delete restrict,
  name          text not null,
  short         text not null,
  color         text not null,
  locale        text not null default 'de',
  allergies     text[] not null default '{}',
  intolerances  text[] not null default '{}',
  likes         text[] not null default '{}',
  dislikes      text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index parents_family_id_idx on public.parents(family_id);

comment on table public.parents is 'One row per parent. 1:1 with auth.users.';
```

- [ ] **Step 2: Ausführen via MCP `execute_sql`**

Expected: kein Fehler.

- [ ] **Step 3: Verifizieren**

Tool: `mcp__supabase__list_tables` mit `verbose=true`.
Expected: `parents` mit FK auf `families(id)` und `auth.users(id)`, Index `parents_family_id_idx`.

### Task A4: `children` Tabelle

**Files:**

- Modify: `supabase/migrations/<TS_A>_helpers_and_core.sql`

- [ ] **Step 1: SQL anhängen**

```sql
-- children
drop table if exists public.children cascade;

create table public.children (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  name          text not null,
  birthday      date not null,
  color         text not null,
  school        text,
  grade         text,
  allergies     text[] not null default '{}',
  intolerances  text[] not null default '{}',
  likes         text[] not null default '{}',
  dislikes      text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index children_family_id_idx on public.children(family_id);
```

- [ ] **Step 2: Ausführen via MCP `execute_sql`**

- [ ] **Step 3: Verifizieren via MCP `list_tables verbose=true`**

Expected: `children` mit FK auf `families(id)` cascade.

### Task A5: Helper-Function `current_family_id()`

**Files:**

- Modify: `supabase/migrations/<TS_A>_helpers_and_core.sql`

- [ ] **Step 1: SQL anhängen**

```sql
-- Helper: returns the family_id of the currently authenticated user, or NULL.
-- SECURITY INVOKER → uses caller's RLS rights on parents. STABLE → cached per query.
drop function if exists public.current_family_id();

create function public.current_family_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select family_id from public.parents where auth_user_id = (select auth.uid()) limit 1
$$;

comment on function public.current_family_id() is 'Returns the family_id for the currently authenticated user. NULL if no parent row exists (e.g. during onboarding).';
```

- [ ] **Step 2: Ausführen via MCP `execute_sql`**

- [ ] **Step 3: Verifizieren**

Tool: `mcp__supabase__execute_sql` mit:

```sql
select public.current_family_id();
```

Expected: NULL (kein Auth-Context im MCP-Call).

### Task A6: RLS auf families, parents, children aktivieren + Policies

**Files:**

- Modify: `supabase/migrations/<TS_A>_helpers_and_core.sql`

- [ ] **Step 1: SQL anhängen — Enable RLS**

```sql
-- Enable + force RLS on core tables
alter table public.families enable row level security;
alter table public.families force row level security;

alter table public.parents enable row level security;
alter table public.parents force row level security;

alter table public.children enable row level security;
alter table public.children force row level security;
```

- [ ] **Step 2: SQL anhängen — Policies für `families`**

```sql
-- families: SELECT own, UPDATE own; INSERT/DELETE nur via SECURITY DEFINER RPC (kommt in Section B)
drop policy if exists "families: select own" on public.families;
create policy "families: select own"
  on public.families for select
  to authenticated
  using ( id = public.current_family_id() );

drop policy if exists "families: update own" on public.families;
create policy "families: update own"
  on public.families for update
  to authenticated
  using ( id = public.current_family_id() )
  with check ( id = public.current_family_id() );

-- Bewusst KEINE INSERT/DELETE policy → läuft nur über SECURITY DEFINER RPC.
```

- [ ] **Step 3: SQL anhängen — Policies für `parents`**

```sql
-- parents: SELECT alle aus eigener family; UPDATE/DELETE nur eigene row; INSERT via RPC
drop policy if exists "parents: select own family" on public.parents;
create policy "parents: select own family"
  on public.parents for select
  to authenticated
  using ( family_id = public.current_family_id() );

drop policy if exists "parents: update self" on public.parents;
create policy "parents: update self"
  on public.parents for update
  to authenticated
  using ( auth_user_id = (select auth.uid()) )
  with check ( auth_user_id = (select auth.uid()) );

drop policy if exists "parents: delete self" on public.parents;
create policy "parents: delete self"
  on public.parents for delete
  to authenticated
  using ( auth_user_id = (select auth.uid()) );
```

- [ ] **Step 4: SQL anhängen — Policies für `children`**

```sql
-- children: full CRUD innerhalb eigener family
drop policy if exists "children: select own family" on public.children;
create policy "children: select own family"
  on public.children for select
  to authenticated
  using ( family_id = public.current_family_id() );

drop policy if exists "children: insert own family" on public.children;
create policy "children: insert own family"
  on public.children for insert
  to authenticated
  with check ( family_id = public.current_family_id() );

drop policy if exists "children: update own family" on public.children;
create policy "children: update own family"
  on public.children for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

drop policy if exists "children: delete own family" on public.children;
create policy "children: delete own family"
  on public.children for delete
  to authenticated
  using ( family_id = public.current_family_id() );
```

- [ ] **Step 5: Alle Policies ausführen via MCP `execute_sql`**

Expected: kein Fehler. Falls "policy already exists": die `drop policy if exists` fängt das ab.

- [ ] **Step 6: Verifizieren via MCP `get_advisors`**

Tool: `mcp__supabase__get_advisors` mit `type="security"`
Expected: keine Findings zu families/parents/children (kein "RLS disabled", keine "policy missing").

### Task A7: Smoke-Test für RLS (zwei Test-Familien, Isolation)

**Files:**

- Modify: `supabase/migrations/<TS_A>_helpers_and_core.sql` (kein Append — Test-SQL nur via MCP, nicht in Migration!)

> **Hinweis:** Dieser Test-SQL läuft NUR via MCP, wird NICHT in die Migration aufgenommen (sonst würden Test-Daten bei jedem Re-Deploy angelegt).

- [ ] **Step 1: Test-Setup-SQL via MCP `execute_sql` ausführen**

```sql
-- Test setup: zwei Familien + zwei Eltern (ohne auth.users — wir testen mit fake UUIDs)
-- Anschließend per `set local request.jwt.claim.sub` simulieren wir Auth-Context.

-- Bypass RLS via service_role (MCP läuft eh als service_role)
insert into public.families (id, name) values
  ('00000000-0000-0000-0000-00000000aaaa', 'TestFamilie A'),
  ('00000000-0000-0000-0000-00000000bbbb', 'TestFamilie B')
on conflict (id) do nothing;

insert into public.parents (id, auth_user_id, family_id, name, short, color) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aaaa', 'Anna A', 'A', 'primary'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000bbbb', 'Bob B', 'B', 'accent')
on conflict (id) do nothing;
```

Expected: 2 + 2 rows inserted.

> **Wichtig:** `set local` braucht eine Transaction — jede Test-Query MUSS in `begin; ... commit;` (oder `rollback;`) gewrappt werden, sonst geht der Auth-Context zwischen Statements verloren. MCP `execute_sql` sendet den ganzen Block als eine Query — Transaction-Wrapping funktioniert.

- [ ] **Step 2: Simuliere Auth-Context für Familie A, prüfe SELECT auf families**

```sql
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-0000000000a1';
  select id, name from public.families;
rollback;
```

Expected: GENAU 1 row, name = 'TestFamilie A'. (NICHT TestFamilie B!)

- [ ] **Step 3: Simuliere Familie B, prüfe Isolation**

```sql
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-0000000000b1';
  select id, name from public.families;
rollback;
```

Expected: GENAU 1 row, name = 'TestFamilie B'.

- [ ] **Step 4: Cross-Family-Write-Versuch muss scheitern**

```sql
begin;
  set local role authenticated;
  set local "request.jwt.claim.sub" to '00000000-0000-0000-0000-0000000000a1';
  insert into public.children (family_id, name, birthday, color)
  values ('00000000-0000-0000-0000-00000000bbbb', 'Mallory', '2018-01-01', 'primary');
rollback;
```

Expected: Fehler "new row violates row-level security policy for table 'children'". Falls die Query (entgegen Erwartung) erfolgreich war: RLS-Policy ist falsch konfiguriert — Section A6 reviewen.

- [ ] **Step 5: Test-Daten wieder löschen**

```sql
delete from public.parents where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');
delete from public.families where id in ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-00000000bbbb');
```

Expected: 2 + 2 rows deleted.

### Task A8: Section A commit

- [ ] **Step 1: Status check**

Run: `git status`
Expected: nur `supabase/migrations/<TS_A>_helpers_and_core.sql` ist neu.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/<TS_A>_helpers_and_core.sql
git commit -m "$(cat <<'EOF'
feat(db): core schema (families, parents, children) + RLS

Implementiert Section 4.1 und Teile von Section 6 der Schema-Spec:
helper function current_family_id(), RLS-Policies mit Familien-Isolation,
RLS-Smoke-Test bestätigt cross-family deny.

Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Section B — Onboarding RPCs (legt `family_invitations` Helper-Tabelle an + `create_family` + `accept_invitation`)

### Task B1: Migration-Datei anlegen + `family_invitations` Tabelle

**Files:**

- Create: `supabase/migrations/<TS_B>_onboarding_rpcs.sql`

- [ ] **Step 1: Timestamp generieren**

Run: `date -u +%Y%m%d%H%M%S`. Notiere als TS_B.

- [ ] **Step 2: Migration-File anlegen mit family_invitations**

```sql
-- Eltern Flow AI: Onboarding RPCs + family invitations
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 6)

drop table if exists public.family_invitations cascade;

create table public.family_invitations (
  token         uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  created_by    uuid references public.parents(id) on delete set null,
  expires_at    timestamptz not null default (now() + interval '7 days'),
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index family_invitations_family_id_idx on public.family_invitations(family_id);

comment on table public.family_invitations is 'One-time tokens for inviting a partner to join an existing family.';

-- Enable RLS — Einladungen sind sensibel
alter table public.family_invitations enable row level security;
alter table public.family_invitations force row level security;

-- Eltern können Einladungen ihrer eigenen Familie sehen/erstellen
drop policy if exists "invitations: select own family" on public.family_invitations;
create policy "invitations: select own family"
  on public.family_invitations for select
  to authenticated
  using ( family_id = public.current_family_id() );

drop policy if exists "invitations: insert own family" on public.family_invitations;
create policy "invitations: insert own family"
  on public.family_invitations for insert
  to authenticated
  with check ( family_id = public.current_family_id() );

drop policy if exists "invitations: delete own family" on public.family_invitations;
create policy "invitations: delete own family"
  on public.family_invitations for delete
  to authenticated
  using ( family_id = public.current_family_id() );
```

- [ ] **Step 3: Ausführen via MCP `execute_sql`**

- [ ] **Step 4: Verifizieren**

Tool: `mcp__supabase__list_tables verbose=true`
Expected: `family_invitations` mit FK auf families, RLS enabled.

### Task B2: RPC `create_family`

**Files:**

- Modify: `supabase/migrations/<TS_B>_onboarding_rpcs.sql`

- [ ] **Step 1: SQL anhängen**

```sql
-- create_family: vom neu registrierten User aufgerufen, legt families + parents atomar an
drop function if exists public.create_family(text, text, text, text);

create function public.create_family(
  p_family_name text,
  p_parent_name text,
  p_short text,
  p_color text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_family_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.parents where auth_user_id = v_uid) then
    raise exception 'user already belongs to a family' using errcode = '23505';
  end if;

  insert into public.families (name) values (p_family_name) returning id into v_family_id;

  insert into public.parents (auth_user_id, family_id, name, short, color)
  values (v_uid, v_family_id, p_parent_name, p_short, p_color);

  return v_family_id;
end;
$$;

revoke execute on function public.create_family(text, text, text, text) from public;
grant execute on function public.create_family(text, text, text, text) to authenticated;

comment on function public.create_family is 'Onboarding entry point: creates a new family and adds the calling user as the first parent. Idempotent guard: raises if user already has a parent row.';
```

- [ ] **Step 2: Ausführen via MCP `execute_sql`**

- [ ] **Step 3: Smoke-Test (kann nicht direkt aus MCP getestet werden weil auth.uid() leer)**

Note: Der Test läuft erst integriert wenn ein User signt up und die RPC ruft. Vor diesem Stand prüfen wir nur: ist die Function da und korrekt-typed?

```sql
select pg_get_functiondef('public.create_family(text,text,text,text)'::regprocedure);
```

Expected: returns the function definition text matching what we inserted.

### Task B3: RPC `accept_invitation`

**Files:**

- Modify: `supabase/migrations/<TS_B>_onboarding_rpcs.sql`

- [ ] **Step 1: SQL anhängen**

```sql
-- accept_invitation: vom eingeladenen Partner aufgerufen mit dem Token
drop function if exists public.accept_invitation(uuid, text, text, text);

create function public.accept_invitation(
  p_token uuid,
  p_parent_name text,
  p_short text,
  p_color text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invitation record;
  v_family_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.parents where auth_user_id = v_uid) then
    raise exception 'user already belongs to a family' using errcode = '23505';
  end if;

  select * into v_invitation from public.family_invitations
  where token = p_token
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'invitation invalid or expired' using errcode = '22023';
  end if;

  v_family_id := v_invitation.family_id;

  insert into public.parents (auth_user_id, family_id, name, short, color)
  values (v_uid, v_family_id, p_parent_name, p_short, p_color);

  update public.family_invitations set used_at = now() where token = p_token;

  return v_family_id;
end;
$$;

revoke execute on function public.accept_invitation(uuid, text, text, text) from public;
grant execute on function public.accept_invitation(uuid, text, text, text) to authenticated;
```

- [ ] **Step 2: Ausführen via MCP `execute_sql`**

- [ ] **Step 3: Verifizieren**

```sql
select pg_get_functiondef('public.accept_invitation(uuid,text,text,text)'::regprocedure);
```

Expected: returns function definition.

### Task B4: Section B commit

- [ ] **Step 1: Commit**

```bash
git add supabase/migrations/<TS_B>_onboarding_rpcs.sql
git commit -m "$(cat <<'EOF'
feat(db): onboarding RPCs (create_family, accept_invitation) + invitations table

SECURITY DEFINER functions mit explicit auth.uid()-check, EXECUTE revoked
from public, granted only to authenticated. family_invitations Tabelle mit
RLS für Token-Verwaltung. Spec Section 6.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Section C — Type Lookups (event_types, task_types) + System Seed

### Task C1: Migration-Datei + `event_types`

**Files:**

- Create: `supabase/migrations/<TS_C>_type_lookups.sql`

- [ ] **Step 1: Timestamp + Datei**

Run: `date -u +%Y%m%d%H%M%S`. Notiere als TS_C.

- [ ] **Step 2: SQL für event_types**

```sql
-- Eltern Flow AI: Type lookups (event_types, task_types) + system defaults
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.2)

drop table if exists public.event_types cascade;

create table public.event_types (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  label       jsonb not null,
  icon        text not null,
  color       text not null,
  family_id   uuid references public.families(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create unique index event_types_global_slug_idx on public.event_types(slug) where family_id is null;
create unique index event_types_family_slug_idx on public.event_types(slug, family_id) where family_id is not null;
create index event_types_family_id_idx on public.event_types(family_id);

alter table public.event_types enable row level security;
alter table public.event_types force row level security;

-- SELECT: system defaults (NULL) ODER eigene custom types
drop policy if exists "event_types: select global or own" on public.event_types;
create policy "event_types: select global or own"
  on public.event_types for select
  to authenticated
  using ( family_id is null or family_id = public.current_family_id() );

-- INSERT/UPDATE/DELETE: nur eigene custom
drop policy if exists "event_types: insert own" on public.event_types;
create policy "event_types: insert own"
  on public.event_types for insert
  to authenticated
  with check ( family_id = public.current_family_id() );

drop policy if exists "event_types: update own" on public.event_types;
create policy "event_types: update own"
  on public.event_types for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

drop policy if exists "event_types: delete own" on public.event_types;
create policy "event_types: delete own"
  on public.event_types for delete
  to authenticated
  using ( family_id = public.current_family_id() );
```

- [ ] **Step 3: Ausführen via MCP `execute_sql`**

### Task C2: `task_types` (gleiche Struktur)

**Files:**

- Modify: `supabase/migrations/<TS_C>_type_lookups.sql`

- [ ] **Step 1: SQL anhängen**

```sql
drop table if exists public.task_types cascade;

create table public.task_types (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  label       jsonb not null,
  icon        text not null,
  color       text not null,
  family_id   uuid references public.families(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create unique index task_types_global_slug_idx on public.task_types(slug) where family_id is null;
create unique index task_types_family_slug_idx on public.task_types(slug, family_id) where family_id is not null;
create index task_types_family_id_idx on public.task_types(family_id);

alter table public.task_types enable row level security;
alter table public.task_types force row level security;

drop policy if exists "task_types: select global or own" on public.task_types;
create policy "task_types: select global or own"
  on public.task_types for select
  to authenticated
  using ( family_id is null or family_id = public.current_family_id() );

drop policy if exists "task_types: insert own" on public.task_types;
create policy "task_types: insert own"
  on public.task_types for insert
  to authenticated
  with check ( family_id = public.current_family_id() );

drop policy if exists "task_types: update own" on public.task_types;
create policy "task_types: update own"
  on public.task_types for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

drop policy if exists "task_types: delete own" on public.task_types;
create policy "task_types: delete own"
  on public.task_types for delete
  to authenticated
  using ( family_id = public.current_family_id() );
```

- [ ] **Step 2: Ausführen via MCP `execute_sql`**

### Task C3: System-Defaults seeden

**Files:**

- Modify: `supabase/migrations/<TS_C>_type_lookups.sql`

- [ ] **Step 1: SQL anhängen (Seed)**

```sql
-- System-Defaults für event_types (idempotent via on conflict)
insert into public.event_types (slug, label, icon, color, family_id) values
  ('schule',   '{"de":"Schule"}'::jsonb,        'school',     'primary',      null),
  ('training', '{"de":"Training"}'::jsonb,      'activity',   'accent',       null),
  ('arzt',     '{"de":"Arzt"}'::jsonb,          'stethoscope','danger',       null),
  ('family',   '{"de":"Familie"}'::jsonb,       'users',      'primarySoft',  null),
  ('meal',     '{"de":"Essen"}'::jsonb,         'utensils',   'success',      null)
on conflict (slug) where family_id is null do nothing;

-- System-Defaults für task_types
insert into public.task_types (slug, label, icon, color, family_id) values
  ('hausaufgaben',   '{"de":"Hausaufgaben"}'::jsonb,     'book-open',  'accent',       null),
  ('besorgung',      '{"de":"Besorgung"}'::jsonb,        'shopping-bag','primary',     null),
  ('eltern-aufgabe', '{"de":"Eltern-Aufgabe"}'::jsonb,   'check-square','primarySoft', null)
on conflict (slug) where family_id is null do nothing;
```

> **Hinweis:** Falls die Icon-Namen nicht zu `docs/ICONS.md` passen, im Implementation-Plan-Schritt kurz quergecheckt werden. Wenn ein Icon noch nicht in der ICONS-Liste ist, dann das nächstpassende verwenden und es in [docs/ICONS.md](../../docs/ICONS.md) ergänzen (separater Commit).

- [ ] **Step 2: Ausführen via MCP `execute_sql`**

- [ ] **Step 3: Verifizieren**

```sql
select slug, label->>'de' as label_de from public.event_types where family_id is null order by slug;
select slug, label->>'de' as label_de from public.task_types where family_id is null order by slug;
```

Expected: 5 event_types + 3 task_types mit korrekten DE-Labels.

### Task C4: Section C commit

- [ ] **Step 1: Commit**

```bash
git add supabase/migrations/<TS_C>_type_lookups.sql
git commit -m "$(cat <<'EOF'
feat(db): event_types + task_types lookup tables with system defaults

Lookup-Pattern mit nullable family_id (NULL=system, gesetzt=family-custom),
partial unique indexes pro Scope, RLS lets users see globals + own customs.
Seeded: 5 event types (schule/training/arzt/family/meal) + 3 task types
(hausaufgaben/besorgung/eltern-aufgabe).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Section D — Calendar (events + event_exceptions)

### Task D1: Enums + `events` Tabelle

**Files:**

- Create: `supabase/migrations/<TS_D>_calendar.sql`

- [ ] **Step 1: Timestamp + Datei**

Run: `date -u +%Y%m%d%H%M%S`. Notiere als TS_D.

- [ ] **Step 2: SQL für Enums + events**

```sql
-- Eltern Flow AI: Calendar (events + recurring + exceptions)
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.3)

drop type if exists public.rrule_freq_enum cascade;
create type public.rrule_freq_enum as enum ('daily','weekly','monthly','yearly');

drop type if exists public.event_exception_action_enum cascade;
create type public.event_exception_action_enum as enum ('cancelled','modified');

drop table if exists public.events cascade;

create table public.events (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  type_id          uuid not null references public.event_types(id) on delete restrict,
  child_id         uuid references public.children(id) on delete set null,

  title            text not null,
  description      text,
  location         text,
  start_at         timestamptz not null,
  end_at           timestamptz not null,
  all_day          boolean not null default false,

  rrule_freq       public.rrule_freq_enum,
  rrule_interval   int not null default 1,
  rrule_byweekday  int[],
  rrule_until      timestamptz,
  rrule_count      int,

  created_by       uuid references public.parents(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint events_end_after_start check (end_at >= start_at),
  constraint events_rrule_count_xor_until check ((rrule_count is null) or (rrule_until is null))
);

create index events_family_start_idx on public.events(family_id, start_at);
create index events_child_id_idx on public.events(child_id) where child_id is not null;

alter table public.events enable row level security;
alter table public.events force row level security;

drop policy if exists "events: select own family" on public.events;
create policy "events: select own family"
  on public.events for select
  to authenticated
  using ( family_id = public.current_family_id() );

drop policy if exists "events: insert own family" on public.events;
create policy "events: insert own family"
  on public.events for insert
  to authenticated
  with check ( family_id = public.current_family_id() );

drop policy if exists "events: update own family" on public.events;
create policy "events: update own family"
  on public.events for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

drop policy if exists "events: delete own family" on public.events;
create policy "events: delete own family"
  on public.events for delete
  to authenticated
  using ( family_id = public.current_family_id() );
```

- [ ] **Step 3: Ausführen via MCP `execute_sql`**

### Task D2: `event_exceptions`

**Files:**

- Modify: `supabase/migrations/<TS_D>_calendar.sql`

- [ ] **Step 1: SQL anhängen**

```sql
drop table if exists public.event_exceptions cascade;

create table public.event_exceptions (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  occurrence_date  date not null,
  action           public.event_exception_action_enum not null,
  override         jsonb,
  created_at       timestamptz not null default now(),

  unique (event_id, occurrence_date)
);

alter table public.event_exceptions enable row level security;
alter table public.event_exceptions force row level security;

drop policy if exists "event_exceptions: select via event" on public.event_exceptions;
create policy "event_exceptions: select via event"
  on public.event_exceptions for select
  to authenticated
  using ( event_id in (select id from public.events where family_id = public.current_family_id()) );

drop policy if exists "event_exceptions: insert via event" on public.event_exceptions;
create policy "event_exceptions: insert via event"
  on public.event_exceptions for insert
  to authenticated
  with check ( event_id in (select id from public.events where family_id = public.current_family_id()) );

drop policy if exists "event_exceptions: update via event" on public.event_exceptions;
create policy "event_exceptions: update via event"
  on public.event_exceptions for update
  to authenticated
  using ( event_id in (select id from public.events where family_id = public.current_family_id()) )
  with check ( event_id in (select id from public.events where family_id = public.current_family_id()) );

drop policy if exists "event_exceptions: delete via event" on public.event_exceptions;
create policy "event_exceptions: delete via event"
  on public.event_exceptions for delete
  to authenticated
  using ( event_id in (select id from public.events where family_id = public.current_family_id()) );
```

- [ ] **Step 2: Ausführen via MCP `execute_sql`**

- [ ] **Step 3: Verifizieren via MCP `get_advisors security`** — keine Findings auf events/event_exceptions.

### Task D3: Section D commit

- [ ] **Step 1: Commit**

```bash
git add supabase/migrations/<TS_D>_calendar.sql
git commit -m "$(cat <<'EOF'
feat(db): events + event_exceptions with RRULE + RLS

Single + recurring events in one table via rrule_* columns (iCal-style).
event_exceptions overlay handles cancelled/modified single occurrences.
Spec Section 4.3.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Section E — Tasks

### Task E1: Migration + `tasks` Tabelle

**Files:**

- Create: `supabase/migrations/<TS_E>_tasks.sql`

- [ ] **Step 1: Timestamp + Datei**

Run: `date -u +%Y%m%d%H%M%S`. Notiere als TS_E.

- [ ] **Step 2: SQL schreiben + ausführen via MCP `execute_sql`**

```sql
-- Eltern Flow AI: Tasks (deadline-based, no time slot, no recurrence)
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.4)

drop table if exists public.tasks cascade;

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  type_id       uuid not null references public.task_types(id) on delete restrict,
  child_id      uuid references public.children(id) on delete set null,

  title         text not null,
  description   text,
  subject       text,
  due_date      date not null,
  due_time      time,

  is_done       boolean not null default false,
  completed_at  timestamptz,
  completed_by  uuid references public.parents(id) on delete set null,

  created_by    uuid references public.parents(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint tasks_completed_consistency check ((is_done = false) or (completed_at is not null))
);

create index tasks_family_due_idx on public.tasks(family_id, due_date) where is_done = false;
create index tasks_child_id_idx on public.tasks(child_id) where child_id is not null;

alter table public.tasks enable row level security;
alter table public.tasks force row level security;

drop policy if exists "tasks: select own family" on public.tasks;
create policy "tasks: select own family"
  on public.tasks for select
  to authenticated
  using ( family_id = public.current_family_id() );

drop policy if exists "tasks: insert own family" on public.tasks;
create policy "tasks: insert own family"
  on public.tasks for insert
  to authenticated
  with check ( family_id = public.current_family_id() );

drop policy if exists "tasks: update own family" on public.tasks;
create policy "tasks: update own family"
  on public.tasks for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

drop policy if exists "tasks: delete own family" on public.tasks;
create policy "tasks: delete own family"
  on public.tasks for delete
  to authenticated
  using ( family_id = public.current_family_id() );
```

- [ ] **Step 3: Verifizieren via MCP `list_tables verbose=true`**

### Task E2: Section E commit

- [ ] **Step 1: Commit**

```bash
git add supabase/migrations/<TS_E>_tasks.sql
git commit -m "$(cat <<'EOF'
feat(db): tasks table (deadline-based) with RLS

No recurrence (recurring tasks belong as all-day events). subject column
dedicated for homework (Mathe/Deutsch/...). completed_consistency CHECK
guards the is_done/completed_at invariant. Spec Section 4.4.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Section F — Reminders + Trigger

### Task F1: `reminders` + Trigger + RLS

**Files:**

- Create: `supabase/migrations/<TS_F>_reminders.sql`

- [ ] **Step 1: Timestamp + Datei**

Run: `date -u +%Y%m%d%H%M%S`. Notiere als TS_F.

- [ ] **Step 2: SQL für Tabelle + Trigger + RLS**

```sql
-- Eltern Flow AI: Reminders (n:1 to events/tasks, denormalized family_id for RLS perf)
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.5)

drop table if exists public.reminders cascade;

create table public.reminders (
  id                    uuid primary key default gen_random_uuid(),
  family_id             uuid not null references public.families(id) on delete cascade,
  event_id              uuid references public.events(id) on delete cascade,
  task_id               uuid references public.tasks(id) on delete cascade,
  offset_minutes        int not null,
  recipient_parent_id   uuid references public.parents(id) on delete cascade,
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),

  constraint reminders_event_xor_task check ((event_id is not null) <> (task_id is not null))
);

create index reminders_pending_idx on public.reminders(family_id) where sent_at is null;

-- Denormalize family_id from event/task on insert
drop function if exists public.set_reminder_family_id() cascade;

create function public.set_reminder_family_id() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.event_id is not null then
    select family_id into new.family_id from public.events where id = new.event_id;
  else
    select family_id into new.family_id from public.tasks where id = new.task_id;
  end if;
  return new;
end;
$$;

drop trigger if exists reminders_set_family_id on public.reminders;
create trigger reminders_set_family_id before insert on public.reminders
  for each row execute function public.set_reminder_family_id();

alter table public.reminders enable row level security;
alter table public.reminders force row level security;

drop policy if exists "reminders: select own family" on public.reminders;
create policy "reminders: select own family"
  on public.reminders for select
  to authenticated
  using ( family_id = public.current_family_id() );

drop policy if exists "reminders: insert own family" on public.reminders;
create policy "reminders: insert own family"
  on public.reminders for insert
  to authenticated
  with check (
    -- family_id wird via Trigger gesetzt, aber WITH CHECK schaut auf den NEW.family_id NACH dem Trigger.
    -- Fallback: prüfe via event/task explizit damit RLS auch ohne family_id im Client-Insert greift.
    (event_id is not null and event_id in (select id from public.events where family_id = public.current_family_id()))
    or
    (task_id is not null and task_id in (select id from public.tasks where family_id = public.current_family_id()))
  );

drop policy if exists "reminders: update own family" on public.reminders;
create policy "reminders: update own family"
  on public.reminders for update
  to authenticated
  using ( family_id = public.current_family_id() )
  with check ( family_id = public.current_family_id() );

drop policy if exists "reminders: delete own family" on public.reminders;
create policy "reminders: delete own family"
  on public.reminders for delete
  to authenticated
  using ( family_id = public.current_family_id() );
```

- [ ] **Step 3: Ausführen via MCP `execute_sql`**

- [ ] **Step 4: Verifizieren via MCP `get_advisors security`** — keine RLS-Findings.

### Task F2: Section F commit

- [ ] **Step 1: Commit**

```bash
git add supabase/migrations/<TS_F>_reminders.sql
git commit -m "$(cat <<'EOF'
feat(db): reminders table with XOR-bound event/task + denormalized family_id trigger

BEFORE INSERT trigger populates family_id from the referenced event/task.
INSERT policy double-checks via subquery so client can omit family_id.
Index on pending reminders for the future cron-worker pickup.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Section G — Recipes (global pool) + Meal Plan

### Task G1: `recipes` Tabelle + Indizes + RLS

**Files:**

- Create: `supabase/migrations/<TS_G>_recipes_and_meal_plan.sql`

- [ ] **Step 1: Timestamp + Datei**

Run: `date -u +%Y%m%d%H%M%S`. Notiere als TS_G.

- [ ] **Step 2: SQL für recipes**

```sql
-- Eltern Flow AI: Recipes (global pool) + meal plan
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.6, 4.7, 5)

drop type if exists public.recipe_source_enum cascade;
create type public.recipe_source_enum as enum ('gustar_generated','gustar_searched','gustar_crawled','user_custom');

drop type if exists public.meal_slot_enum cascade;
create type public.meal_slot_enum as enum ('breakfast','lunch','dinner','snack');

drop table if exists public.recipes cascade;

create table public.recipes (
  id                       uuid primary key default gen_random_uuid(),
  source                   public.recipe_source_enum not null,
  source_external_id       text,
  source_url               text,
  created_by_family_id     uuid references public.families(id) on delete cascade,

  title                    jsonb not null,
  description              jsonb,
  image_url                text,
  duration_min             int,
  servings                 int,
  difficulty               text,

  ingredients              jsonb not null,
  instructions             jsonb not null,

  diet_tags                text[] not null default '{}',
  contains_allergens       text[] not null default '{}',
  keywords                 text[] not null default '{}',

  recipe_dedup_hash        text not null,
  fetched_at               timestamptz not null default now(),
  created_at               timestamptz not null default now()
);

create unique index recipes_dedup_hash_idx on public.recipes(recipe_dedup_hash);
create unique index recipes_source_external_idx
  on public.recipes(source, source_external_id)
  where source_external_id is not null;
create index recipes_contains_allergens_gin on public.recipes using gin (contains_allergens);
create index recipes_diet_tags_gin on public.recipes using gin (diet_tags);
create index recipes_keywords_gin on public.recipes using gin (keywords);

alter table public.recipes enable row level security;
alter table public.recipes force row level security;

drop policy if exists "recipes: select global or own private" on public.recipes;
create policy "recipes: select global or own private"
  on public.recipes for select
  to authenticated
  using ( created_by_family_id is null or created_by_family_id = public.current_family_id() );

drop policy if exists "recipes: insert authenticated" on public.recipes;
create policy "recipes: insert authenticated"
  on public.recipes for insert
  to authenticated
  with check ( (select auth.uid()) is not null );

drop policy if exists "recipes: update own private" on public.recipes;
create policy "recipes: update own private"
  on public.recipes for update
  to authenticated
  using ( created_by_family_id = public.current_family_id() )
  with check ( created_by_family_id = public.current_family_id() );

drop policy if exists "recipes: delete own private" on public.recipes;
create policy "recipes: delete own private"
  on public.recipes for delete
  to authenticated
  using ( created_by_family_id = public.current_family_id() );
```

- [ ] **Step 3: Ausführen via MCP `execute_sql`**

### Task G2: `meal_plan_entries`

**Files:**

- Modify: `supabase/migrations/<TS_G>_recipes_and_meal_plan.sql`

- [ ] **Step 1: SQL anhängen**

```sql
drop table if exists public.meal_plan_entries cascade;

create table public.meal_plan_entries (
  id                  uuid primary key default gen_random_uuid(),
  family_id           uuid not null references public.families(id) on delete cascade,
  date                date not null,
  meal_slot           public.meal_slot_enum not null,
  recipe_id           uuid not null references public.recipes(id) on delete restrict,
  servings_override   int,
  notes               text,
  created_by          uuid references public.parents(id) on delete set null,
  created_at          timestamptz not null default now(),

  unique (family_id, date, meal_slot)
);

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
```

- [ ] **Step 2: Ausführen via MCP `execute_sql`**

- [ ] **Step 3: Verifizieren via MCP `get_advisors security`** und `get_advisors performance` — keine kritischen Findings.

### Task G3: Section G commit

- [ ] **Step 1: Commit**

```bash
git add supabase/migrations/<TS_G>_recipes_and_meal_plan.sql
git commit -m "$(cat <<'EOF'
feat(db): recipes global pool + meal_plan_entries with multi-slot support

recipes ist globaler Pool (created_by_family_id NULL=global, sonst privat).
Dedup via recipe_dedup_hash UNIQUE. Allergen-Filter via contains_allergens
text[] mit GIN-Index. meal_plan_entries multi-slot pro Tag (breakfast/
lunch/dinner/snack). RLS Section 4.6, 4.7, 6.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Section H — Finalization (TypeScript Types, Advisors, ADR)

### Task H1: Komplette Advisor-Sweep

- [ ] **Step 1: Security Advisor**

Tool: `mcp__supabase__get_advisors` mit `type="security"`
Expected: `result.lints = []` (oder nur Findings die wir bewusst akzeptieren — dokumentieren falls ja).

- [ ] **Step 2: Performance Advisor**

Tool: `mcp__supabase__get_advisors` mit `type="performance"`
Expected: keine "missing index on foreign key"-Warnings für die Spec-relevanten Tabellen.

- [ ] **Step 3: Tabellen-Übersicht**

Tool: `mcp__supabase__list_tables` mit `schemas=["public"]`, `verbose=true`
Expected: exakt 12 Tabellen: families, parents, children, family_invitations, event_types, task_types, events, event_exceptions, tasks, reminders, recipes, meal_plan_entries.

> Die Spec spricht von "11 Tabellen" — `family_invitations` ist die Onboarding-Helper-Tabelle aus Section 6, die nicht in der Kern-Aufzählung mitgezählt wurde. Macht 12 physische Tabellen.

- [ ] **Step 4: Falls Findings → fixen**

Findings auflisten, prüfen ob "false positive" oder echter Fehler. Echte Fehler: zusätzliche Migration-Datei mit Fix anlegen, ausführen, committen.

### Task H2: TypeScript-Types generieren

**Files:**

- Create: `features/supabase/database.types.ts`

- [ ] **Step 1: Types via MCP generieren**

Tool: `mcp__supabase__generate_typescript_types`
Output: TypeScript-Definitionen für die DB.

- [ ] **Step 2: In Datei schreiben**

Schreibe den output nach `features/supabase/database.types.ts`. Schreibe als header-comment:

```ts
// Generated by mcp__supabase__generate_typescript_types
// DO NOT EDIT — re-generate via MCP after schema migrations.
// Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md
```

- [ ] **Step 3: Client typisieren — `features/supabase/client.ts` anpassen**

Modify: `features/supabase/client.ts`

Alter import-block:

```ts
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
```

ersetzen durch:

```ts
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
```

Und die `createClient`-Zeile:

```ts
export const supabase = createClient(url, publishableKey, {
```

ersetzen durch:

```ts
export const supabase = createClient<Database>(url, publishableKey, {
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: kein Fehler.

- [ ] **Step 5: Lint**

Run: `bun lint`
Expected: 0 Errors (vorhandene 2 Warnings akzeptabel da pre-existing).

- [ ] **Step 6: Commit**

```bash
git add features/supabase/database.types.ts features/supabase/client.ts
git commit -m "$(cat <<'EOF'
feat(supabase): generate TypeScript types + thread Database generic into client

Types generiert via MCP generate_typescript_types nach komplettem Schema-Aufbau.
Client jetzt mit createClient<Database>() für type-safe queries. Re-generieren
nach jedem Schema-Change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task H3: ADR-004 anhängen + CLAUDE.md updaten

**Files:**

- Modify: `docs/decision-log.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: ADR-004 an decision-log.md anhängen**

Append ans Ende der Datei:

```markdown
## ADR-004 — DB-Schema für Family-Organizer (2026-05-29)

### Status

Accepted. Implementiert die Spec [docs/superpowers/specs/2026-05-29-supabase-schema-design.md](superpowers/specs/2026-05-29-supabase-schema-design.md).

### Context

Vor diesem ADR war das Supabase-Projekt leer (nur Auth + Client-Verdrahtung aus ADR-003). Auth-Flow, Login-Screen, oder irgendein Datenpfad waren blockiert bis das Kern-Schema steht. Brainstorming-Session hat die Architektur festgelegt; dieser ADR fasst die finalen Entscheidungen zusammen.

### Decisions (Kurzfassung — Details in der Spec)

1. **Login = pro Elternteil ein Auth-Account**, beide Eltern → gleiche `family_id`.
2. **Recurring Events via RRULE-Pattern** (eine Row, Vorkommen zur Laufzeit berechnet), Ausnahmen via `event_exceptions`.
3. **Events vs Tasks getrennt** — Events haben Zeit-Slot, Tasks nur Deadline.
4. **Lookup-Tabellen für Types** mit System-Defaults (`family_id IS NULL`) + Family-Custom.
5. **Reminders als eigene Tabelle** (n:1 zu events/tasks, mehrere Reminders pro Event möglich).
6. **Recipes als globaler Pool** mit `contains_allergens text[]` als source-of-truth für Filter (NICHT `diet_tags`).
7. **Dedup über Hash** (lower(title) + sorted(ingredients)).
8. **i18n via JSONB** für übersetzbare Felder — skalierbar ohne Schema-Migration.
9. **Allergien/Vorlieben** auf parents UND children dupliziert (pragmatisch statt Inheritance-Hierarchie).
10. **Mehrere Meal-Slots pro Tag** (breakfast/lunch/dinner/snack).
11. **RLS via `current_family_id()` Helper-Function**, `SECURITY DEFINER` RPCs nur für Onboarding (`create_family`, `accept_invitation`).

### Consequences

- 12 Tabellen + 2 RPCs + 1 Trigger; alle RLS-protected.
- TypeScript-Types generiert in `features/supabase/database.types.ts`; Client typisiert mit `createClient<Database>()`.
- Folge-Specs benötigt für: Auth-Flow (Login/Onboarding-Screens), gustar.io Edge Function (Cache-Hit + Allergen-Klassifizierung), Push-Notification-Pipeline (pg_cron + Expo Push).

### Out of Scope (für spätere ADRs)

- Realtime-Subscriptions, Cross-Family-Sharing, Soft-Delete, Storage-Bucket für Profilfotos.
```

- [ ] **Step 2: CLAUDE.md Tech-Stack-Eintrag aktualisieren**

In CLAUDE.md den Supabase-Eintrag im Tech-Stack-Block finden und das "Auth-Flow, Schema, RLS, Realtime sind die nächsten Iterationen." abändern zu:

```
- **Supabase JS Client** (`@supabase/supabase-js` + AsyncStorage session) via [features/supabase/](features/supabase/). MCP via Supabases hosted HTTP-Server (`mcp.supabase.com`, project-scoped, OAuth) — Konfig in `.mcp.json`. App-ENV in `.env.local` (siehe `.env.example`). Schema mit RLS-Policies in `supabase/migrations/`, TypeScript-Types in `features/supabase/database.types.ts` (generiert). Auth-Flow + Edge Functions sind die nächsten Iterationen.
```

Und die "Deferred"-Zeile entsprechend:

Alt:

```
Deferred to later iterations (not yet wired): Supabase-Schema + RLS-Policies + Auth-Flow + Realtime + Edge Functions, Edamam API, Stripe, real STT + LLM, Expo Notifications.
```

Neu:

```
Deferred to later iterations (not yet wired): Auth-Flow + Realtime + Edge Functions, gustar.io Worker, Stripe, real STT + LLM, Expo Notifications.
```

(Edamam ist raus — wir nutzen gustar.io aus dem Schema.)

- [ ] **Step 3: Commit Doku**

```bash
git add docs/decision-log.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: ADR-004 + CLAUDE.md update für DB-Schema

ADR-004 fasst die Brainstorming-Entscheidungen zusammen (12 Tabellen,
2 RPCs, RLS via current_family_id, gustar.io statt Edamam, globaler
Recipe-Pool mit contains_allergens-Filter).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Verification — Final End-to-End

Nach allen Sections müssen die folgenden Checks grün sein:

1. ✅ MCP `list_tables verbose=true` → exakt 12 Tabellen in `public`.
2. ✅ MCP `get_advisors security` → `lints = []`.
3. ✅ MCP `get_advisors performance` → keine "missing FK index"-Warnings.
4. ✅ Seed-Daten: `select count(*) from public.event_types where family_id is null` → 5. `task_types` → 3.
5. ✅ RLS-Smoke (manuell aus Task A7 wiederholbar) → zwei Fake-Familien sehen sich nicht gegenseitig.
6. ✅ `bun run typecheck` → grün mit `features/supabase/database.types.ts`.
7. ✅ `bun lint` → 0 Errors.
8. ✅ Git log zeigt 8 saubere Commits in der erwarteten Reihenfolge (Section A bis H).
9. ✅ Alle Migrations in `supabase/migrations/` sind idempotent (Re-Run produziert keine Fehler).

---

## Was dieser Plan NICHT abdeckt (eigene Pläne nötig)

- **Auth-Flow Implementation** (Login/Signup-Screens, react-i18next-Integration für Auth-Texte, Session-Hook für Expo Router).
- **gustar.io Edge Function** (Cache-Hit-Logik, Allergen-Klassifizierung per LLM, Image-Generation-Worker).
- **Push-Notification-Pipeline** (pg_cron job, Expo Push Service, Token-Management auf parents).
- **Onboarding-Screen-Implementation** (gemäß patterns/onboarding.md, mit RPCs `create_family` + `accept_invitation`).
- **Realtime-Subscriptions** (wenn beide Eltern gleichzeitig nutzen sollen).
- **Family-Settings UI** (`families.settings jsonb` Pflege).
