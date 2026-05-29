-- Eltern Flow AI: Core schema (families, parents, children) + RLS helper
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 4.1, 6)

-- Required extensions (Supabase ships them, ensure they're enabled)
create extension if not exists pgcrypto with schema extensions;  -- gen_random_uuid

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

-- Helper: returns the family_id of the currently authenticated user, or NULL.
-- SECURITY DEFINER is required to avoid infinite RLS recursion: parents has RLS enabled,
-- so a SECURITY INVOKER function reading parents would trigger its own policy evaluation,
-- calling current_family_id() again → stack overflow. SECURITY DEFINER bypasses RLS on
-- parents; the auth.uid() predicate inside ensures only the caller's own row is accessed.
-- STABLE → Postgres caches the result once per query.
drop function if exists public.current_family_id() cascade;

create function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select family_id from public.parents where auth_user_id = (select auth.uid()) limit 1
$$;

comment on function public.current_family_id() is 'Returns the family_id for the currently authenticated user. NULL if no parent row exists (e.g. during onboarding). SECURITY DEFINER to avoid RLS recursion on parents table.';

-- Revoke public/anon execute; grant only to authenticated.
-- The remaining "authenticated SECURITY DEFINER callable" advisor warning is a
-- known false positive for RLS helper functions — revoking authenticated would
-- break all policies that invoke this function.
revoke execute on function public.current_family_id() from public;
revoke execute on function public.current_family_id() from anon;
grant execute on function public.current_family_id() to authenticated;

-- Enable + force RLS on core tables
alter table public.families enable row level security;
alter table public.families force row level security;

alter table public.parents enable row level security;
alter table public.parents force row level security;

alter table public.children enable row level security;
alter table public.children force row level security;

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
