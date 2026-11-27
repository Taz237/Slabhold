import assert from "node:assert/strict";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { startPostgres } from "@/lib/test/postgres";

const MIGRATION = "supabase/migrations/20261127200000_vouches.sql";
const UNDO = "supabase/undo/20261127200000_vouches_undo.sql";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Made-up collectors. Nobody here is a real account.
const ALICE = id(1); // an old account that vouches
const BOB = id(2); // an old account that gets vouched
const ONEWAY = id(3); // Alice messaged them; they never wrote back
const FRESHCHAT = id(4); // two-way chat with Alice that started 2 hours ago
const NEWBIE = id(5); // a 2-day-old account
const BLOCKER = id(6); // blocked Alice
const BANNED = id(7); // suspended from the start
const SOON = id(8); // vouches Bob, then gets suspended
const TESTER = id(9); // a test account
const TESTER2 = id(10); // another test account
const CAROL = id(11);
const DAN = id(12);
const EVE = id(13);
const FAN = id(14); // follows Carol and Eve
const RATER = id(15); // leaves a lot of vouches
const CON = id(16); // the subject of 20 upserts at once
const STRANGER = id(17); // messaged nobody
const LEAVER = id(18); // deletes their account
const RATED = Array.from({ length: 11 }, (_, index) => id(100 + index));

const EVERYONE: [string, string, string, boolean][] = [
  [ALICE, "alice", "30 days", false],
  [BOB, "bob", "30 days", false],
  [ONEWAY, "oneway", "30 days", false],
  [FRESHCHAT, "freshchat", "30 days", false],
  [NEWBIE, "newbie", "2 days", false],
  [BLOCKER, "blocker", "30 days", false],
  [BANNED, "banned", "30 days", false],
  [SOON, "soon", "30 days", false],
  [TESTER, "tester", "30 days", true],
  [TESTER2, "tester2", "30 days", true],
  [CAROL, "carol", "30 days", false],
  [DAN, "dan", "30 days", false],
  [EVE, "eve", "30 days", false],
  [FAN, "fan", "30 days", false],
  [RATER, "rater", "30 days", false],
  [CON, "con", "30 days", false],
  [STRANGER, "stranger", "30 days", false],
  [LEAVER, "leaver", "30 days", false],
  ...RATED.map((uid, index): [string, string, string, boolean] => [uid, `rated${index}`, "30 days", false]),
];

/** A message each way, the first one `age` ago. */
const chat = (a: string, b: string, age = "3 days") => `
insert into public.messages (sender_id, receiver_id, content, created_at) values
  ('${a}', '${b}', 'Still have that card?', now() - interval '${age}'),
  ('${b}', '${a}', 'Yes, it is yours.', now() - interval '${age}' + interval '1 minute');`;

const LIVE_KINDS = `'like', 'comment', 'follow', 'repost', 'mention', 'quote', 'want_alert', 'deal_confirm', 'dm_reaction', 'poll_ended'`;

/** The live private.set_report_target body, before this migration. */
const LIVE_SET_REPORT_TARGET = `
create or replace function private.set_report_target()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare target uuid; author uuid;
begin
  if new.target_type is null or new.target_id is null then raise exception 'Report target is missing' using errcode = '22023'; end if;
  if new.target_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Report target not found' using errcode = 'P0002'; end if;
  target := new.target_id::uuid;
  case new.target_type
    when 'post' then select p.user_id into author from public.posts as p where p.id = target;
    when 'reply' then select c.user_id into author from public.comments as c where c.id = target;
    when 'message' then select m.sender_id into author from public.messages as m where m.id = target;
    when 'user' then select u.id into author from auth.users as u where u.id = target;
    else raise exception 'Unknown report target type %', new.target_type using errcode = '22023';
  end case;
  if author is null then raise exception 'Report target not found' using errcode = 'P0002'; end if;
  new.reported_user_id := author;
  return new;
end;
$$;`;

/** profiles, messages, follows, blocks, deals, notifications and reports as production has them where this migration touches them. */
const setupSql = `
create schema if not exists auth;
create schema if not exists private;
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public, private, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table auth.users (id uuid primary key, banned_until timestamptz);
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  accent text not null default '#7c5cff',
  created_at timestamptz not null default now(),
  is_test boolean not null default false
);
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  primary key (follower_id, following_id)
);
create table public.blocks (blocker_id uuid not null, blocked_id uuid not null, primary key (blocker_id, blocked_id));
create table public.posts (id uuid primary key default gen_random_uuid(), user_id uuid not null, content text not null default '');
create table public.comments (id uuid primary key default gen_random_uuid(), post_id uuid, user_id uuid not null, body text not null default '');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read boolean not null default false,
  kind text not null default 'text',
  card_preview jsonb,
  constraint messages_not_self check (sender_id <> receiver_id)
);
create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index messages_receiver_idx on public.messages (receiver_id, created_at desc);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'sale',
  price_cents integer,
  status text not null,
  confirmed_at timestamptz
);

create or replace function private.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select a is not null and b is not null and a <> b and exists (
  select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)) $$;
grant execute on function private.is_blocked(uuid, uuid) to anon, authenticated;

create or replace function private.is_suspended(uid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select u.banned_until is not null and u.banned_until > now() from auth.users as u where u.id = uid), false) $$;
revoke all on function private.is_suspended(uuid) from public, anon, authenticated;

-- The word filter that post text goes through in production.
create or replace function private.blocked_text(value text)
returns boolean language sql immutable
as $$ select coalesce(value ~* 'badword', false) $$;
revoke all on function private.blocked_text(text) from public, anon, authenticated;

-- Clients can only write the kinds this knows. Anything else is refused.
create or replace function private.notification_insert_allowed(kind text, post_id uuid, recipient_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select kind in ('like', 'comment', 'follow', 'repost', 'mention') $$;
grant execute on function private.notification_insert_allowed(text, uuid, uuid) to authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  post_id uuid,
  href text,
  preview text,
  metadata jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_kind check (kind in (${LIVE_KINDS})),
  check (actor_id is null or actor_id <> recipient_id)
);
alter table public.notifications enable row level security;
create policy "Read own notifications" on public.notifications for select using (auth.uid() = recipient_id);
create policy "Create notifications as yourself" on public.notifications for insert with check (
  auth.uid() = actor_id
  and actor_id <> recipient_id
  and not private.is_blocked(auth.uid(), recipient_id)
  and private.notification_insert_allowed(kind, post_id, recipient_id)
  and href is null
  and metadata is null
);
grant select, insert on public.notifications to authenticated;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_type text not null constraint reports_target_type_check check (target_type in ('post', 'reply', 'user')),
  target_id text not null,
  reported_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
alter table public.reports enable row level security;
create policy "Insert own reports" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "Read own reports" on public.reports for select using (auth.uid() = reporter_id);
grant select, insert on public.reports to authenticated;

${LIVE_SET_REPORT_TARGET}
create trigger set_report_target before insert on public.reports
  for each row execute function private.set_report_target();

create or replace function private.cap_reports()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.reports as r where r.reporter_id = new.reporter_id and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'You''ve sent a lot of reports today. Try again tomorrow' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger cap_reports before insert on public.reports
  for each row execute function private.cap_reports();

insert into auth.users (id, banned_until) values
  ${EVERYONE.map(([uid]) => `('${uid}', ${uid === BANNED ? "now() + interval '30 days'" : "null"})`).join(",\n  ")};
insert into public.profiles (id, username, display_name, created_at, is_test) values
  ${EVERYONE.map(([uid, name, age, test]) => `('${uid}', '${name}', '${name}', now() - interval '${age}', ${test})`).join(",\n  ")};

${chat(ALICE, BOB)}
insert into public.messages (sender_id, receiver_id, content, created_at) values
  ('${ALICE}', '${ONEWAY}', 'Hello?', now() - interval '3 days');
${chat(ALICE, FRESHCHAT, "2 hours")}
${chat(ALICE, NEWBIE)}
${chat(ALICE, BLOCKER)}
${chat(BANNED, BOB)}
${chat(SOON, BOB)}
${chat(ALICE, TESTER)}
${chat(TESTER, TESTER2)}
${chat(CAROL, BOB)}
${chat(DAN, BOB)}
${chat(EVE, BOB)}
${chat(ALICE, CON)}
${chat(LEAVER, BOB)}
${chat(BOB, LEAVER, "2 days")}
${RATED.map((uid) => chat(RATER, uid)).join("")}

insert into public.blocks (blocker_id, blocked_id) values ('${BLOCKER}', '${ALICE}');
insert into public.follows (follower_id, following_id) values ('${FAN}', '${CAROL}'), ('${FAN}', '${EVE}'), ('${FAN}', '${BOB}');
-- Eve and Bob logged a deal. Carol and Bob only started one.
insert into public.deals (seller_id, buyer_id, price_cents, status, confirmed_at) values
  ('${BOB}', '${EVE}', 123456, 'confirmed', now() - interval '1 day'),
  ('${CAROL}', '${BOB}', 654321, 'pending', null);
`;

function quoted(why: string) {
  return why.replace(/'/g, "''");
}

/** The statement must be refused with this hint (or, with no hint, a message that includes `code`). */
function refused(statement: string, code: string, why: string) {
  return `
do $$
declare
  got_hint text;
begin
  begin
    ${statement}
    raise exception 'ALLOWED: ${quoted(why)}';
  exception
    when others then
      if sqlerrm like 'ALLOWED:%' then raise; end if;
      get stacked diagnostics got_hint = pg_exception_hint;
      if coalesce(got_hint, '') <> '${quoted(code)}' and position('${quoted(code)}' in sqlerrm) = 0 then
        raise exception 'WRONG ERROR for ${quoted(why)}: % (hint %)', sqlerrm, got_hint;
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
    ? `reset role; set role authenticated; select set_config('app.user_id', '${user}', false);`
    : `reset role; set role anon; select set_config('app.user_id', '', false);`;
}

/** Back to the database owner, signed out: for looking at tables directly. */
const owner = `reset role; select set_config('app.user_id', '', false);`;

const vouch = (subject: string, rating = "positive", note = "") =>
  `perform public.upsert_vouch('${subject}', '${rating}', '${quoted(note)}');`;
const VOUCH = (voucher: string, subject: string) => `private.test_vouch_id('${voucher}', '${subject}')`;
const summary = (subject: string, column: string) =>
  `(select s.${column} from public.vouch_summaries(array['${subject}']::uuid[]) s)`;
const listed = (subject: string, rating = "null") => `(select count(*) from public.list_vouches('${subject}', ${rating}))`;

const behaviorSql = `
-- ---------------------------------------------------------------------------
-- The rules: who can vouch
-- ---------------------------------------------------------------------------
${as(ALICE)}
${expect(`(select can_vouch and reason is null and my_vouch_id is null from public.vouch_status('${BOB}'))`, "Alice can vouch for Bob")}
${refused(vouch(ALICE), "vouch_self", "yourself")}
${expect(`(select reason from public.vouch_status('${ALICE}')) = 'vouch_self'`, "status: yourself")}
${refused(vouch(ONEWAY), "vouch_no_conversation", "they never wrote back")}
${refused(vouch(STRANGER), "vouch_no_conversation", "no messages at all")}
${refused(vouch(FRESHCHAT), "vouch_conversation_too_new", "the chat started 2 hours ago")}
${refused(vouch(NEWBIE), "vouch_too_new_subject", "the subject's account is 2 days old")}
${refused(vouch(BLOCKER), "vouch_blocked", "they blocked Alice")}
${expect(`(select not can_vouch and reason = 'vouch_blocked' from public.vouch_status('${BLOCKER}'))`, "status: blocked")}
${refused(vouch(TESTER), "vouch_test_mismatch", "a real account vouching a test account")}
${refused(vouch(id(999)), "vouch_not_found", "nobody has that id")}
${refused(vouch(BOB, "great"), "vouch_rating", "a rating that isn't one of the three")}

${as(ONEWAY)}
${refused(vouch(ALICE), "vouch_no_conversation", "one-way the other way round")}
${as(NEWBIE)}
${refused(vouch(ALICE), "vouch_too_new_voucher", "the voucher's account is 2 days old")}
${as(BLOCKER)}
${refused(vouch(ALICE), "vouch_blocked", "the blocker can't vouch either")}
${as(BANNED)}
${refused(vouch(BOB), "vouch_suspended", "a suspended account")}
${as(TESTER)}
${refused(vouch(ALICE), "vouch_test_mismatch", "a test account vouching a real one")}
do $$ begin ${vouch(TESTER2)} end $$;
${as(null)}
${refused(vouch(BOB), "permission denied", "signed out: no grant on upsert_vouch")}
${refused(`perform public.vouch_status('${BOB}');`, "permission denied", "signed out: no grant on vouch_status")}
${refused(`perform public.delete_vouch('${BOB}');`, "permission denied", "signed out: no grant on delete_vouch")}
${refused(`perform public.reply_to_vouch('${id(999)}', 'hi');`, "permission denied", "signed out: no grant on reply_to_vouch")}

-- ---------------------------------------------------------------------------
-- The note
-- ---------------------------------------------------------------------------
${as(ALICE)}
${refused(vouch(BOB, "neutral", ""), "vouch_note_required", "neutral with no reason")}
${refused(vouch(BOB, "negative", "too short"), "vouch_note_required", "negative with a 9-character reason")}
${refused(vouch(BOB, "neutral", "   short    "), "vouch_note_required", "padding doesn't count")}
${refused(vouch(BOB, "positive", "x".repeat(281)), "vouch_note_too_long", "281 characters")}
${refused(vouch(BOB, "positive", "Total BadWord of a deal"), "vouch_word_filter", "the word filter")}

-- ---------------------------------------------------------------------------
-- Create, edit, remove
-- ---------------------------------------------------------------------------
do $$ begin ${vouch(BOB, "positive", "  Shipped fast, card as shown.  ")} end $$;
${expect(`(select can_vouch and my_rating = 'positive' and my_note = 'Shipped fast, card as shown.' and my_vouch_id = ${VOUCH(ALICE, BOB)} from public.vouch_status('${BOB}'))`, "status shows the vouch Alice left, trimmed")}
${owner}
${expect(`(select edited_at is null and note = 'Shipped fast, card as shown.' from public.vouches where voucher_id = '${ALICE}' and subject_id = '${BOB}')`, "stored trimmed, not edited yet")}
${expect(`(select count(*) from public.notifications where kind = 'vouch' and recipient_id = '${BOB}' and actor_id = '${ALICE}'
  and href = '/u/bob/vouches' and metadata ->> 'rating' = 'positive' and (metadata ->> 'vouch_id')::uuid = ${VOUCH(ALICE, BOB)}) = 1`, "Bob got one 'vouch' notice with the id, the rating and the link")}

${as(ALICE)}
-- The same again is not an edit.
do $$ begin ${vouch(BOB, "positive", "Shipped fast, card as shown.")} end $$;
${owner}
${expect(`(select edited_at is null from public.vouches where voucher_id = '${ALICE}' and subject_id = '${BOB}')`, "saving the same thing doesn't mark it edited")}
${as(ALICE)}
do $$ begin ${vouch(BOB, "positive", "x".repeat(280))} end $$;
do $$ begin ${vouch(BOB, "neutral", "Slow to ship, but it arrived.")} end $$;
${owner}
${expect(`(select count(*) from public.vouches where voucher_id = '${ALICE}') = 1`, "still one vouch for the pair")}
${expect(`(select rating = 'neutral' and edited_at is not null and updated_at >= created_at from public.vouches where voucher_id = '${ALICE}' and subject_id = '${BOB}')`, "the edit landed and is marked")}
${expect(`(select count(*) from public.notifications where kind = 'vouch' and recipient_id = '${BOB}' and actor_id = '${ALICE}') = 1`, "an edit never notifies again")}
${expect(`(select metadata ->> 'rating' from public.notifications where kind = 'vouch' and actor_id = '${ALICE}' and recipient_id = '${BOB}') = 'positive'`, "the notice is left as first written")}

${as(ALICE)}
select public.delete_vouch('${BOB}');
${refused(`perform public.delete_vouch('${BOB}');`, "vouch_not_found", "nothing left to remove")}
${owner}
${expect(`(select count(*) from public.vouches where voucher_id = '${ALICE}') = 0`, "removed")}
${expect(`(select count(*) from public.notifications where kind = 'vouch' and actor_id = '${ALICE}') = 0`, "its notice went with it")}
${as(ALICE)}
do $$ begin ${vouch(BOB, "positive", "Shipped fast, card as shown.")} end $$;
${owner}
${expect(`(select count(*) from public.notifications where kind = 'vouch' and recipient_id = '${BOB}' and actor_id = '${ALICE}') = 1`, "leaving it again notifies once")}

-- ---------------------------------------------------------------------------
-- No direct reads or writes
-- ---------------------------------------------------------------------------
${[ALICE, null]
  .map(
    (who) => `
${as(who)}
${refused(`perform 1 from public.vouches;`, "permission denied", "direct select")}
${refused(`insert into public.vouches (voucher_id, subject_id, rating) values ('${CAROL}', '${BOB}', 'positive');`, "permission denied", "direct insert")}
${refused(`update public.vouches set rating = 'negative', note = 'changed by hand';`, "permission denied", "direct update")}
${refused(`delete from public.vouches;`, "permission denied", "direct delete")}
${refused(`perform 1 from private.vouch_log;`, "permission denied", "direct read of the limit log")}
${refused(`perform private.vouch_refusal('${ALICE}', '${BOB}');`, "permission denied", "the rule function is not callable")}`,
  )
  .join("")}
-- Even with a grant and a policy added by mistake later, the trigger still refuses.
${owner}
grant select, insert, update, delete on public.vouches to authenticated;
create policy "mistake" on public.vouches for all to authenticated using (true) with check (true);
${as(CAROL)}
${refused(`insert into public.vouches (voucher_id, subject_id, rating) values ('${CAROL}', '${BOB}', 'positive');`, "permission denied for table vouches", "direct insert with a grant")}
${refused(`update public.vouches set note = 'changed by hand';`, "permission denied for table vouches", "direct update with a grant")}
${refused(`delete from public.vouches;`, "permission denied for table vouches", "direct delete with a grant")}
${owner}
drop policy "mistake" on public.vouches;
revoke all on public.vouches from authenticated;
${expect(`(select count(*) from public.vouches) = 2`, "nothing changed: Alice's vouch and the test pair's")}

-- Clients still can't write the new notices themselves.
${as(ALICE)}
${refused(`insert into public.notifications (recipient_id, actor_id, kind) values ('${CAROL}', '${ALICE}', 'vouch');`, "row-level security", "a forged vouch notice")}
${refused(`insert into public.notifications (recipient_id, actor_id, kind) values ('${CAROL}', '${ALICE}', 'vouch_reply');`, "row-level security", "a forged reply notice")}

-- ---------------------------------------------------------------------------
-- Replies: the subject, once, and they can edit or remove it
-- ---------------------------------------------------------------------------
${as(ALICE)}
${refused(`perform public.reply_to_vouch(${VOUCH(ALICE, BOB)}, 'Replying to my own vouch');`, "vouch_not_yours", "the voucher can't reply")}
${as(CAROL)}
${refused(`perform public.reply_to_vouch(${VOUCH(ALICE, BOB)}, 'Not my vouch');`, "vouch_not_yours", "a third person can't reply")}
${as(BOB)}
${refused(`perform public.reply_to_vouch('${id(999)}', 'No such vouch');`, "vouch_not_found", "no such vouch")}
${refused(`perform public.reply_to_vouch(${VOUCH(ALICE, BOB)}, '${"x".repeat(281)}');`, "vouch_note_too_long", "a 281-character reply")}
${refused(`perform public.reply_to_vouch(${VOUCH(ALICE, BOB)}, 'badword to you too');`, "vouch_word_filter", "the word filter on replies")}
select public.reply_to_vouch(${VOUCH(ALICE, BOB)}, '  Thanks, easy deal.  ');
${owner}
${expect(`(select reply = 'Thanks, easy deal.' and reply_at is not null and reply_edited_at is null from public.vouches where id = ${VOUCH(ALICE, BOB)})`, "the reply is stored trimmed")}
${expect(`(select count(*) from public.notifications where kind = 'vouch_reply' and recipient_id = '${ALICE}' and actor_id = '${BOB}'
  and href = '/u/bob/vouches' and (metadata ->> 'vouch_id')::uuid = ${VOUCH(ALICE, BOB)}) = 1`, "Alice got one 'vouch_reply' notice")}
${as(BOB)}
select public.reply_to_vouch(${VOUCH(ALICE, BOB)}, 'Thanks, easy deal. Would trade again.');
${owner}
${expect(`(select reply = 'Thanks, easy deal. Would trade again.' and reply_edited_at is not null from public.vouches where id = ${VOUCH(ALICE, BOB)})`, "a second reply edits the one reply")}
${expect(`(select count(*) from public.notifications where kind = 'vouch_reply' and recipient_id = '${ALICE}') = 1`, "an edited reply never notifies again")}
${as(BOB)}
select public.reply_to_vouch(${VOUCH(ALICE, BOB)}, '   ');
${owner}
${expect(`(select reply is null and reply_at is null and reply_edited_at is null from public.vouches where id = ${VOUCH(ALICE, BOB)})`, "an empty reply removes it")}
${expect(`(select count(*) from public.notifications where kind = 'vouch_reply') = 0`, "and its notice")}
${as(BOB)}
select public.reply_to_vouch(${VOUCH(ALICE, BOB)}, 'Thanks, easy deal.');

-- ---------------------------------------------------------------------------
-- Counts, the list and logged deals
-- ---------------------------------------------------------------------------
${as(CAROL)}
do $$ begin ${vouch(BOB, "neutral", "Took a while to reply.")} end $$;
${as(DAN)}
do $$ begin ${vouch(BOB, "negative", "Card had a corner ding.")} end $$;
${as(EVE)}
do $$ begin ${vouch(BOB, "positive", "")} end $$;
${as(SOON)}
do $$ begin ${vouch(BOB, "positive", "Great packaging.")} end $$;

${[FAN, null]
  .map(
    (who) => `
${as(who)}
${expect(`(select total = 5 and positive = 3 and neutral = 1 and negative = 1 and last_vouch_at is not null from public.vouch_summaries(array['${BOB}']::uuid[]))`, "Bob: 5 vouches, 3 positive, 1 neutral, 1 negative")}
${expect(`(select positive * 100 / (positive + negative) from public.vouch_summaries(array['${BOB}']::uuid[])) = 75`, "percent positive leaves neutral out: 3 of 4")}
${expect(`${listed(BOB)} = 5 and ${listed(BOB, "'positive'")} = 3 and ${listed(BOB, "'neutral'")} = 1 and ${listed(BOB, "'negative'")} = 1`, "the list and its filters")}`,
  )
  .join("")}
${as(FAN)}
${expect(`${summary(BOB, "followed_count")} = 2 and ${summary(BOB, "followed_sample_username")} = 'eve'`, "Fan follows two of Bob's vouchers; the newest is the sample")}
${as(null)}
${expect(`${summary(BOB, "followed_count")} = 0 and ${summary(BOB, "followed_sample_username")} is null`, "signed out: no followed vouchers")}
${expect(`(select count(*) = 3 and bool_and(total = 0 or user_id = '${BOB}') from public.vouch_summaries(array['${BOB}', '${STRANGER}', '${STRANGER}', '${id(999)}']::uuid[]))`, "one row per profile asked for, zeros when there are none")}
${expect(`(select count(*) from public.vouch_summaries('{}'::uuid[])) = 0 and (select count(*) from public.vouch_summaries(null)) = 0`, "an empty ask is an empty answer (the app's probe)")}
${refused(`perform public.vouch_summaries((select array_agg(gen_random_uuid()) from generate_series(1, 51)));`, "vouch_too_many", "51 profiles at once")}
${expect(`(select count(*) from public.vouch_summaries((select array_agg(gen_random_uuid()) from generate_series(1, 50)))) = 50`, "50 is fine")}
${refused(`perform public.list_vouches('${BOB}', 'great');`, "vouch_rating", "a filter that isn't a rating")}

${expect(`(select l.has_logged_deal from public.list_vouches('${BOB}') l where l.voucher_username = 'eve')`, "Eve and Bob confirmed a deal")}
${expect(`(select not bool_or(l.has_logged_deal) from public.list_vouches('${BOB}') l where l.voucher_username <> 'eve')`, "a pending deal, or none, is not a logged deal")}
${expect(`(select bool_and(not (to_jsonb(l) ? 'price_cents') and to_jsonb(l)::text not like '%123456%' and to_jsonb(l)::text not like '%654321%') from public.list_vouches('${BOB}') l)`, "no price ever comes back")}
${expect(`(select l.reply = 'Thanks, easy deal.' and l.reply_at is not null and l.voucher_display_name = 'alice' and l.voucher_accent = '#7c5cff' and l.voucher_created_at is not null from public.list_vouches('${BOB}') l where l.voucher_id = '${ALICE}')`, "a row carries the reply and who left it")}
${expect(`(select l.voucher_vouch_total from public.list_vouches('${TESTER2}') l) = 0 and (select count(*) from public.list_vouches('${TESTER2}')) = 1`, "the voucher's own vouch count rides along")}

-- Hidden by a moderator (the service role): out of every count and list.
reset role; set role service_role;
${refused(`perform 1 from public.vouches;`, "permission denied", "this migration grants the service role nothing new (Supabase's default grants cover it in production)")}
${owner}
update public.vouches set reply_hidden_at = now() where id = ${VOUCH(ALICE, BOB)};
${as(null)}
${expect(`(select l.reply is null and l.reply_at is null from public.list_vouches('${BOB}') l where l.voucher_id = '${ALICE}')`, "a hidden reply is not shown")}
${owner}
update public.vouches set hidden_at = now(), hidden_by = '${FAN}' where id = ${VOUCH(DAN, BOB)};
${as(null)}
${expect(`${summary(BOB, "total")} = 4 and ${summary(BOB, "negative")} = 0 and ${listed(BOB)} = 4 and ${listed(BOB, "'negative'")} = 0`, "a hidden vouch drops out")}
${as(BOB)}
${refused(`perform public.reply_to_vouch(${VOUCH(DAN, BOB)}, 'About that ding');`, "vouch_not_found", "no replying to a hidden vouch")}
${owner}
update public.vouches set hidden_at = null, hidden_by = null where id = ${VOUCH(DAN, BOB)};

-- A voucher who gets suspended: their vouches drop out, and they can't edit.
update auth.users set banned_until = now() + interval '7 days' where id = '${SOON}';
${as(null)}
${expect(`${summary(BOB, "total")} = 4 and ${summary(BOB, "positive")} = 2 and ${listed(BOB)} = 4`, "a suspended voucher's vouch drops out")}
${as(SOON)}
${refused(vouch(BOB, "negative", "Changed my mind entirely."), "vouch_suspended", "a suspended voucher can't edit")}
${expect(`(select not can_vouch and reason = 'vouch_suspended' from public.vouch_status('${BOB}'))`, "status: suspended")}
${owner}
update auth.users set banned_until = now() - interval '1 minute' where id = '${SOON}';
${as(null)}
${expect(`${summary(BOB, "total")} = 5`, "and they come back when the suspension ends")}

-- A block after vouching: the blocked reader no longer sees that vouch, and the pair can't edit or reply.
${owner}
insert into public.blocks (blocker_id, blocked_id) values ('${FAN}', '${CAROL}');
${as(FAN)}
${expect(`${listed(BOB)} = 4 and not exists (select 1 from public.list_vouches('${BOB}') l where l.voucher_id = '${CAROL}')`, "Fan blocked Carol: her vouch is gone from Fan's list")}
${as(CAROL)}
${expect(`${listed(BOB)} = 5`, "Carol still sees the list")}
${as(null)}
${expect(`${listed(BOB)} = 5`, "and so does a signed-out reader")}
${owner}
delete from public.blocks where blocker_id = '${FAN}';
insert into public.blocks (blocker_id, blocked_id) values ('${BOB}', '${CAROL}');
${as(CAROL)}
${refused(vouch(BOB, "negative", "Blocked me after the deal."), "vouch_blocked", "no editing across a block")}
${as(BOB)}
${refused(`perform public.reply_to_vouch(${VOUCH(CAROL, BOB)}, 'That is not what happened');`, "vouch_blocked", "no replying across a block")}
${expect(`not exists (select 1 from public.list_vouches('${BOB}') l where l.voucher_id = '${CAROL}')`, "Bob no longer sees the vouch from the person he blocked")}
${owner}
delete from public.blocks where blocker_id = '${BOB}';

-- ---------------------------------------------------------------------------
-- Paging: newest first, and stable when created_at is the same
-- ---------------------------------------------------------------------------
update public.vouches set created_at = '2026-11-01 12:00:00+00' where subject_id = '${BOB}';
${as(null)}
${expect(`(select count(*) from public.list_vouches('${BOB}', null, null, null, 2)) = 2`, "a page of 2")}
${expect(`(select count(*) from public.list_vouches('${BOB}', null, null, null, 500)) = 5 and (select count(*) from public.list_vouches('${BOB}', null, null, null, 0)) = 1`, "the page size is kept between 1 and 50")}
do $$
declare
  seen uuid[] := '{}';
  last_created timestamptz;
  last_id uuid;
  r record;
  got integer;
  pages integer := 0;
begin
  loop
    got := 0;
    for r in select * from public.list_vouches('${BOB}', null, last_created, last_id, 2) loop
      if r.id = any (seen) then raise exception 'FAILED: paging repeated a vouch'; end if;
      if last_id is not null and r.id >= last_id then raise exception 'FAILED: paging went out of order'; end if;
      seen := seen || r.id;
      last_created := r.created_at;
      last_id := r.id;
      got := got + 1;
    end loop;
    exit when got = 0;
    pages := pages + 1;
  end loop;
  if cardinality(seen) <> 5 or pages <> 3 then
    raise exception 'FAILED: paging saw % vouches in % pages', cardinality(seen), pages;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
${as(FAN)}
insert into public.reports (reporter_id, target_type, target_id, reported_user_id, reason)
values ('${FAN}', 'vouch', ${VOUCH(DAN, BOB)}::text, '${FAN}', 'harassment');
insert into public.reports (reporter_id, target_type, target_id, reported_user_id, reason)
values ('${FAN}', 'vouch_reply', ${VOUCH(ALICE, BOB)}::text, '${FAN}', 'harassment');
${expect(`(select reported_user_id from public.reports where target_type = 'vouch') = '${DAN}'`, "a reported vouch is about its voucher, whatever the client sent")}
${expect(`(select reported_user_id from public.reports where target_type = 'vouch_reply') = '${BOB}'`, "a reported reply is about the subject who wrote it")}
${refused(`insert into public.reports (reporter_id, target_type, target_id, reported_user_id, reason) values ('${FAN}', 'vouch', '${id(999)}', '${FAN}', 'spam');`, "Report target not found", "a vouch that doesn't exist")}
${refused(`insert into public.reports (reporter_id, target_type, target_id, reported_user_id, reason) values ('${FAN}', 'vouch_reply', ${VOUCH(DAN, BOB)}::text, '${FAN}', 'spam');`, "Report target not found", "a vouch with no reply")}
${refused(`insert into public.reports (reporter_id, target_type, target_id, reported_user_id, reason) values ('${FAN}', 'vouch', 'not-a-uuid', '${FAN}', 'spam');`, "Report target not found", "an id that isn't one")}
${owner}
${refused(`insert into public.reports (reporter_id, target_type, target_id, reported_user_id, reason) values ('${FAN}', 'message', (select m.id::text from public.messages m limit 1), '${FAN}', 'spam');`, "reports_target_type_check", "'message' is still not a report type")}
${as(FAN)}
insert into public.reports (reporter_id, target_type, target_id, reported_user_id, reason)
values ('${FAN}', 'user', '${DAN}', '${FAN}', 'spam');
${expect(`(select reported_user_id from public.reports where target_type = 'user') = '${DAN}'`, "user reports work as before")}

-- ---------------------------------------------------------------------------
-- The daily limit: 10 new vouches in 24 hours, edits don't count
-- ---------------------------------------------------------------------------
${as(RATER)}
do $$ begin
${RATED.slice(0, 10).map((uid) => `  ${vouch(uid)}`).join("\n")}
end $$;
${refused(vouch(RATED[10]!), "vouch_rate_limited", "the 11th new vouch in a day")}
${expect(`(select not can_vouch and reason = 'vouch_rate_limited' from public.vouch_status('${RATED[10]}'))`, "status: over the limit")}
do $$ begin ${vouch(RATED[0]!, "neutral", "Editing is still allowed.")} end $$;
${expect(`(select can_vouch from public.vouch_status('${RATED[0]}'))`, "status: an edit is still allowed")}
select public.delete_vouch('${RATED[1]}');
${refused(vouch(RATED[1]!), "vouch_rate_limited", "removing one doesn't hand the slot back")}
${refused(vouch(RATED[10]!), "vouch_rate_limited", "still over after removing one")}
${owner}
update private.vouch_log set created_at = created_at - interval '25 hours' where voucher_id = '${RATER}';
${as(RATER)}
do $$ begin ${vouch(RATED[10]!)} end $$;
${owner}
${expect(`(select count(*) from private.vouch_log where voucher_id = '${RATER}') = 1`, "a day later the limit is clear and the old log rows are pruned")}

-- ---------------------------------------------------------------------------
-- "8 vouches" beside a voucher: their own visible vouches only
-- ---------------------------------------------------------------------------
${as(BOB)}
do $$ begin ${vouch(ALICE)} end $$;
${as(null)}
${expect(`(select l.voucher_vouch_total from public.list_vouches('${ALICE}') l where l.voucher_id = '${BOB}') = 5`, "Bob, as a voucher, shows his own 5 vouches")}
${owner}
update auth.users set banned_until = now() + interval '7 days' where id = '${SOON}';
${as(null)}
${expect(`(select l.voucher_vouch_total from public.list_vouches('${ALICE}') l where l.voucher_id = '${BOB}') = 4`, "minus the one from a suspended account")}
${owner}
update auth.users set banned_until = null where id = '${SOON}';

-- ---------------------------------------------------------------------------
-- Deleting an account
-- ---------------------------------------------------------------------------
${as(LEAVER)}
do $$ begin ${vouch(BOB, "positive", "Smooth trade.")} end $$;
${as(BOB)}
do $$ begin ${vouch(LEAVER, "positive", "Smooth trade both ways.")} end $$;
select public.reply_to_vouch(${VOUCH(LEAVER, BOB)}, 'Same here.');
${owner}
${expect(`(select count(*) from public.vouches where '${LEAVER}' in (voucher_id, subject_id)) = 2`, "two vouches involve the leaver")}
delete from auth.users where id = '${LEAVER}';
${expect(`(select count(*) from public.vouches where '${LEAVER}' in (voucher_id, subject_id)) = 0`, "deleting the account takes both with it")}
${expect(`(select count(*) from private.vouch_log where voucher_id = '${LEAVER}') = 0`, "and its limit log")}
${expect(`(select count(*) from public.notifications where recipient_id = '${LEAVER}') = 0`, "and the notices sent to it")}
${as(null)}
${expect(`${summary(BOB, "total")} = 5`, "Bob's count is back to 5")}
${owner}
`;

/** Clients can't read the table, so the tests look a vouch's id up through this. */
const testHelperSql = `
create or replace function private.test_vouch_id(a uuid, b uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select v.id from public.vouches v where v.voucher_id = a and v.subject_id = b $$;
grant execute on function private.test_vouch_id(uuid, uuid) to anon, authenticated;
`;

const constraintDef = (table: string, name: string) =>
  `(select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.${table}'::regclass and c.conname = '${name}')`;
const reportFn = `(select pg_get_functiondef('private.set_report_target()'::regprocedure))`;

describe("vouches migration (postgres)", () => {
  const stops: (() => void)[] = [];
  after(() => {
    for (const stop of stops) stop();
  });

  it("enforces every rule on the server, writes each notice once, and undoes cleanly", async () => {
    const db = await startPostgres("vouches-pg-");
    stops.push(db.stop);
    db.run(setupSql, "setup");
    db.run(
      `create table private.before as select ${constraintDef("notifications", "notifications_kind")} as kinds, ${constraintDef("reports", "reports_target_type_check")} as targets, ${reportFn} as fn;`,
      "remember the live constraints and function",
    );
    db.runFile(join(process.cwd(), MIGRATION), "migration");
    db.runFile(join(process.cwd(), MIGRATION), "migration again");
    db.run(testHelperSql, "test helper");
    db.run(behaviorSql, "behavior");

    // 20 upserts of the same vouch at the same moment, each holding its
    // transaction open a little so they really overlap: one row, one notice.
    const scripts = Array.from(
      { length: 20 },
      (_, index) => `${as(ALICE)}
begin;
select public.upsert_vouch('${CON}', '${index % 2 === 0 ? "positive" : "neutral"}', 'Take ${index}: went fine in the end.');
select pg_sleep(0.02);
commit;`,
    );
    const results = await db.runAtOnce(scripts);
    assert.deepEqual(results.filter((result) => result.status !== 0).map((result) => result.stderr), [], "every upsert lands");
    const ids = new Set(results.map((result) => result.stdout.match(/[0-9a-f-]{36}/)?.[0]));
    assert.equal(ids.size, 1, "they all returned the same vouch");
    db.run(
      `
${expect(`(select count(*) from public.vouches where voucher_id = '${ALICE}' and subject_id = '${CON}') = 1`, "one vouch for the pair")}
${expect(`(select count(*) from public.notifications where kind = 'vouch' and recipient_id = '${CON}') = 1`, "one notice")}
${expect(`(select count(*) from private.vouch_log where voucher_id = '${ALICE}') = 3`, "counted once toward the daily limit (with Alice's two vouches on Bob)")}
`,
      "after 20 at once",
    );

    // The undo: refused while vouch notices or reports exist, then everything goes back.
    assert.throws(() => db.runFile(join(process.cwd(), UNDO), "undo with notices"), /Undo refused: vouch notifications still exist/);
    db.run(`delete from public.notifications where kind in ('vouch', 'vouch_reply');`, "the reviewer deletes the notices");
    assert.throws(() => db.runFile(join(process.cwd(), UNDO), "undo with reports"), /Undo refused: reports about vouches still exist/);
    db.run(expect(`to_regclass('public.vouches') is not null and (select count(*) from public.vouches) > 0`, "a refused undo changes nothing"), "still there");
    db.run(`delete from public.reports where target_type in ('vouch', 'vouch_reply');`, "the reviewer deletes the reports");
    db.runFile(join(process.cwd(), UNDO), "undo");
    db.runFile(join(process.cwd(), UNDO), "undo again");
    db.run(
      `
${expect(`(select kinds from private.before) = ${constraintDef("notifications", "notifications_kind")}`, "notifications_kind is the live list again")}
${expect(`(select targets from private.before) = ${constraintDef("reports", "reports_target_type_check")}`, "reports_target_type_check is the live list again")}
${expect(`(select fn from private.before) = ${reportFn}`, "private.set_report_target is the live body again")}
${expect(`to_regclass('public.vouches') is null and to_regclass('private.vouch_log') is null`, "the tables are gone")}
${expect(`to_regclass('public.messages_pair_idx') is null and to_regclass('public.notifications_vouch_once') is null and to_regclass('public.notifications_vouch_reply_once') is null`, "the indexes are gone")}
${expect(`to_regclass('public.messages_sender_idx') is not null and to_regclass('public.messages_receiver_idx') is not null`, "the indexes that were there before are untouched")}
${expect(`not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') and p.proname ~ 'vouch' and p.proname <> 'test_vouch_id')`, "no vouch function is left")}
${refused(`insert into public.notifications (recipient_id, kind) values ('${BOB}', 'vouch');`, "notifications_kind", "the old kind list refuses 'vouch'")}
${as(FAN)}
${refused(`insert into public.reports (reporter_id, target_type, target_id, reported_user_id, reason) values ('${FAN}', 'vouch', '${id(1)}', '${FAN}', 'spam');`, "Unknown report target type vouch", "the old report function refuses 'vouch'")}
insert into public.reports (reporter_id, target_type, target_id, reported_user_id, reason)
values ('${FAN}', 'user', '${CAROL}', '${FAN}', 'spam');
${expect(`(select count(*) from public.reports where target_type = 'user' and reported_user_id = '${CAROL}') = 1`, "user reports still work after the undo")}
${owner}
`,
      "after the undo",
    );

    // And it can go back in after an undo.
    db.runFile(join(process.cwd(), MIGRATION), "migration after the undo");
    db.run(`${as(ALICE)} select public.upsert_vouch('${BOB}', 'positive', '');`, "vouching works again");
  });
});
