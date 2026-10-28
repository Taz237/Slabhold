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
update public.profiles set show_badges = false where id = '${HIDDEN}';
insert into public.user_badges (user_id, category, tier) values
  ('${SHOWN}', 'collector', 'bronze'),
  ('${SHOWN}', 'collector', 'silver'),
  ('${HIDDEN}', 'streak', 'gold');
`;

const behaviorSql = `
do $$
begin
  if (select show_badges from public.profiles where id = '${VIEWER}') is not true then
    raise exception 'show_badges should default to true';
  end if;
end
$$;

set role authenticated;
select set_config('app.user_id', '${VIEWER}', false);

do $$
begin
  if (select count(*) from public.user_badges where user_id = '${SHOWN}') <> 2 then
    raise exception 'shown badges are not readable by another user';
  end if;
  if (select count(*) from public.user_badges where user_id = '${HIDDEN}') <> 0 then
    raise exception 'show_badges off still leaked badges to another user';
  end if;

  begin
    insert into public.user_badges (user_id, category, tier) values ('${VIEWER}', 'collector', 'legendary');
    raise exception 'a client inserted a badge';
  exception
    when insufficient_privilege then null;
  end;

  update public.user_badges set seen_at = now() where user_id = '${SHOWN}';
  if exists (select 1 from public.user_badges where user_id = '${SHOWN}' and seen_at is not null) then
    raise exception 'another user marked badges seen';
  end if;
end
$$;

select set_config('app.user_id', '${SHOWN}', false);

do $$
begin
  begin
    update public.user_badges set tier = 'legendary' where user_id = '${SHOWN}';
    raise exception 'the owner changed a tier';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.user_badges where user_id = '${SHOWN}';
    raise exception 'the owner deleted a badge';
  exception
    when insufficient_privilege then null;
  end;

  update public.user_badges set seen_at = now() where user_id = '${SHOWN}';
  if exists (select 1 from public.user_badges where user_id = '${SHOWN}' and seen_at is null) then
    raise exception 'the owner could not mark badges seen';
  end if;

  update public.profiles set pinned_badges = '{collector:silver}' where id = '${SHOWN}';
  if (select pinned_badges from public.profiles where id = '${SHOWN}') <> '{collector:silver}' then
    raise exception 'an earned pin was not saved';
  end if;

  begin
    update public.profiles set pinned_badges = '{collector:legendary}' where id = '${SHOWN}';
    raise exception 'an unearned pin was saved';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%can only pin a badge you earned%' then
        raise exception 'unearned pin raised the wrong error: %', sqlerrm;
      end if;
  end;

  begin
    update public.profiles set pinned_badges = '{collector:silver,collector:silver}' where id = '${SHOWN}';
    raise exception 'a repeated pin was saved';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.profiles
      set pinned_badges = '{collector:bronze,collector:silver,collector:bronze,collector:silver}'
      where id = '${SHOWN}';
    raise exception 'four pins were saved';
  exception
    when check_violation or insufficient_privilege then null;
  end;

  update public.profiles set show_badges = false where id = '${SHOWN}';
end
$$;

select set_config('app.user_id', '${HIDDEN}', false);

do $$
begin
  if (select count(*) from public.user_badges where user_id = '${HIDDEN}') <> 1 then
    raise exception 'the owner cannot read their own hidden badges';
  end if;
  if (select count(*) from public.user_badges where user_id = '${SHOWN}') <> 0 then
    raise exception 'turning show_badges off did not hide badges';
  end if;
  begin
    perform 1 from public.leaderboard_podiums;
    raise exception 'a client read leaderboard_podiums';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

reset role;
set role anon;
select set_config('app.user_id', '', false);

do $$
begin
  if (select count(*) from public.user_badges) <> 0 then
    raise exception 'signed-out visitors read hidden badges';
  end if;
end
$$;
`;

describe("badges migration", () => {
  let stop: (() => void) | null = null;
  after(() => stop?.());

  it("hides badges when show_badges is off and keeps tiers server-only", { timeout: 120_000 }, async () => {
    const db = await startPostgres("pgbadges-");
    stop = db.stop;
    db.run(setupSql, "setup");
    db.runFile(join(process.cwd(), "supabase/migrations/20261028200000_achievements_badges.sql"), "migration");
    db.run(seedSql, "seed");
    db.run(behaviorSql, "behavior");
  });
});
