-- UNAPPLIED. Needs review before running.
--
-- Invite a collector: who invited whom, and the follow-each-other on signup.
--
-- public.invites
--   One row per invited account (invitee_id is unique), so each person is
--   credited once. RLS is on. A user can read the rows where they are the
--   inviter or the invitee. There are no insert, update or delete policies:
--   clients never write rows. Only public.accept_invite does.
--
-- public.accept_invite(inviter_username text) returns void
--   Called once by a newly signed-up user who arrived through /i/<username>.
--   auth.uid() is the invitee; the inviter is looked up by username. It
--   writes the invites row and both follows rows (invitee -> inviter and
--   inviter -> invitee), on conflict do nothing. It does nothing, silently,
--   when:
--     - there is no signed-in user, or the username matches no profile;
--     - inviter = invitee;
--     - either has blocked the other (public.blocks, both directions);
--     - the inviter is a test or QA profile (is_test, or a qa_/qa-/test_/
--       vreset_ handle, the same rule as private.follow_official_updates);
--     - the invitee already accepted an invite (the unique invitee_id).
--   Calling it again is a no-op, so it is idempotent.
--
-- SECURITY REVIEW: security definer, because the inviter -> invitee follow is
-- written on the inviter's behalf and the "Follow as yourself" policy would
-- refuse it. search_path is empty; every name is schema-qualified. Execute is
-- revoked from public and anon and granted to authenticated only.
--
-- public.profiles is not touched: no grant, RLS or column changes.

begin;

set local lock_timeout = '5s';

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (inviter_id <> invitee_id)
);

comment on table public.invites is
  'Who invited whom through /i/<username>. Written only by public.accept_invite.';

create index if not exists invites_inviter_id_idx on public.invites (inviter_id);

alter table public.invites enable row level security;

drop policy if exists "Read own invites" on public.invites;
create policy "Read own invites"
  on public.invites
  for select
  to authenticated
  using ((select auth.uid()) = inviter_id or (select auth.uid()) = invitee_id);

revoke all on public.invites from public, anon, authenticated;
grant select on public.invites to authenticated;

create or replace function public.accept_invite(inviter_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitee pg_catalog.uuid := auth.uid();
  inviter pg_catalog.uuid;
  inviter_handle pg_catalog.text;
  inviter_test pg_catalog.bool;
  credited pg_catalog.uuid;
begin
  if invitee is null or inviter_username is null then
    return;
  end if;

  select p.id, p.username, p.is_test
    into inviter, inviter_handle, inviter_test
  from public.profiles as p
  where p.username = pg_catalog.lower(pg_catalog.btrim(inviter_username))
  limit 1;

  if inviter is null or inviter = invitee then
    return;
  end if;

  if inviter_test is true
     or pg_catalog.lower(inviter_handle) ~ '^(qa_|qa-|test_|vreset_)' then
    return;
  end if;

  if exists (
    select 1
    from public.blocks as b
    where (b.blocker_id = invitee and b.blocked_id = inviter)
       or (b.blocker_id = inviter and b.blocked_id = invitee)
  ) then
    return;
  end if;

  if not exists (select 1 from public.profiles as p where p.id = invitee) then
    return;
  end if;

  insert into public.invites (inviter_id, invitee_id)
  values (inviter, invitee)
  on conflict (invitee_id) do nothing
  returning id into credited;

  -- Already credited to someone: nothing else changes.
  if credited is null then
    return;
  end if;

  insert into public.follows (follower_id, following_id)
  values (invitee, inviter), (inviter, invitee)
  on conflict (follower_id, following_id) do nothing;
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

commit;
