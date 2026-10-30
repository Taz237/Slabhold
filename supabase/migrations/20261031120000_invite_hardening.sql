-- UNAPPLIED. Needs review before running.
--
-- Invite hardening: drop the old accept_invite overload, and let a user get a
-- new invite code.
--
-- 1) public.accept_invite(text) is dropped.
--    #122 first shipped accept_invite(inviter_username text). The later
--    version added `code text default null`, and create or replace with a new
--    argument list makes a second function instead of replacing the first.
--    Where both exist, accept_invite('ada') is ambiguous and the old one still
--    gives a follow-back with no code. Only
--    public.accept_invite(inviter_username text, code text default null)
--    is left. The app always calls it with both arguments
--    (lib/invites/accept.ts). `drop function if exists` is a no-op where the
--    old overload never existed.
--
-- 2) private.invite_code_resets: one row per reset, for the daily limit. No
--    client grants, so only public.reset_invite_code reads or writes it.
--
-- 3) public.reset_invite_code() returns text
--    Gives the signed-in user a new random code and returns it. The old code
--    stops working at once: accept_invite only matches the current code, so a
--    link with the old code just follows the inviter (no invites row, no
--    follow-back). People who already joined keep their follows and invites.
--    - Owner only: it reads auth.uid() and takes no user argument.
--    - Null with no signed-in user or no profile.
--    - At most 3 resets in any 24 hours. The 4th raises
--      'invite_reset_limit' (SQLSTATE P0001). An advisory lock per user keeps
--      the count exact under concurrent calls.
--
-- SECURITY REVIEW: reset_invite_code is security definer (it writes
-- invite_codes, which has no client write policies, and the private resets
-- table). search_path is empty and every name is schema-qualified. Execute is
-- revoked from public and anon and granted to authenticated only.
--
-- public.profiles is not touched.

begin;

set local lock_timeout = '5s';

drop function if exists public.accept_invite(text);

create schema if not exists private;

create table if not exists private.invite_code_resets (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table private.invite_code_resets is
  'One row per invite code reset, for the 3 a day limit in public.reset_invite_code.';

create index if not exists invite_code_resets_user_created_idx
  on private.invite_code_resets (user_id, created_at desc);

alter table private.invite_code_resets enable row level security;
revoke all on private.invite_code_resets from public, anon, authenticated;

create or replace function public.reset_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me pg_catalog.uuid := auth.uid();
  fresh pg_catalog.text := pg_catalog.replace(pg_catalog.gen_random_uuid()::pg_catalog.text, '-', '');
begin
  if me is null or not exists (select 1 from public.profiles as p where p.id = me) then
    return null;
  end if;

  -- One reset at a time per user, so the daily limit below is exact.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reset_invite_code:' || me::pg_catalog.text, 0)
  );

  if (
    select pg_catalog.count(*)
    from private.invite_code_resets as r
    where r.user_id = me
      and r.created_at > pg_catalog.now() - interval '24 hours'
  ) >= 3 then
    raise exception 'invite_reset_limit'
      using errcode = 'P0001',
            hint = 'You can get a new invite link 3 times a day.';
  end if;

  insert into public.invite_codes (user_id, invite_code, created_at)
  values (me, fresh, pg_catalog.now())
  on conflict (user_id) do update
    set invite_code = excluded.invite_code,
        created_at = excluded.created_at;

  insert into private.invite_code_resets (user_id) values (me);

  return fresh;
end;
$$;

comment on function public.reset_invite_code() is
  'Replaces the caller''s invite code and returns the new one. The old code stops working at once. 3 a day.';

revoke all on function public.reset_invite_code() from public, anon;
grant execute on function public.reset_invite_code() to authenticated;

commit;
