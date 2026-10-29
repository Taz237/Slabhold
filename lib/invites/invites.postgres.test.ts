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
  username text not null unique,
  is_test boolean not null default false
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

const seedSql = `
insert into public.profiles (id, username, is_test) values
  ('${ADA}', 'ada', false),
  ('${BEN}', 'ben', false),
  ('${CAL}', 'cal', false),
  ('${QA}', 'qa_guard_1', false),
  ('${DEE}', 'dee', false),
  ('${EVE}', 'eve', true);
insert into public.blocks (blocker_id, blocked_id) values ('${ADA}', '${DEE}');
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
    perform 1 from public.invites;
    raise exception 'anon read invites';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;

set role authenticated;

-- Ben accepts Ada's invite: two follows and one invites row.
select set_config('app.user_id', '${BEN}', false);
select public.accept_invite('  Ada ');
do $$
begin
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
select public.accept_invite('ada');
select public.accept_invite('cal');
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
select public.accept_invite('cal');
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
select public.accept_invite('ada');
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

  it("follows both ways once, skips blocked, QA and repeat invites, and keeps rows private", { timeout: 120_000 }, async () => {
    const db = await startPostgres("pginvites-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.runFile(join(process.cwd(), INVITES), "migration");
    db.run(seedSql, "seed");
    db.run(behaviorSql, "behavior");
  });
});
