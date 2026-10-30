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
grant select on public.follows to anon, authenticated;

create table public.blocks (
  blocker_id uuid not null,
  blocked_id uuid not null,
  primary key (blocker_id, blocked_id)
);
`;

// The 1-argument accept_invite that #122 first shipped, as it may still exist.
const oldOverloadSql = `
create or replace function public.accept_invite(inviter_username text)
returns text
language sql
security definer
set search_path = ''
as $$ select 'mutual'::text $$;
grant execute on function public.accept_invite(text) to authenticated;
`;

const ADA = "11111111-1111-1111-1111-111111111111";
const BEN = "22222222-2222-2222-2222-222222222222";
const CAL = "33333333-3333-3333-3333-333333333333";
const DEE = "44444444-4444-4444-4444-444444444444";

const seedSql = `
insert into public.profiles (id, username) values
  ('${ADA}', 'ada'), ('${BEN}', 'ben'), ('${CAL}', 'cal'), ('${DEE}', 'dee');
insert into auth.users (id) select id from public.profiles;
`;

const behaviorSql = `
-- Only the 2-argument accept_invite is left.
do $$
begin
  if (select count(*) from pg_proc where proname = 'accept_invite' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'accept_invite should have exactly one overload';
  end if;
  if to_regprocedure('public.accept_invite(text, text)') is null then
    raise exception 'accept_invite(text, text) is gone';
  end if;
  if to_regprocedure('public.accept_invite(text)') is not null then
    raise exception 'accept_invite(text) still exists';
  end if;
end
$$;

-- Signed out: no reset, and the resets table is private.
set role anon;
do $$
begin
  begin
    perform public.reset_invite_code();
    raise exception 'anon called reset_invite_code';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;

set role authenticated;
do $$
begin
  begin
    perform 1 from private.invite_code_resets;
    raise exception 'a client read invite_code_resets';
  exception
    when insufficient_privilege then null;
  end;
  if public.reset_invite_code() is not null then
    raise exception 'reset with no signed-in user should do nothing';
  end if;
end
$$;

select set_config('app.user_id', '${ADA}', false);
select set_config('test.old_code', public.my_invite_code(), false);
select set_config('test.new_code', public.reset_invite_code(), false);
do $$
begin
  if current_setting('test.new_code') !~ '^[0-9a-f]{32}$' then
    raise exception 'new code is not 32 hex characters';
  end if;
  if current_setting('test.new_code') = current_setting('test.old_code') then
    raise exception 'the code did not change';
  end if;
  if public.my_invite_code() <> current_setting('test.new_code') then
    raise exception 'my_invite_code should return the new code';
  end if;
end
$$;

-- The old code stops working at once: follow only, no follow-back.
select set_config('app.user_id', '${BEN}', false);
do $$
begin
  if public.accept_invite('ada', current_setting('test.old_code')) is distinct from 'following' then
    raise exception 'the old code still gave a follow-back';
  end if;
  -- One argument resolves to the current function (the old one said 'mutual').
  if public.accept_invite('ada') is distinct from 'following' then
    raise exception 'accept_invite(text) did not resolve to the current function';
  end if;
end
$$;

-- The new code works.
select set_config('app.user_id', '${CAL}', false);
do $$
begin
  if public.accept_invite('ada', current_setting('test.new_code')) is distinct from 'mutual' then
    raise exception 'the new code should give a follow-back';
  end if;
end
$$;

-- 3 resets a day: Ada has used 1, so 2 more work and the next is refused.
select set_config('app.user_id', '${ADA}', false);
select public.reset_invite_code();
select set_config('test.third_code', public.reset_invite_code(), false);
do $$
begin
  begin
    perform public.reset_invite_code();
    raise exception 'a 4th reset in a day went through';
  exception
    when raise_exception then
      if sqlerrm <> 'invite_reset_limit' then
        raise;
      end if;
  end;
  if public.my_invite_code() <> current_setting('test.third_code') then
    raise exception 'a refused reset changed the code';
  end if;
end
$$;

-- Another user's limit and code are their own.
select set_config('app.user_id', '${DEE}', false);
do $$
begin
  if public.reset_invite_code() is null then
    raise exception 'Dee should be able to reset';
  end if;
  if (select count(*) from public.invite_codes) <> 1 then
    raise exception 'a user can read another user''s code';
  end if;
end
$$;
reset role;

-- Resets older than a day don't count.
update private.invite_code_resets set created_at = now() - interval '25 hours'
  where user_id = '${ADA}';
set role authenticated;
select set_config('app.user_id', '${ADA}', false);
select public.reset_invite_code();
reset role;
`;

const INVITES = "supabase/migrations/20261029180000_invites.sql";
const HARDENING = "supabase/migrations/20261031120000_invite_hardening.sql";

describe("invite hardening migration", () => {
  const stops: Array<() => void> = [];
  after(() => stops.forEach((stop) => stop()));

  it("drops the 1-argument accept_invite; reset_invite_code is owner-only, kills the old code at once, and allows 3 a day", { timeout: 120_000 }, async () => {
    const db = await startPostgres("pginvitereset-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.run(oldOverloadSql, "old overload");
    db.runFile(join(process.cwd(), INVITES), "invites migration");
    db.run(seedSql, "seed");
    db.runFile(join(process.cwd(), HARDENING), "hardening migration");
    db.run(behaviorSql, "behavior");
  });

  it("runs twice without error", { timeout: 120_000 }, async () => {
    const db = await startPostgres("pginvitereset2-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.runFile(join(process.cwd(), INVITES), "invites migration");
    db.runFile(join(process.cwd(), HARDENING), "hardening migration");
    db.runFile(join(process.cwd(), HARDENING), "hardening migration again");
  });
});
