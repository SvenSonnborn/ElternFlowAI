-- Eltern Flow AI: allow several open partner invitations per family.
--
-- 20260611140000 added a partial unique index (one unused invitation per
-- family) because every tap of "Partner einladen" spawned a fresh link. That
-- fixed the duplicate-links symptom, but it also capped a family at one
-- outstanding invitation: accept_invitation stamps used_at, so a token is
-- single-use, and the index meant the next person could not be invited until
-- the previous one had joined. parents itself never had that limit — a family
-- can hold any number of adults — so grandparents or a babysitter had no way
-- in without waiting out the first invite.
--
-- The original duplicate-links problem is solved in the UI instead: every
-- pending invitation is now listed with its own "Erneut teilen" action, so
-- re-sharing no longer has to run through the create path. Creating is an
-- explicit, separate action that means "invite one more person".
--
-- Nothing else guarded the invariant: accept_invitation validates a token on
-- its own merits (unused, unexpired, locked FOR UPDATE) and never assumed the
-- family had only one.
drop index if exists public.family_invitations_one_pending_per_family;

-- A plain DROP, not DROP INDEX CONCURRENTLY: CONCURRENTLY cannot run inside a
-- transaction block, and the migration runner wraps each file in one. The
-- ACCESS EXCLUSIVE lock is on a table that holds a handful of rows per family,
-- so the window it blocks is not a meaningful one.

-- ============================================================
-- regenerate_invitation: rotate one token atomically
-- ============================================================

-- Rotating an invitation is two writes — retire the old token, mint a new one.
-- They belong in one transaction: a client that lost its connection between a
-- successful delete and a failed insert would leave the family one invitation
-- short with nothing to retry against. accept_invitation already sets the
-- precedent that multi-step invitation writes live in an RPC.
create or replace function public.regenerate_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family_id uuid;
  v_new_token uuid;
begin
  -- SECURITY DEFINER bypasses RLS, so the family scope is enforced here
  -- instead — same shape as the "invitations: delete own family" policy.
  select family_id into v_family_id
  from public.family_invitations
  where token = p_token
    and family_id = public.current_family_id()
  for update;

  if not found then
    raise exception 'invitation not found' using errcode = '22023';
  end if;

  delete from public.family_invitations where token = p_token;

  insert into public.family_invitations (family_id)
  values (v_family_id)
  returning token into v_new_token;

  return v_new_token;
end;
$$;

revoke execute on function public.regenerate_invitation(uuid) from public;
revoke execute on function public.regenerate_invitation(uuid) from anon;
grant execute on function public.regenerate_invitation(uuid) to authenticated;

comment on function public.regenerate_invitation is 'Rotates one pending invitation: deletes the given token and returns a fresh one for the same family. Atomic — the old token is locked with FOR UPDATE.';
