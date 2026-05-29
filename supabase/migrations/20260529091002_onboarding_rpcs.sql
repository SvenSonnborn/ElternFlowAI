-- Eltern Flow AI: Onboarding RPCs + family invitations
-- Spec: docs/superpowers/specs/2026-05-29-supabase-schema-design.md (Section 6)

-- ============================================================
-- Task B1: family_invitations table
-- ============================================================

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

-- ============================================================
-- Task B2: RPC create_family
-- ============================================================

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
revoke execute on function public.create_family(text, text, text, text) from anon;
grant execute on function public.create_family(text, text, text, text) to authenticated;

comment on function public.create_family is 'Onboarding entry point: creates a new family and adds the calling user as the first parent. Idempotent guard: raises if user already has a parent row.';

-- ============================================================
-- Task B3: RPC accept_invitation
-- ============================================================

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
revoke execute on function public.accept_invitation(uuid, text, text, text) from anon;
grant execute on function public.accept_invitation(uuid, text, text, text) to authenticated;

comment on function public.accept_invitation is 'Partner onboarding: validates invitation token, creates parent row in the existing family, marks token as used. Atomic — token is locked with FOR UPDATE.';
