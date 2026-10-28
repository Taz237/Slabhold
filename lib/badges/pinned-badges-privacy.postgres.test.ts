import { join } from "node:path";
import { after, describe, it } from "node:test";
import { startPostgres } from "@/lib/test/postgres";

const setupSql = `
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create role anon nologin;
create role authenticated nologin;

create table public.profiles (
  id uuid primary key,
  username text not null,
  display_name text not null default 'n',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Profiles are public" on public.profiles for select using (true);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
`;

const SHOWN = "11111111-1111-1111-1111-111111111111";
const HIDDEN = "22222222-2222-2222-2222-222222222222";
const VIEWER = "33333333-3333-3333-3333-333333333333";

const seedSql = `
insert into public.profiles (id, username) values
  ('${SHOWN}', 'shown'), ('${HIDDEN}', 'hidden'), ('${VIEWER}', 'viewer');
insert into public.user_badges (user_id, category, tier) values
  ('${SHOWN}', 'collector', 'bronze'),
  ('${SHOWN}', 'collector', 'silver'),
  ('${HIDDEN}', 'streak', 'gold');
update public.profiles set pinned_badges = '{collector:silver}' where id = '${SHOWN}';
update public.profiles set pinned_badges = '{streak:gold}', show_badges = false where id = '${HIDDEN}';
`;

const behaviorSql = `
set role authenticated;
select set_config('app.user_id', '${VIEWER}', false);

do $$
begin
  begin
    perform pinned_badges from public.profiles where id = '${HIDDEN}';
    raise exception 'another user read pinned_badges from profiles';
  exception
    when insufficient_privilege then null;
  end;

  if (select username from public.profiles where id = '${HIDDEN}') <> 'hidden' then
    raise exception 'other profile columns are no longer readable';
  end if;
  if (select show_badges from public.profiles where id = '${HIDDEN}') is not false then
    raise exception 'show_badges is no longer readable';
  end if;

  if (select pinned_badges from public.profile_badge_pins where id = '${SHOWN}') <> '{collector:silver}' then
    raise exception 'shown pins are not readable by another user';
  end if;
  if (select pinned_badges from public.profile_badge_pins where id = '${HIDDEN}') <> '{}' then
    raise exception 'show_badges off still leaked pins to another user';
  end if;
end
$$;

select set_config('app.user_id', '${HIDDEN}', false);

do $$
begin
  if (select pinned_badges from public.profile_badge_pins where id = '${HIDDEN}') <> '{streak:gold}' then
    raise exception 'the owner cannot read their own hidden pins';
  end if;
end
$$;

select set_config('app.user_id', '${SHOWN}', false);

do $$
begin
  update public.profiles set pinned_badges = '{collector:bronze}' where id = '${SHOWN}';
  if (select pinned_badges from public.profile_badge_pins where id = '${SHOWN}') <> '{collector:bronze}' then
    raise exception 'the owner could not save a pin';
  end if;

  begin
    update public.profiles set pinned_badges = '{collector:legendary}' where id = '${SHOWN}';
    raise exception 'an unearned pin was saved';
  exception
    when insufficient_privilege then null;
  end;

  update public.profiles set show_badges = false where id = '${SHOWN}';
end
$$;

select set_config('app.user_id', '${VIEWER}', false);

do $$
begin
  if (select pinned_badges from public.profile_badge_pins where id = '${SHOWN}') <> '{}' then
    raise exception 'turning show_badges off did not hide pins';
  end if;
end
$$;

reset role;
set role anon;
select set_config('app.user_id', '', false);

do $$
begin
  begin
    perform pinned_badges from public.profiles;
    raise exception 'signed-out visitors read pinned_badges from profiles';
  exception
    when insufficient_privilege then null;
  end;
  if exists (select 1 from public.profile_badge_pins where cardinality(pinned_badges) > 0) then
    raise exception 'signed-out visitors read hidden pins';
  end if;
  if (select count(*) from public.profiles where username in ('shown', 'hidden', 'viewer')) <> 3 then
    raise exception 'signed-out visitors cannot read profiles';
  end if;
end
$$;
`;

const BADGES = "supabase/migrations/20261028200000_achievements_badges.sql";
const INITPLAN = "supabase/migrations/20261029120000_user_badges_rls_initplan.sql";
const PINS = "supabase/migrations/20261029130000_pinned_badges_privacy.sql";

describe("pinned badges privacy migration", () => {
  const stops: Array<() => void> = [];
  after(() => stops.forEach((stop) => stop()));

  it("hides pins from other users when show_badges is off, through the API roles", { timeout: 120_000 }, async () => {
    const db = await startPostgres("pgpins-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.runFile(join(process.cwd(), BADGES), "badges migration");
    db.runFile(join(process.cwd(), INITPLAN), "initplan migration");
    db.run(seedSql, "seed");
    db.runFile(join(process.cwd(), PINS), "pins migration");
    db.run(behaviorSql, "behavior");
  });
});
