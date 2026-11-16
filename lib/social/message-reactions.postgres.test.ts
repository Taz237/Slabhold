import { join } from "node:path";
import { after, describe, it } from "node:test";
import { startPostgres } from "@/lib/test/postgres";

// A throwaway local cluster with just enough of the real schema. Never prod.
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

-- The live messages and notifications policies (20261017250000, 20261023010000).
alter table public.messages enable row level security;
grant select, insert on public.messages to authenticated;
create policy "Read own messages" on public.messages
  for select using (
    (auth.uid() = sender_id or auth.uid() = receiver_id)
    and not private.is_blocked(auth.uid(), sender_id)
    and not private.is_blocked(auth.uid(), receiver_id)
  );

alter table public.notifications enable row level security;
grant select, insert on public.notifications to authenticated;
create policy "Read own notifications" on public.notifications
  for select using (auth.uid() = recipient_id);
`;

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const M1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const seedSql = `
insert into public.profiles (id, username) values
  ('${A}', 'alpha'), ('${B}', 'bravo'), ('${C}', 'charlie');
-- A sent M1 to B. B sent M2 to A.
insert into public.messages (id, sender_id, receiver_id, content) values
  ('${M1}', '${A}', '${B}', 'Still have the Wemby?'),
  ('${M2}', '${B}', '${A}', 'Yep, still here');
`;

/** Runs as one signed-in user. */
function as(user: string, body: string) {
  return `
set role authenticated;
select set_config('app.user_id', '${user}', false);
do $$
begin
${body}
end
$$;
reset role;
`;
}

const reactSql = `
${as(
  B,
  `
  insert into public.message_reactions (message_id, user_id, emoji) values ('${M1}', '${B}', '❤️');

  -- One per person per message.
  begin
    insert into public.message_reactions (message_id, user_id, emoji) values ('${M1}', '${B}', '🔥');
    raise exception 'a second reaction from the same person saved';
  exception
    when unique_violation then null;
  end;

  -- Only the six emoji.
  begin
    insert into public.message_reactions (message_id, user_id, emoji) values ('${M2}', '${B}', '💩');
    raise exception 'an emoji outside the six saved';
  exception
    when check_violation then null;
  end;

  -- Never as someone else.
  begin
    insert into public.message_reactions (message_id, user_id, emoji) values ('${M2}', '${A}', '👍');
    raise exception 'B reacted as A';
  exception
    when insufficient_privilege then null;
  end;
`,
)}

${as(
  A,
  `
  if (select count(*) from public.message_reactions where message_id = '${M1}') <> 1 then
    raise exception 'A cannot see the reaction on their own message';
  end if;
  if (select count(*) from public.notifications where kind = 'dm_reaction' and recipient_id = '${A}'
      and actor_id = '${B}' and metadata ->> 'emoji' = '❤️' and metadata ->> 'message_id' = '${M1}'
      and preview = 'Still have the Wemby?') <> 1 then
    raise exception 'A did not get one quiet reaction notice';
  end if;

  -- A cannot change or remove B's reaction.
  update public.message_reactions set emoji = '😢' where user_id = '${B}';
  delete from public.message_reactions where user_id = '${B}';

  -- Clients cannot forge reaction notices.
  begin
    insert into public.notifications (recipient_id, actor_id, kind) values ('${B}', '${A}', 'dm_reaction');
    raise exception 'a client wrote a dm_reaction notice';
  exception
    when insufficient_privilege then null;
  end;
`,
)}

${as(
  C,
  `
  -- Not in the conversation: sees nothing, writes nothing.
  if exists (select 1 from public.message_reactions) then
    raise exception 'an outsider read reactions';
  end if;
  begin
    insert into public.message_reactions (message_id, user_id, emoji) values ('${M1}', '${C}', '😂');
    raise exception 'an outsider reacted';
  exception
    when insufficient_privilege then null;
  end;
`,
)}

${as(
  B,
  `
  if (select emoji from public.message_reactions where message_id = '${M1}' and user_id = '${B}') <> '❤️' then
    raise exception 'A changed B''s reaction';
  end if;

  -- Swap: the notice changes emoji in place, no second notice.
  update public.message_reactions set emoji = '🔥' where message_id = '${M1}' and user_id = '${B}';
`,
)}

do $$
begin
  if (select count(*) from public.notifications where kind = 'dm_reaction') <> 1 then
    raise exception 'a swap wrote another notice';
  end if;
  if (select metadata ->> 'emoji' from public.notifications where kind = 'dm_reaction') <> '🔥' then
    raise exception 'the notice kept the old emoji';
  end if;
end
$$;

${as(
  A,
  `
  -- Reacting to your own message notifies nobody.
  insert into public.message_reactions (message_id, user_id, emoji) values ('${M1}', '${A}', '😂');
  if (select count(*) from public.message_reactions where message_id = '${M1}') <> 2 then
    raise exception 'both reactions should show';
  end if;
`,
)}

${as(
  B,
  `
  -- Removing the reaction removes the notice.
  delete from public.message_reactions where message_id = '${M1}' and user_id = '${B}';
`,
)}

do $$
begin
  if exists (select 1 from public.notifications where kind = 'dm_reaction') then
    raise exception 'a removed reaction left its notice';
  end if;
end
$$;
`;

const pushSql = `
${as(B, `insert into public.message_reactions (message_id, user_id, emoji) values ('${M1}', '${B}', '👍');`)}

do $$
begin
  if not exists (select 1 from public.notifications where kind = 'dm_reaction') then
    raise exception 'the notice is missing';
  end if;
  -- The seeded DM queues its own 'dm' push; nothing else may.
  if exists (select 1 from private.push_outbox where kind <> 'dm') then
    raise exception 'a reaction queued a push';
  end if;
end
$$;
`;

const blockSql = `
insert into public.blocks (blocker_id, blocked_id) values ('${A}', '${B}');

${as(
  B,
  `
  if exists (select 1 from public.message_reactions) then
    raise exception 'a block left reactions readable';
  end if;
  begin
    insert into public.message_reactions (message_id, user_id, emoji) values ('${M2}', '${B}', '😮');
    raise exception 'a blocked person reacted';
  exception
    when insufficient_privilege then null;
  end;
`,
)}

delete from public.blocks;

-- Deleting a message removes its reactions and their notices.
delete from public.messages where id = '${M1}';
do $$
begin
  if exists (select 1 from public.message_reactions where message_id = '${M1}')
     or exists (select 1 from public.notifications where kind = 'dm_reaction') then
    raise exception 'a deleted message left reactions or notices behind';
  end if;
end
$$;
`;

const PUSH_MIGRATION = "supabase/migrations/20261030120000_push_notifications.sql";
const MIGRATION = "supabase/migrations/20261116120000_message_reactions.sql";

describe("message reactions migration", () => {
  const stops: Array<() => void> = [];
  after(() => stops.forEach((stop) => stop()));

  it(
    "keeps reactions to the two people in the chat, one each, with one quiet notice and no push",
    { timeout: 120_000 },
    async () => {
      const db = await startPostgres("pgreact-");
      stops.push(db.stop);
      db.run(setupSql, "setup");
      db.runFile(join(process.cwd(), PUSH_MIGRATION), "push migration");
      db.runFile(join(process.cwd(), MIGRATION), "reactions migration");
      db.run(seedSql, "seed");
      db.run(reactSql, "react");
      db.run(pushSql, "no push");
      db.run(blockSql, "blocks and deletes");
    },
  );
});
