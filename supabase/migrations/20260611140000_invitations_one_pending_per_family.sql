-- Eltern Flow AI: enforce at most one pending partner invitation per family.
--
-- Before this, "Partner einladen" inserted a fresh family_invitations row on
-- every tap, leaving multiple live invite links (and multiple "Einladung
-- ausstehend" rows in the UI). The app now reuses an existing pending invite;
-- this index makes the invariant authoritative at the DB level so concurrent
-- inserts can't slip a duplicate through.

-- 1. Collapse existing duplicates: keep the newest unused invite per family,
--    drop the older unused ones (abandoned links nobody accepted).
with ranked as (
  select token,
         row_number() over (partition by family_id order by created_at desc) as rn
  from public.family_invitations
  where used_at is null
)
delete from public.family_invitations
where token in (select token from ranked where rn > 1);

-- 2. Enforce one unused invitation per family. Predicate is immutable
--    (no now()), so expiry is handled in app logic, not the index.
create unique index if not exists family_invitations_one_pending_per_family
  on public.family_invitations (family_id)
  where used_at is null;
