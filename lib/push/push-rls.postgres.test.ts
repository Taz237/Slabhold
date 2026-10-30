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
create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key,
  username text not null,
  display_name text not null default 'n',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  hidden_at timestamptz
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  post_id uuid references public.posts (id) on delete set null,
  href text,
  preview text,
  metadata jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_kind check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote', 'want_alert', 'deal_confirm')),
  check (actor_id is null or actor_id <> recipient_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  kind text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.blocks (blocker_id uuid not null, blocked_id uuid not null);
create table public.mutes (muter_id uuid not null, muted_id uuid not null);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function private.is_muted(viewer uuid, author uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select viewer is not null and author is not null and viewer <> author and exists (
    select 1 from public.mutes where muter_id = viewer and muted_id = author
  );
$$;
`;

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const POST = "44444444-4444-4444-8444-444444444444";
const QUOTE = "55555555-5555-4555-8555-555555555555";

const seedSql = `
insert into public.profiles (id, username, display_name) values
  ('${A}', 'alpha', 'Alpha'), ('${B}', 'bravo', 'Bravo'), ('${C}', 'charlie', 'Charlie');
insert into public.posts (id, user_id, content) values
  ('${POST}', '${A}', 'Pulled a Prizm Luka'), ('${QUOTE}', '${B}', 'Look at this');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, platform) values
  ('${A}', 'https://fcm.googleapis.com/fcm/send/a', 'k', 'a', 'android'),
  ('${B}', 'https://web.push.apple.com/b', 'k', 'a', 'ios');
insert into public.notification_prefs (user_id, push_like) values ('${B}', false);
`;

const rlsSql = `
set role authenticated;
select set_config('app.user_id', '${A}', false);

do $$
begin
  if (select count(*) from public.push_subscriptions) <> 1 then
    raise exception 'a user saw push subscriptions that are not theirs';
  end if;

  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('${A}', 'https://evil.test/x', 'k', 'a');
    raise exception 'a client inserted a push subscription';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.push_subscriptions set endpoint = 'https://evil.test/x';
    raise exception 'a client updated a push subscription';
  exception
    when insufficient_privilege then null;
  end;

  delete from public.push_subscriptions where user_id = '${B}';

  insert into public.notification_prefs (user_id, push_dm, time_zone) values ('${A}', false, 'Asia/Tokyo');
  update public.notification_prefs set show_previews = false where user_id = '${A}';
  if (select count(*) from public.notification_prefs) <> 1 then
    raise exception 'a user read notification prefs that are not theirs';
  end if;

  begin
    insert into public.notification_prefs (user_id) values ('${C}');
    raise exception 'a user wrote prefs for someone else';
  exception
    when insufficient_privilege then null;
  end;

  update public.notification_prefs set push_like = true where user_id = '${B}';

  begin
    update public.notification_prefs set time_zone = 'Mars/Base' where user_id = '${A}';
    raise exception 'a bad time zone was saved';
  exception
    when check_violation then null;
  end;

  begin
    perform 1 from private.push_outbox;
    raise exception 'a client read the outbox';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.push_claim('${A}', 10, 10);
    raise exception 'a client claimed outbox rows';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.push_context(gen_random_uuid());
    raise exception 'a client read push context';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

delete from public.push_subscriptions where user_id = '${A}';

reset role;

do $$
begin
  if (select count(*) from public.push_subscriptions where user_id = '${B}') <> 1 then
    raise exception 'a user deleted someone else''s subscription';
  end if;
  if (select count(*) from public.push_subscriptions where user_id = '${A}') <> 0 then
    raise exception 'a user could not delete their own subscription';
  end if;
  if (select push_like from public.notification_prefs where user_id = '${B}') is not false then
    raise exception 'a user changed someone else''s prefs';
  end if;
  if (select show_previews from public.notification_prefs where user_id = '${A}') is not false then
    raise exception 'a user could not update their own prefs';
  end if;
end
$$;

set role anon;
select set_config('app.user_id', '', false);

do $$
begin
  begin
    perform 1 from public.push_subscriptions;
    raise exception 'anon read push subscriptions';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.notification_prefs;
    raise exception 'anon read notification prefs';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

reset role;
`;

const outboxSql = `
insert into public.notifications (recipient_id, actor_id, kind, post_id) values
  ('${A}', '${B}', 'like', '${POST}'),
  ('${A}', '${B}', 'comment', '${POST}'),
  ('${A}', '${B}', 'follow', null),
  ('${A}', '${B}', 'repost', '${POST}'),
  ('${A}', '${B}', 'mention', '${POST}'),
  ('${A}', '${B}', 'quote', '${QUOTE}'),
  ('${A}', null, 'want_alert', null),
  ('${A}', '${B}', 'deal_confirm', null);
insert into public.messages (sender_id, receiver_id, content, kind) values ('${B}', '${A}', 'Still have it?', 'text');
insert into public.comments (post_id, user_id, body) values ('${POST}', '${B}', 'Huge pull');

do $$
declare
  keys text;
begin
  select string_agg(kind || '=' || group_key, ',' order by kind)
  into keys
  from private.push_outbox;
  if keys is distinct from
    'comment=reply:${POST},dm=dm:${B},follow=follow,like=like:${POST},mention=mention:${POST},quote=quote:${QUOTE},repost=repost:${POST}' then
    raise exception 'unexpected outbox rows: %', keys;
  end if;
  if exists (select 1 from private.push_outbox where status <> 'pending' or recipient_id <> '${A}' or actor_id <> '${B}') then
    raise exception 'outbox rows have the wrong state';
  end if;
end
$$;

-- A broken outbox never fails the like, follow or message itself.
alter table private.push_outbox rename to push_outbox_away;
insert into public.notifications (recipient_id, actor_id, kind) values ('${B}', '${C}', 'follow');
insert into public.messages (sender_id, receiver_id, content) values ('${C}', '${B}', 'hi');
alter table private.push_outbox_away rename to push_outbox;

do $$
begin
  if (select count(*) from public.notifications where recipient_id = '${B}' and actor_id = '${C}') <> 1 then
    raise exception 'the follow did not save while the outbox was broken';
  end if;
  if (select count(*) from public.messages where sender_id = '${C}') <> 1 then
    raise exception 'the message did not save while the outbox was broken';
  end if;
end
$$;
`;

const serviceSql = `
create table public.outbox_ids as select kind, id from private.push_outbox;
grant select on public.outbox_ids to service_role;
set role service_role;

do $$
declare
  claimed integer;
  again integer;
  like_id uuid;
  reply_id uuid;
  ctx jsonb;
  state jsonb;
begin
  select count(*) into claimed from public.push_claim('${B}', 25, 0);
  if claimed <> 7 then
    raise exception 'expected to claim 7 rows, got %', claimed;
  end if;
  select count(*) into again from public.push_claim('${B}', 25, 50);
  if again <> 0 then
    raise exception 'claimed rows were claimed twice';
  end if;

  select id into like_id from public.outbox_ids where kind = 'like';
  select id into reply_id from public.outbox_ids where kind = 'comment';

  ctx := public.push_context(like_id);
  if (ctx ->> 'source_exists')::boolean is not true
     or ctx -> 'actor' ->> 'username' <> 'bravo'
     or ctx ->> 'text' <> 'Pulled a Prizm Luka'
     or (ctx -> 'post' ->> 'hidden')::boolean is not false
     or (ctx ->> 'subscription_count')::int <> 0
     or (ctx ->> 'badge')::int < 1
     or (ctx ->> 'blocked')::boolean
     or ctx -> 'prefs' ->> 'push_dm' <> 'false' then
    raise exception 'unexpected like context: %', ctx;
  end if;

  ctx := public.push_context(reply_id);
  if ctx ->> 'text' <> 'Huge pull' then
    raise exception 'reply context has the wrong text: %', ctx;
  end if;

  if public.push_take_lease('${A}', 'like:${POST}', 30) is not true then
    raise exception 'first lease was refused';
  end if;
  if public.push_take_lease('${A}', 'like:${POST}', 30) is not false then
    raise exception 'a second lease was granted';
  end if;
  perform public.push_release_lease('${A}', 'like:${POST}');
  if public.push_take_lease('${A}', 'like:${POST}', 30) is not true then
    raise exception 'a released lease was refused';
  end if;

  perform public.push_mark(array[like_id], 'sent', now());
  state := public.push_group_state('${A}', 'like:${POST}', '${B}');
  if state ->> 'last_push_at' is null or (state ->> 'sent_last_minute')::int <> 1 then
    raise exception 'unexpected group state: %', state;
  end if;
  state := public.push_group_state('${A}', 'dm:${B}', '${B}');
  if (state ->> 'dm_unread')::int <> 1 then
    raise exception 'unexpected dm unread: %', state;
  end if;

  if (select valid from public.push_group_rows('${A}', 'like:${POST}')) is not true then
    raise exception 'the like should still be valid';
  end if;
end
$$;

reset role;
-- Unlike and a block both make the row invalid at send time.
delete from public.notifications where kind = 'like';
insert into public.blocks values ('${A}', '${B}');
set role service_role;

do $$
declare
  like_id uuid;
  ctx jsonb;
begin
  select id into like_id from public.outbox_ids where kind = 'like';
  ctx := public.push_context(like_id);
  if (ctx ->> 'source_exists')::boolean is not false or (ctx ->> 'blocked')::boolean is not true then
    raise exception 'unlike or block not seen: %', ctx;
  end if;
  if (select valid from public.push_group_rows('${A}', 'like:${POST}')) is not false then
    raise exception 'an unliked row still counts';
  end if;
  perform public.push_prune();
end
$$;

reset role;

-- Deleting an account removes its rows.
delete from public.profiles where id = '${A}';
do $$
begin
  if exists (select 1 from private.push_outbox where recipient_id = '${A}')
     or exists (select 1 from public.notification_prefs where user_id = '${A}') then
    raise exception 'account delete left push rows behind';
  end if;
end
$$;
`;

const MIGRATION = "supabase/migrations/20261030120000_push_notifications.sql";

describe("push notifications migration", () => {
  const stops: Array<() => void> = [];
  after(() => stops.forEach((stop) => stop()));

  it(
    "keeps subscriptions and prefs own-only, hides the outbox, queues all six kinds plus DMs, and never fails the source insert",
    { timeout: 120_000 },
    async () => {
      const db = await startPostgres("pgpush-");
      stops.push(db.stop);
      db.run(setupSql, "setup");
      db.runFile(join(process.cwd(), MIGRATION), "push migration");
      db.run(seedSql, "seed");
      db.run(rlsSql, "rls");
      db.run(outboxSql, "outbox triggers");
      db.run(serviceSql, "service functions");
    },
  );
});
