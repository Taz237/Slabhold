-- UNAPPLIED. Needs review before running.
--
-- Invite a collector: who invited whom, and the follow-each-other on signup.
--
-- public.invite_codes
--   One random, unguessable code per user (32 hex characters from
--   gen_random_uuid), made on first use by public.my_invite_code. Invite links
--   carry it: /i/<username>?c=<code>. RLS is on and a user can read only their
--   own row. There are no insert, update or delete policies.
--
-- public.my_invite_code() returns text
--   The signed-in user's code, made if they don't have one yet. Null with no
--   signed-in user or no profile.
--
-- public.invites
--   One row per invited account (invitee_id is unique), so each person is
--   credited once. Only written when the link's code matched the inviter. RLS
--   is on. A user can read the rows where they are the inviter or the invitee.
--   There are no insert, update or delete policies: clients never write rows.
--   Only public.accept_invite does.
--
-- public.accept_invite(inviter_username text, code text default null)
--   returns text: 'mutual', 'following', or null when it did nothing.
--   Called once by a newly signed-up user who arrived through /i/<username>.
--   auth.uid() is the invitee; the inviter is looked up by username.
--   It does nothing, silently (null), when:
--     - there is no signed-in user, or the username matches no profile;
--     - the invitee signed up more than 24 hours ago. This reads
--       auth.users.created_at, never profiles.created_at, which users can
--       edit on their own row;
--     - the invitee is a test or QA profile (is_test, or a qa_/qa-/test_/
--       vreset_ handle, the same rule as private.follow_official_updates);
--     - inviter = invitee, or the inviter is a test or QA profile (same rule);
--     - either has blocked the other (public.blocks, both directions);
--     - the invitee already accepted an invite (the unique invitee_id).
--   Without the inviter's code (missing or wrong), the invitee follows the
--   inviter and that's all: no invites row and no follow-back ('following').
--   With the right code, it writes the invites row and both follows
--   ('mutual'). If the inviter already has 25 or more invites in the last 24
--   hours, the invites row and the invitee -> inviter follow are still
--   written, but there is no follow-back ('following').
--   Every insert is on conflict do nothing, so calling it again is a no-op.
--
-- SECURITY REVIEW: both functions are security definer. accept_invite writes
-- the inviter -> invitee follow on the inviter's behalf (the "Follow as
-- yourself" policy would refuse it) and reads auth.users and invite_codes;
-- my_invite_code inserts the caller's own code row. search_path is empty;
-- every name is schema-qualified. Execute is revoked from public and anon and
-- granted to authenticated only.
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

create table if not exists public.invite_codes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  invite_code text not null unique
    default pg_catalog.replace(pg_catalog.gen_random_uuid()::pg_catalog.text, '-', ''),
  created_at timestamptz not null default now()
);

comment on table public.invite_codes is
  'Each user''s secret invite code for /i/<username>?c=<code>. Made by public.my_invite_code.';

alter table public.invite_codes enable row level security;

drop policy if exists "Read own invite code" on public.invite_codes;
create policy "Read own invite code"
  on public.invite_codes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.invite_codes from public, anon, authenticated;
grant select on public.invite_codes to authenticated;

create or replace function public.my_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me pg_catalog.uuid := auth.uid();
  mine pg_catalog.text;
begin
  if me is null or not exists (select 1 from public.profiles as p where p.id = me) then
    return null;
  end if;

  insert into public.invite_codes (user_id)
  values (me)
  on conflict (user_id) do nothing;

  select c.invite_code into mine
  from public.invite_codes as c
  where c.user_id = me;

  return mine;
end;
$$;

revoke all on function public.my_invite_code() from public, anon;
grant execute on function public.my_invite_code() to authenticated;

create or replace function public.accept_invite(inviter_username text, code text default null)
returns text
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
  capped pg_catalog.bool;
begin
  if invitee is null or inviter_username is null then
    return null;
  end if;

  -- Only a brand-new, non-test account can accept. The signup time comes from
  -- auth.users: users can edit profiles.created_at on their own row.
  if not exists (
    select 1
    from auth.users as u
    join public.profiles as p on p.id = u.id
    where u.id = invitee
      and u.created_at > pg_catalog.now() - interval '24 hours'
      and coalesce(p.is_test, false) = false
      and pg_catalog.lower(p.username) !~ '^(qa_|qa-|test_|vreset_)'
  ) then
    return null;
  end if;

  select p.id, p.username, p.is_test
    into inviter, inviter_handle, inviter_test
  from public.profiles as p
  where p.username = pg_catalog.lower(pg_catalog.btrim(inviter_username))
  limit 1;

  if inviter is null or inviter = invitee then
    return null;
  end if;

  if inviter_test is true
     or pg_catalog.lower(inviter_handle) ~ '^(qa_|qa-|test_|vreset_)' then
    return null;
  end if;

  if exists (
    select 1
    from public.blocks as b
    where (b.blocker_id = invitee and b.blocked_id = inviter)
       or (b.blocker_id = inviter and b.blocked_id = invitee)
  ) then
    return null;
  end if;

  -- Already credited to someone: nothing else changes.
  if exists (select 1 from public.invites as i where i.invitee_id = invitee) then
    return null;
  end if;

  -- No code, or not this inviter's: follow them, but no invite and no
  -- follow-back. Only a real invite link can make someone follow you.
  if accept_invite.code is null or not exists (
    select 1
    from public.invite_codes as c
    where c.user_id = inviter
      and c.invite_code = accept_invite.code
  ) then
    insert into public.follows (follower_id, following_id)
    values (invitee, inviter)
    on conflict (follower_id, following_id) do nothing;
    return 'following';
  end if;

  -- One accept at a time per inviter, so the daily cap below is exact.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('accept_invite:' || inviter::pg_catalog.text, 0)
  );

  select pg_catalog.count(*) >= 25
    into capped
  from public.invites as i
  where i.inviter_id = inviter
    and i.created_at > pg_catalog.now() - interval '24 hours';

  insert into public.invites (inviter_id, invitee_id)
  values (inviter, invitee)
  on conflict (invitee_id) do nothing
  returning id into credited;

  -- Credited by a concurrent call: nothing else changes.
  if credited is null then
    return null;
  end if;

  insert into public.follows (follower_id, following_id)
  values (invitee, inviter)
  on conflict (follower_id, following_id) do nothing;

  -- Over 25 invites in 24 hours: no follow-back.
  if capped then
    return 'following';
  end if;

  insert into public.follows (follower_id, following_id)
  values (inviter, invitee)
  on conflict (follower_id, following_id) do nothing;
  return 'mutual';
end;
$$;

revoke all on function public.accept_invite(text, text) from public, anon;
grant execute on function public.accept_invite(text, text) to authenticated;

commit;
