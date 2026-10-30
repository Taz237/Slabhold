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
  ('${SHOWN}', 'collector', 'silver'),
  ('${HIDDEN}', 'streak', 'gold');
update public.profiles set pinned_badges = '{collector:silver}' where id = '${SHOWN}';
update public.profiles set pinned_badges = '{streak:gold}', show_badges = false where id = '${HIDDEN}';
`;

/** What a later table-wide grant does: every column readable again, pins included. */
const regrantSql = `
grant select on public.profiles to anon, authenticated;
grant select (pinned_badges) on public.profiles to public;
alter table public.profiles add column if not exists added_later text;
`;

const leakSql = `
set role anon;
do $$
begin
  perform pinned_badges from public.profiles;
end
$$;
reset role;
`;

const lockedSql = `
set role anon;
select set_config('app.user_id', '', false);
do $$
begin
  begin
    perform pinned_badges from public.profiles;
    raise exception 'anon read pinned_badges from profiles';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.profiles where pinned_badges = '{}';
    raise exception 'anon filtered on pinned_badges';
  exception
    when insufficient_privilege then null;
  end;
  if (select pinned_badges from public.profile_badge_pins where id = '${SHOWN}') <> '{collector:silver}' then
    raise exception 'the profile page path lost shown pins';
  end if;
  if (select pinned_badges from public.profile_badge_pins where id = '${HIDDEN}') <> '{}' then
    raise exception 'hidden pins leaked through the view';
  end if;
end
$$;
reset role;

set role authenticated;
select set_config('app.user_id', '${VIEWER}', false);
do $$
begin
  begin
    perform pinned_badges from public.profiles where id = '${SHOWN}';
    raise exception 'a signed-in user read pinned_badges from profiles';
  exception
    when insufficient_privilege then null;
  end;
  if (select username from public.profiles where id = '${HIDDEN}') <> 'hidden' then
    raise exception 'other profile columns are no longer readable';
  end if;
  if (select show_badges from public.profiles where id = '${HIDDEN}') is not false then
    raise exception 'show_badges is no longer readable';
  end if;
  if (select pinned_badges from public.profile_badge_pins where id = '${HIDDEN}') <> '{}' then
    raise exception 'hidden pins leaked to another user';
  end if;
end
$$;

-- The owner still sees and saves their own pins.
select set_config('app.user_id', '${HIDDEN}', false);
do $$
begin
  if (select pinned_badges from public.profile_badge_pins where id = '${HIDDEN}') <> '{streak:gold}' then
    raise exception 'the owner cannot read their own hidden pins';
  end if;
  update public.profiles set pinned_badges = '{}' where id = '${HIDDEN}';
  update public.profiles set pinned_badges = '{streak:gold}' where id = '${HIDDEN}';
end
$$;
reset role;
`;

const BADGES = "supabase/migrations/20261028200000_achievements_badges.sql";
const INITPLAN = "supabase/migrations/20261029120000_user_badges_rls_initplan.sql";
const PINS = "supabase/migrations/20261029130000_pinned_badges_privacy.sql";
const LOCK = "supabase/migrations/20261031121000_pinned_badges_lock.sql";

async function database(prefix: string, stops: Array<() => void>) {
  const db = await startPostgres(prefix);
  stops.push(db.stop);
  db.run(setupSql, "setup");
  db.runFile(join(process.cwd(), BADGES), "badges migration");
  db.runFile(join(process.cwd(), INITPLAN), "initplan migration");
  db.run(seedSql, "seed");
  return db;
}

describe("pinned badges lock migration", () => {
  const stops: Array<() => void> = [];
  after(() => stops.forEach((stop) => stop()));

  it("locks the column where #118's migration never ran", { timeout: 120_000 }, async () => {
    const db = await database("pglock1-", stops);
    db.run(leakSql, "column is readable before the lock");
    db.runFile(join(process.cwd(), LOCK), "lock migration");
    db.run(lockedSql, "locked");
  });

  it("closes the leak a later table-wide grant reopens, and keeps columns added since readable", { timeout: 120_000 }, async () => {
    const db = await database("pglock2-", stops);
    db.runFile(join(process.cwd(), PINS), "pins migration");
    db.run(regrantSql, "re-grant");
    db.run(leakSql, "re-grant reopened the column");
    db.runFile(join(process.cwd(), LOCK), "lock migration");
    db.run(lockedSql, "locked");
    db.run(
      `set role anon; do $$ begin perform added_later from public.profiles; end $$; reset role;`,
      "a column added later is readable",
    );
    db.runFile(join(process.cwd(), LOCK), "lock migration again");
    db.run(lockedSql, "still locked");
  });
});
