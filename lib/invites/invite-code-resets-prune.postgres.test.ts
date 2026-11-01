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
create role service_role nologin;

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

const ADA = "11111111-1111-1111-1111-111111111111";

const seedSql = `
insert into public.profiles (id, username) values ('${ADA}', 'ada');
insert into auth.users (id) select id from public.profiles;
insert into private.invite_code_resets (user_id, created_at) values
  ('${ADA}', now() - interval '3 days'),
  ('${ADA}', now() - interval '49 hours'),
  ('${ADA}', now() - interval '47 hours'),
  ('${ADA}', now() - interval '1 hour');
`;

const behaviorSql = `
-- Security definer, empty search_path.
do $$
begin
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.prune_invite_code_resets()'::regprocedure) then
    raise exception 'prune_invite_code_resets is not security definer';
  end if;
  if not (
    select 'search_path=""' = any (p.proconfig)
    from pg_proc p where p.oid = 'public.prune_invite_code_resets()'::regprocedure
  ) then
    raise exception 'prune_invite_code_resets search_path is not empty';
  end if;
end
$$;

-- Clients can't call it.
set role anon;
do $$
begin
  begin
    perform public.prune_invite_code_resets();
    raise exception 'anon called prune_invite_code_resets';
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
    perform public.prune_invite_code_resets();
    raise exception 'authenticated called prune_invite_code_resets';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- service_role prunes rows older than 2 days, then nothing on a second run.
set role service_role;
do $$
declare
  removed integer;
begin
  removed := public.prune_invite_code_resets();
  if removed <> 2 then
    raise exception 'first prune removed % rows, expected 2', removed;
  end if;
  removed := public.prune_invite_code_resets();
  if removed <> 0 then
    raise exception 'second prune removed % rows, expected 0', removed;
  end if;
end
$$;
reset role;

do $$
begin
  if (select count(*) from private.invite_code_resets) <> 2 then
    raise exception 'expected 2 rows left';
  end if;
  if exists (
    select 1 from private.invite_code_resets
    where created_at < now() - interval '48 hours'
       or created_at > now() - interval '30 minutes'
       or (created_at < now() - interval '2 hours' and created_at > now() - interval '46 hours')
  ) then
    raise exception 'the wrong rows were kept';
  end if;
end
$$;

-- The 3-a-day limit still counts the 1 hour row: 2 more resets, then refused.
set role authenticated;
select set_config('app.user_id', '${ADA}', false);
select public.reset_invite_code();
select public.reset_invite_code();
do $$
begin
  begin
    perform public.reset_invite_code();
    raise exception 'the 1 hour reset was not counted';
  exception
    when raise_exception then
      if sqlerrm <> 'invite_reset_limit' then
        raise;
      end if;
  end;
end
$$;
reset role;
`;

const INVITES = "supabase/migrations/20261029180000_invites.sql";
const HARDENING = "supabase/migrations/20261031120000_invite_hardening.sql";
const PRUNE = "supabase/migrations/20261101150000_invite_code_resets_prune.sql";

describe("invite code resets prune migration", () => {
  const stops: Array<() => void> = [];
  after(() => stops.forEach((stop) => stop()));

  it("prunes reset rows older than 2 days for service_role only, and keeps the daily limit", { timeout: 120_000 }, async () => {
    const db = await startPostgres("pgresetprune-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.runFile(join(process.cwd(), INVITES), "invites migration");
    db.runFile(join(process.cwd(), HARDENING), "hardening migration");
    db.runFile(join(process.cwd(), PRUNE), "prune migration");
    db.run(seedSql, "seed");
    db.run(behaviorSql, "behavior");
  });

  it("runs twice without error", { timeout: 120_000 }, async () => {
    const db = await startPostgres("pgresetprune2-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.runFile(join(process.cwd(), INVITES), "invites migration");
    db.runFile(join(process.cwd(), HARDENING), "hardening migration");
    db.runFile(join(process.cwd(), PRUNE), "prune migration");
    db.runFile(join(process.cwd(), PRUNE), "prune migration again");
  });
});
