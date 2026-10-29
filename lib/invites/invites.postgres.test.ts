import { join } from "node:path";
import { after, describe, it } from "node:test";
import { startPostgres } from "@/lib/test/postgres";

const setupSql = `
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create table auth.users (
  id uuid primary key,
  created_at timestamptz not null default now()
);

create role anon nologin;
create role authenticated nologin;

create table public.profiles (
  id uuid primary key,
  username text not null unique,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Profiles are public" on public.profiles for select using (true);
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
alter table public.follows enable row level security;
create policy "Follows are public" on public.follows for select using (true);
create policy "Follow as yourself" on public.follows for insert with check (auth.uid() = follower_id);
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;

create table public.blocks (
  blocker_id uuid not null,
  blocked_id uuid not null,
  primary key (blocker_id, blocked_id)
);
`;

const ADA = "11111111-1111-1111-1111-111111111111";
const BEN = "22222222-2222-2222-2222-222222222222";
const CAL = "33333333-3333-3333-3333-333333333333";
const QA = "44444444-4444-4444-4444-444444444444";
const DEE = "55555555-5555-5555-5555-555555555555";
const EVE = "66666666-6666-6666-6666-666666666666";
const OLD = "77777777-7777-7777-7777-777777777777";
const TST = "88888888-8888-8888-8888-888888888888";
const GUS = "99999999-9999-9999-9999-999999999999";
const PAST = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const FAY = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const HAL = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const QAN = "dddddddd-dddd-dddd-dddd-dddddddddddd";
// Fresh accounts that all accept Gus's invite, for the 25 a day cap.
const fresh = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const seedSql = `
insert into public.profiles (id, username, is_test) values
  ('${ADA}', 'ada', false),
  ('${BEN}', 'ben', false),
  ('${CAL}', 'cal', false),
  ('${QA}', 'qa_guard_1', false),
  ('${DEE}', 'dee', false),
  ('${EVE}', 'eve', true);
insert into public.profiles (id, username, is_test) values
  ('${FAY}', 'fay', false),
  ('${HAL}', 'hal', false),
  ('${QAN}', 'qa_newbie', false);
-- Old Timer signed up two days ago, then edited profiles.created_at to now.
insert into public.profiles (id, username, is_test, created_at) values
  ('${OLD}', 'old_timer', false, now()),
  ('${TST}', 'tester', true, now()),
  ('${GUS}', 'gus', false, now() - interval '30 days'),
  ('${PAST}', 'past', false, now() - interval '3 days');
insert into public.profiles (id, username)
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'fresh_' || n
  from generate_series(1, 26) as n;
-- The real signup time, which users can't edit.
insert into auth.users (id, created_at)
  select id, created_at from public.profiles where id <> '${OLD}';
insert into auth.users (id, created_at) values ('${OLD}', now() - interval '2 days');
insert into public.blocks (blocker_id, blocked_id) values ('${ADA}', '${DEE}');
-- An invite from two days ago doesn't count toward Gus's daily cap.
insert into public.invites (inviter_id, invitee_id, created_at)
  values ('${GUS}', '${PAST}', now() - interval '2 days');
`;

const behaviorSql = `
-- Clients can't write or read others' rows, and anon can't call the RPC.
set role anon;
do $$
begin
  begin
    perform public.accept_invite('ada');
    raise exception 'anon called accept_invite';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.my_invite_code();
    raise exception 'anon called my_invite_code';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.invites;
    raise exception 'anon read invites';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.invite_codes;
    raise exception 'anon read invite codes';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;

set role authenticated;

-- Each user gets one random code, the same every time.
select set_config('app.user_id', '${ADA}', false);
select set_config('test.ada_code', public.my_invite_code(), false);
select set_config('app.user_id', '${CAL}', false);
select set_config('test.cal_code', public.my_invite_code(), false);
select set_config('app.user_id', '${GUS}', false);
select set_config('test.gus_code', public.my_invite_code(), false);
select set_config('app.user_id', '${ADA}', false);
do $$
begin
  if current_setting('test.ada_code') !~ '^[0-9a-f]{32}$' then
    raise exception 'invite code is not 32 hex characters';
  end if;
  if public.my_invite_code() <> current_setting('test.ada_code') then
    raise exception 'invite code changed';
  end if;
  if current_setting('test.ada_code') = current_setting('test.cal_code') then
    raise exception 'two users share a code';
  end if;
end
$$;

-- Users read only their own code, and can't write codes.
select set_config('app.user_id', '${CAL}', false);
do $$
begin
  if (select count(*) from public.invite_codes) <> 1
     or exists (select 1 from public.invite_codes where user_id <> '${CAL}') then
    raise exception 'a user read someone else''s invite code';
  end if;
  begin
    insert into public.invite_codes (user_id, invite_code) values ('${BEN}', 'mine');
    raise exception 'a client inserted an invite code';
  exception
    when insufficient_privilege then null;
  end;
  begin
    update public.invite_codes set invite_code = 'mine';
    raise exception 'a client changed an invite code';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

-- Ben accepts Ada's invite with her code: two follows and one invites row.
select set_config('app.user_id', '${BEN}', false);
do $$
begin
  if public.accept_invite('  Ada ', current_setting('test.ada_code')) is distinct from 'mutual' then
    raise exception 'a real invite link should say mutual';
  end if;
  if (select count(*) from public.follows where follower_id = '${BEN}' and following_id = '${ADA}') <> 1 then
    raise exception 'invitee does not follow inviter';
  end if;
  if (select count(*) from public.follows where follower_id = '${ADA}' and following_id = '${BEN}') <> 1 then
    raise exception 'inviter does not follow invitee back';
  end if;
  if (select count(*) from public.invites where invitee_id = '${BEN}' and inviter_id = '${ADA}') <> 1 then
    raise exception 'invite row missing for the invitee';
  end if;
end
$$;

-- Idempotent, and a second inviter is never credited.
select public.accept_invite('ada', current_setting('test.ada_code'));
select public.accept_invite('cal', current_setting('test.cal_code'));
do $$
begin
  if (select count(*) from public.invites where invitee_id = '${BEN}') <> 1 then
    raise exception 'invitee credited twice';
  end if;
  if exists (select 1 from public.follows where follower_id = '${BEN}' and following_id = '${CAL}') then
    raise exception 'a second invite still made follows';
  end if;
end
$$;

-- Clients have no write policy.
do $$
begin
  begin
    insert into public.invites (inviter_id, invitee_id) values ('${CAL}', '${BEN}');
    raise exception 'a client inserted an invite';
  exception
    when insufficient_privilege then null;
  end;
  begin
    delete from public.invites;
    raise exception 'a client deleted invites';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

-- Cal can't see Ada and Ben's invite.
select set_config('app.user_id', '${CAL}', false);
do $$
begin
  if (select count(*) from public.invites) <> 0 then
    raise exception 'a stranger read someone else''s invite';
  end if;
end
$$;

-- Skips: self, unknown, QA inviter, is_test inviter, a block either way.
select public.accept_invite('cal', current_setting('test.cal_code'));
select public.accept_invite('nobody_here');
select public.accept_invite('qa_guard_1');
select public.accept_invite('eve');
do $$
begin
  if (select count(*) from public.invites where invitee_id = '${CAL}') <> 0 then
    raise exception 'a skipped invite was credited';
  end if;
  if exists (select 1 from public.follows where follower_id = '${CAL}' or following_id = '${CAL}') then
    raise exception 'a skipped invite made follows';
  end if;
end
$$;

select set_config('app.user_id', '${DEE}', false);
select public.accept_invite('ada', current_setting('test.ada_code'));
do $$
begin
  if exists (select 1 from public.invites where invitee_id = '${DEE}') then
    raise exception 'a blocked pair was credited';
  end if;
  if exists (select 1 from public.follows where follower_id = '${DEE}' or following_id = '${DEE}') then
    raise exception 'a blocked pair follows each other';
  end if;
end
$$;

-- A wrong code (here Cal's) or no code: the new account follows Ada, with
-- no follow-back and no invites row.
select set_config('app.user_id', '${FAY}', false);
do $$
begin
  if public.accept_invite('ada', current_setting('test.cal_code')) is distinct from 'following' then
    raise exception 'a wrong code should say following';
  end if;
end
$$;
select set_config('app.user_id', '${HAL}', false);
do $$
begin
  if public.accept_invite('ada') is distinct from 'following' then
    raise exception 'a missing code should say following';
  end if;
end
$$;
do $$
begin
  if (select count(*) from public.follows where following_id = '${ADA}' and follower_id in ('${FAY}', '${HAL}')) <> 2 then
    raise exception 'without a code the new account should still follow the inviter';
  end if;
  if exists (select 1 from public.follows where follower_id = '${ADA}' and following_id in ('${FAY}', '${HAL}')) then
    raise exception 'a wrong or missing code got a follow-back';
  end if;
  if exists (select 1 from public.invites where invitee_id in ('${FAY}', '${HAL}')) then
    raise exception 'a wrong or missing code was credited';
  end if;
end
$$;

-- An account that signed up over 24 hours ago can't accept, even with the
-- right code and an edited profiles.created_at, so it can't farm follow-backs.
select set_config('app.user_id', '${OLD}', false);
do $$
begin
  if public.accept_invite('ada', current_setting('test.ada_code')) is not null then
    raise exception 'an old account was not skipped';
  end if;
  if exists (select 1 from public.invites where invitee_id = '${OLD}') then
    raise exception 'an old account was credited';
  end if;
  if exists (select 1 from public.follows where follower_id = '${OLD}' or following_id = '${OLD}') then
    raise exception 'an old account made follows';
  end if;
end
$$;

-- Brand-new test or QA accounts can't accept either.
select set_config('app.user_id', '${TST}', false);
select public.accept_invite('ada', current_setting('test.ada_code'));
select set_config('app.user_id', '${QAN}', false);
select public.accept_invite('ada', current_setting('test.ada_code'));
do $$
begin
  if exists (select 1 from public.follows where follower_id in ('${TST}', '${QAN}') or following_id in ('${TST}', '${QAN}')) then
    raise exception 'a test or QA account made follows';
  end if;
end
$$;

-- 25 a day: the first 25 new accounts follow Gus and he follows back; the
-- 26th still follows Gus but gets no follow-back.
do $$
begin
  for n in 1..26 loop
    perform set_config('app.user_id', '00000000-0000-0000-0000-' || lpad(n::text, 12, '0'), false);
    perform public.accept_invite('gus', current_setting('test.gus_code'));
  end loop;
end
$$;
select set_config('app.user_id', '${GUS}', false);
do $$
begin
  if (select count(*) from public.follows where following_id = '${GUS}') <> 26 then
    raise exception 'every new account should follow the inviter';
  end if;
  if (select count(*) from public.follows where follower_id = '${GUS}') <> 25 then
    raise exception 'the inviter should follow back exactly 25 in a day';
  end if;
  if exists (select 1 from public.follows where follower_id = '${GUS}' and following_id = '${fresh(26)}') then
    raise exception 'the 26th invitee got a follow-back';
  end if;
  if (select count(*) from public.invites where inviter_id = '${GUS}') <> 27 then
    raise exception 'capped invites should still be credited';
  end if;
end
$$;

-- The inviter sees their row.
select set_config('app.user_id', '${ADA}', false);
do $$
begin
  if (select count(*) from public.invites) <> 1 then
    raise exception 'inviter cannot read their invite';
  end if;
end
$$;
reset role;
`;

const INVITES = "supabase/migrations/20261029180000_invites.sql";

describe("invites migration", () => {
  const stops: Array<() => void> = [];
  after(() => stops.forEach((stop) => stop()));

  it("follows both ways only with the inviter's code, once, for accounts that signed up in the last day; caps follow-backs at 25 a day; skips old, blocked, QA and repeat invites; keeps rows and codes private", { timeout: 120_000 }, async () => {
    const db = await startPostgres("pginvites-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.runFile(join(process.cwd(), INVITES), "migration");
    db.run(seedSql, "seed");
    db.run(behaviorSql, "behavior");
  });
});
