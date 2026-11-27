import assert from "node:assert/strict";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { startPostgres } from "@/lib/test/postgres";

const MIGRATION = "supabase/migrations/20261127120000_polls.sql";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const VOTER = "22222222-2222-4222-8222-222222222222";
const BLOCKED = "33333333-3333-4333-8333-333333333333";
const LATE = "44444444-4444-4444-8444-444444444444";

/** Many voters for the "everyone at once" check. */
const CROWD = Array.from({ length: 40 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);

/** posts, profiles, blocks and notifications as production has them where this migration touches them. */
const setupSql = `
create schema if not exists auth;
create schema if not exists private;
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
grant usage on schema public, private, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.profiles (id uuid primary key, username text not null);
create table public.blocks (blocker_id uuid not null, blocked_id uuid not null);

create or replace function private.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select a is not null and b is not null and a <> b and exists (
  select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)) $$;
grant execute on function private.is_blocked(uuid, uuid) to anon, authenticated;

-- The word filter that post text goes through in production.
create or replace function private.blocked_text(value text)
returns boolean language sql immutable
as $$ select coalesce(value ~* 'badword', false) $$;
grant execute on function private.blocked_text(text) to anon, authenticated;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  image_url text,
  card jsonb,
  quoted_post_id uuid references public.posts (id) on delete set null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  post_type text not null default 'post',
  meta jsonb,
  gif jsonb,
  video jsonb,
  thread_id uuid,
  thread_position smallint
);
alter table public.posts enable row level security;
create policy "Posts are public" on public.posts for select using (
  (hidden_at is null or user_id = auth.uid()) and not private.is_blocked(auth.uid(), user_id));
create policy "Create own posts" on public.posts for insert with check (auth.uid() = user_id);
create policy "Update own posts" on public.posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own posts" on public.posts for delete using (auth.uid() = user_id);
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

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
  constraint notifications_kind check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote', 'want_alert', 'deal_confirm', 'dm_reaction')),
  check (actor_id is null or actor_id <> recipient_id)
);
alter table public.notifications enable row level security;
create policy "Read own notifications" on public.notifications for select using (auth.uid() = recipient_id);
grant select on public.notifications to authenticated;

insert into public.profiles (id, username) values
  ('${AUTHOR}', 'author'), ('${VOTER}', 'voter'), ('${BLOCKED}', 'blocked'), ('${LATE}', 'late')
  ${CROWD.map((id, index) => `, ('${id}', 'crowd${index}')`).join("")};
insert into public.blocks (blocker_id, blocked_id) values ('${AUTHOR}', '${BLOCKED}');
`;

function quoted(why: string) {
  return why.replace(/'/g, "''");
}

/** The statement must fail, and its message must include `match`. */
function fails(statement: string, match: string, why: string) {
  return `
do $$
begin
  begin
    ${statement}
    raise exception 'ALLOWED: ${quoted(why)}';
  exception
    when others then
      if sqlerrm like 'ALLOWED:%' then raise; end if;
      if position('${quoted(match)}' in sqlerrm) = 0 then
        raise exception 'WRONG ERROR for ${quoted(why)}: %', sqlerrm;
      end if;
  end;
end
$$;`;
}

function expect(condition: string, why: string) {
  return `
do $$
begin
  if not (${condition}) then raise exception 'FAILED: ${quoted(why)}'; end if;
end
$$;`;
}

function as(user: string | null) {
  return user
    ? `set role authenticated; select set_config('app.user_id', '${user}', false);`
    : `set role anon; select set_config('app.user_id', '', false);`;
}

const POLL = `(select (meta -> 'poll' ->> 'id')::uuid from public.posts where content = 'Best rookie of 2024?')`;
const OPTION = (position: number) =>
  `(select id from public.poll_options where poll_id = ${POLL} and position = ${position})`;

const behaviorSql = `
${as(AUTHOR)}

-- Creating a poll: the post, the poll, its choices and the copy on meta.poll.
select public.create_poll_post('  Best rookie of 2024?  ', array['Caleb', ' Jayden ', 'Drake'], 1440);
reset role;
${expect(`(select count(*) from public.polls) = 1`, "one poll")}
${expect(`(select array_agg(label order by position) from public.poll_options) = array['Caleb', 'Jayden', 'Drake']`, "choices trimmed, in order")}
${expect(`exists (select 1 from public.polls where ends_at - created_at = interval '1 day' and user_id = '${AUTHOR}')`, "runs one day")}
${expect(`(select jsonb_array_length(meta -> 'poll' -> 'options') from public.posts where content = 'Best rookie of 2024?') = 3`, "meta.poll lists the choices")}
${expect(`(select meta -> 'poll' -> 'options' -> 1 ->> 'label' from public.posts where content = 'Best rookie of 2024?') = 'Jayden'`, "meta.poll labels")}

-- The limits.
${as(AUTHOR)}
${fails(`perform public.create_poll_post('q', array['only one'], 60);`, "2 to 4 choices", "one choice")}
${fails(`perform public.create_poll_post('q', array['a', 'b', 'c', 'd', 'e'], 60);`, "2 to 4 choices", "five choices")}
${fails(`perform public.create_poll_post('q', array['a', '${"x".repeat(26)}'], 60);`, "1 to 25 characters", "a 26 character choice")}
${fails(`perform public.create_poll_post('q', array['a', '   '], 60);`, "1 to 25 characters", "a blank choice")}
${fails(`perform public.create_poll_post('q', array['Yes', 'yes'], 60);`, "different", "a repeated choice")}
${fails(`perform public.create_poll_post('q', array['a', 'b'], 4);`, "5 minutes to 7 days", "under 5 minutes")}
${fails(`perform public.create_poll_post('q', array['a', 'b'], 10081);`, "5 minutes to 7 days", "over 7 days")}
${fails(`perform public.create_poll_post('   ', array['a', 'b'], 60);`, "Ask a question", "no question")}
${fails(`perform public.create_poll_post('q', array['a', 'badword'], 60);`, "doesn't allow", "a blocked word")}
select public.create_poll_post('Four is fine', array['a', '${"y".repeat(25)}', 'c', 'd'], 5);
select public.create_poll_post('Seven days is fine', array['a', 'b'], 10080);
reset role;
${expect(`(select count(*) from public.polls) = 3`, "a refused poll leaves nothing behind")}
${expect(`(select count(*) from public.posts) = 3`, "a refused poll leaves no post")}

-- Nobody writes polls or choices directly.
${as(AUTHOR)}
${fails(`insert into public.polls (post_id, user_id, ends_at) select id, '${AUTHOR}', now() + interval '1 day' from public.posts limit 1;`, "permission denied", "a direct poll insert")}
${fails(`update public.poll_options set vote_count = 999;`, "permission denied", "seeding a count")}
${fails(`update public.polls set ends_at = now() + interval '30 days';`, "permission denied", "stretching a poll")}

-- meta.poll can't be forged, changed or dropped, and a poll post can't be edited.
insert into public.posts (user_id, content, meta) values ('${AUTHOR}', 'fake', '{"poll": {"id": "x"}}');
${expect(`(select meta from public.posts where content = 'fake') = '{}'::jsonb`, "a forged meta.poll is dropped")}
update public.posts set meta = '{"poll": {"id": "x"}}' where content = 'fake';
${expect(`not ((select meta from public.posts where content = 'fake') ? 'poll')`, "meta.poll can't be added later")}
update public.posts set meta = '{}' where content = 'Best rookie of 2024?';
${expect(`(select meta ? 'poll' from public.posts where content = 'Best rookie of 2024?')`, "meta.poll can't be removed")}
${fails(`update public.posts set content = 'Changed' where content = 'Best rookie of 2024?';`, "can't be edited", "editing a poll's text")}
${fails(`update public.posts set image_url = 'https://example.com/a.jpg' where content = 'Best rookie of 2024?';`, "posts_poll_alone", "a photo on a poll post")}
${fails(`perform private.attach_poll((select id from public.posts where content = 'fake'), array['a', 'b'], 60);`, "new post of your own", "a poll on an older post")}
reset role;

-- One vote per user. The author can't vote.
${as(AUTHOR)}
${fails(`perform public.vote_in_poll(${OPTION(0)});`, "your own poll", "the author voting")}
${fails(`insert into public.poll_votes (poll_id, option_id, user_id) values (${POLL}, ${OPTION(0)}, '${AUTHOR}');`, "your own poll", "the author inserting a vote")}
${as(VOTER)}
${fails(`insert into public.poll_votes (poll_id, option_id, user_id) values (${POLL}, ${OPTION(0)}, '${LATE}');`, "row-level security", "voting as someone else")}
select * from public.vote_in_poll(${OPTION(1)});
${fails(`perform public.vote_in_poll(${OPTION(0)});`, "already voted", "a second vote")}
${fails(`perform public.vote_in_poll(${OPTION(1)});`, "already voted", "the same vote twice")}
${fails(`update public.poll_votes set option_id = ${OPTION(0)};`, "permission denied", "changing a vote")}
${fails(`delete from public.poll_votes;`, "permission denied", "taking a vote back")}
${expect(`(select viewer_option_id from public.poll_results(array[${POLL}])) = ${OPTION(1)}`, "the voter sees their choice")}
${as(BLOCKED)}
${fails(`perform public.vote_in_poll(${OPTION(0)});`, "unavailable", "a blocked account voting")}
${as(LATE)}
${expect(`(select count(*) from public.poll_votes) = 0`, "votes are private")}
${expect(`(select viewer_option_id from public.poll_results(array[${POLL}])) is null`, "no choice before voting")}
${as(null)}
${expect(`(select total_votes from public.poll_results(array[${POLL}])) = 1`, "signed out sees the count")}
${fails(`perform public.vote_in_poll(${OPTION(0)});`, "permission denied", "voting signed out")}
reset role;
${expect(`(select vote_count from public.poll_options where id = ${OPTION(1)}) = 1`, "the count went up")}

-- After the poll ends, votes are refused.
update public.polls set created_at = now() - interval '2 days', ends_at = now() - interval '1 minute' where id = ${POLL};
${as(LATE)}
${fails(`perform public.vote_in_poll(${OPTION(0)});`, "has ended", "a vote after the end")}
${fails(`insert into public.poll_votes (poll_id, option_id, user_id) values (${POLL}, ${OPTION(0)}, '${LATE}');`, "has ended", "a direct insert after the end")}

-- The author hears about it once.
${as(VOTER)}
${expect(`public.settle_ended_polls() = 0`, "someone else can't settle the author's poll")}
${as(AUTHOR)}
${expect(`public.settle_ended_polls() = 1`, "the author's ended poll is settled")}
${expect(`public.settle_ended_polls() = 0`, "only once")}
${expect(`exists (select 1 from public.notifications where kind = 'poll_ended' and recipient_id = '${AUTHOR}' and actor_id is null and preview = 'Best rookie of 2024?' and (metadata ->> 'votes')::int = 1)`, "a poll_ended notice")}
reset role;

-- Deleting a voter takes their vote off the count. Deleting the post removes the poll.
delete from public.profiles where id = '${VOTER}';
${expect(`(select total_votes from public.polls where id = ${POLL}) = 0 and (select vote_count from public.poll_options where id = ${OPTION(1)}) = 0`, "a deleted voter's vote comes off")}
${as(AUTHOR)}
delete from public.posts where content = 'Seven days is fine';
reset role;
${expect(`(select count(*) from public.polls) = 2`, "the poll went with its post")}
`;

describe("polls migration (postgres)", () => {
  const stops: (() => void)[] = [];
  after(() => {
    for (const stop of stops) stop();
  });

  it("creates polls, enforces the rules on the server, and counts votes at once correctly", async () => {
    const db = await startPostgres("polls-pg-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.runFile(join(process.cwd(), MIGRATION), "migration");
    db.runFile(join(process.cwd(), MIGRATION), "migration again");
    db.run(behaviorSql, "behavior");

    // A fresh poll, then 40 people vote at the same moment. Each holds its
    // transaction open a little so the votes really overlap. One of them
    // also tries to vote twice at once.
    db.run(
      `${as(AUTHOR)} select public.create_poll_post('Rush hour', array['Left', 'Right', 'Up'], 60);`,
      "crowd poll",
    );
    const option = (position: number) =>
      `(select o.id from public.poll_options o join public.polls p on p.id = o.poll_id join public.posts po on po.id = p.post_id where po.content = 'Rush hour' and o.position = ${position})`;
    const scripts = CROWD.map(
      (id, index) => `${as(id)}
begin;
select count(*) from public.vote_in_poll(${option(index % 3)});
select pg_sleep(0.02);
commit;`,
    );
    scripts.push(`${as(CROWD[0]!)}
begin;
select count(*) from public.vote_in_poll(${option(2)});
commit;`);
    const results = await db.runAtOnce(scripts);
    const failed = results.filter((result) => result.status !== 0);
    assert.equal(failed.length, 1, "exactly one double vote is refused");
    assert.match(failed[0]!.stderr, /already voted/);

    db.run(
      `
${expect(`(select count(*) from public.poll_votes v join public.polls p on p.id = v.poll_id join public.posts po on po.id = p.post_id where po.content = 'Rush hour') = 40`, "40 votes stored")}
${expect(`(select total_votes from public.polls p join public.posts po on po.id = p.post_id where po.content = 'Rush hour') = 40`, "the total is exact")}
${expect(`not exists (
  select 1 from public.poll_options o
  where o.vote_count <> (select count(*) from public.poll_votes v where v.option_id = o.id)
)`, "every choice's count matches its votes")}
`,
      "crowd counts",
    );
  });
});
