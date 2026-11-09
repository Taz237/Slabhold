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
-- As on Supabase: the service role bypasses RLS.
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key,
  username text not null
);
`;

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

const seedSql = `
insert into public.profiles (id, username) values ('${A}', 'alpha'), ('${B}', 'bravo');
set role service_role;
insert into public.push_apns_devices (user_id, token) values ('${A}', '${TOKEN_A}'), ('${B}', '${TOKEN_B}');
reset role;
`;

const rlsSql = `
set role authenticated;
select set_config('app.user_id', '${A}', false);

do $$
begin
  if (select count(*) from public.push_apns_devices) <> 1 then
    raise exception 'a user saw APNs devices that are not theirs';
  end if;
  if (select token from public.push_apns_devices) <> '${TOKEN_A}' then
    raise exception 'a user read the wrong device';
  end if;

  begin
    insert into public.push_apns_devices (user_id, token) values ('${A}', '${"c".repeat(64)}');
    raise exception 'a client inserted an APNs device';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.push_apns_devices set user_id = '${A}';
    raise exception 'a client updated an APNs device';
  exception
    when insufficient_privilege then null;
  end;

  -- Someone else's row is invisible, so this deletes nothing.
  delete from public.push_apns_devices where user_id = '${B}';
end
$$;

reset role;
do $$
begin
  if (select count(*) from public.push_apns_devices where user_id = '${B}') <> 1 then
    raise exception 'a user deleted someone else''s APNs device';
  end if;
end
$$;

set role authenticated;
select set_config('app.user_id', '${A}', false);
delete from public.push_apns_devices where token = '${TOKEN_A}';
reset role;
do $$
begin
  if exists (select 1 from public.push_apns_devices where token = '${TOKEN_A}') then
    raise exception 'a user could not delete their own APNs device';
  end if;
end
$$;

set role anon;
do $$
begin
  begin
    perform 1 from public.push_apns_devices;
    raise exception 'anon read APNs devices';
  exception
    when insufficient_privilege then null;
  end;
  begin
    delete from public.push_apns_devices;
    raise exception 'anon deleted APNs devices';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;
`;

const checksSql = `
set role service_role;
do $$
begin
  begin
    insert into public.push_apns_devices (user_id, token) values ('${A}', 'NOT-HEX');
    raise exception 'a non-hex token was stored';
  exception
    when check_violation then null;
  end;
  begin
    insert into public.push_apns_devices (user_id, token) values ('${A}', '${"A".repeat(64)}');
    raise exception 'an uppercase token was stored';
  exception
    when check_violation then null;
  end;
  begin
    insert into public.push_apns_devices (user_id, token) values ('${A}', '${"d".repeat(63)}');
    raise exception 'a short token was stored';
  exception
    when check_violation then null;
  end;
  begin
    update public.push_apns_devices set failure_count = -1;
    raise exception 'a negative failure count was stored';
  exception
    when check_violation then null;
  end;
  begin
    insert into public.push_apns_devices (user_id, token) values ('${A}', '${TOKEN_B}');
    raise exception 'a token was stored twice';
  exception
    when unique_violation then null;
  end;

  -- The token moves to the newest signed-in user on that phone.
  insert into public.push_apns_devices (user_id, token) values ('${A}', '${TOKEN_B}')
  on conflict (token) do update set user_id = excluded.user_id;
  if (select user_id from public.push_apns_devices where token = '${TOKEN_B}') <> '${A}' then
    raise exception 'upsert by token did not move the device';
  end if;
end
$$;
reset role;

delete from public.profiles where id = '${A}';
do $$
begin
  if exists (select 1 from public.push_apns_devices where user_id = '${A}') then
    raise exception 'account delete left APNs devices behind';
  end if;
end
$$;
`;

const MIGRATION = "supabase/migrations/20261106120000_push_apns_devices.sql";

describe("APNs devices migration", () => {
  const stops: Array<() => void> = [];
  after(() => stops.forEach((stop) => stop()));

  it(
    "keeps iPhone tokens own-only (read and delete), server-written, hex, unique, and gone with the account",
    { timeout: 120_000 },
    async () => {
      const db = await startPostgres("pgapns-");
      stops.push(db.stop);
      db.run(setupSql, "setup");
      db.runFile(join(process.cwd(), MIGRATION), "apns migration");
      db.runFile(join(process.cwd(), MIGRATION), "apns migration, run twice");
      db.run(seedSql, "seed");
      db.run(rlsSql, "rls");
      db.run(checksSql, "checks");
    },
  );
});
