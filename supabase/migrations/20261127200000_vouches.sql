-- QA Guard fixed version of PR #353 (head a32576be), 2026-11-27. See review/pr353/qa.md.
-- Ready for Supabase apply_migration: no begin/commit (apply_migration wraps it in one
-- transaction, so set local lock_timeout still applies). For the SQL Editor, paste as-is
-- (the editor runs it as one transaction). Changes vs the PR are marked "QA:".
-- UNAPPLIED. Needs review before running.
-- Do not run supabase db push. Do not apply this with the Supabase CLI.
--
-- Vouches: trade feedback between two collectors who have messaged each other.
--
-- Slabhold has no buying or selling. Collectors DM about cards and do deals
-- outside the app. After a deal, either person can leave one vouch on the
-- other: positive, neutral or negative, plus a short note.
--
-- Tables
--   public.vouches     one row per pair (voucher -> subject): the rating, the
--                      note, the subject's one public reply, and the
--                      moderator hide marks.
--   private.vouch_log  one row per NEW vouch, kept for a day. It is what the
--                      daily limit counts, so removing a vouch and leaving it
--                      again still uses up the limit.
--
-- The numbers (change them in private.vouch_rules below, and in
-- lib/vouches/rules.ts, together)
--   MIN_ACCOUNT_DAYS       7    both accounts must be this old
--   MIN_CHAT_HOURS         24   their first message must be this old
--   NOTE_MAX               280  longest note or reply
--   NOTE_MIN_NON_POSITIVE  10   shortest note on a neutral or negative vouch
--   DAILY_NEW_LIMIT        10   new vouches per voucher per rolling 24 hours
--   SUMMARY_MAX_IDS        50   most profiles in one vouch_summaries call
--   LIST_MAX               50   most rows in one list_vouches page
--   The 280 and the 10 are also written into the table's check constraints.
--
-- Who can do what
--   - Nobody reads or writes public.vouches directly. There are no grants on
--     it, and a trigger refuses any write from anon or authenticated. Every
--     read and write goes through the functions below.
--   - You can vouch for someone only when: you are signed in and not
--     suspended, it isn't yourself, neither of you has blocked the other, you
--     have each sent the other at least one message, the first of those
--     messages is 24 hours old, both accounts are 7 days old, and you are both
--     test accounts or both real ones. private.vouch_refusal holds every rule.
--   - One vouch per pair. The voucher can edit it (edited_at is set) or
--     remove it. Edits don't count toward the daily limit.
--   - A neutral or negative vouch needs a reason of at least 10 characters.
--     Notes and replies go through the same word filter as posts.
--   - The subject can post one public reply per vouch, edit it or remove it.
--   - Vouches from suspended accounts and vouches a moderator hid drop out of
--     every count and list. A signed-in reader never sees a vouch written by
--     someone in a block with them, either way.
--   - Moderators hide a vouch or a reply with the service role (hidden_at,
--     hidden_by, reply_hidden_at). Nothing here grants that to anyone else.
--
-- Notifications
--   'vouch' and 'vouch_reply' are two new, quiet kinds (no push: the push
--   outbox is not touched). upsert_vouch writes one 'vouch' notice to the
--   subject the first time; edits never notify again. reply_to_vouch writes
--   one 'vouch_reply' notice to the voucher for the first reply. Clients
--   still can't write these themselves: private.notification_insert_allowed
--   refuses kinds it doesn't know.
--
-- Reports
--   A vouch or a reply to one can be reported. reports_target_type_check gains
--   'vouch' and 'vouch_reply', and private.set_report_target (live, but not in
--   the repo until now) is re-created with its live body plus those two cases.
--
-- The undo for all of this is supabase/undo/20261127200000_vouches_undo.sql.
--
-- Safe to run twice.

-- QA: no begin/commit; apply_migration wraps the file.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- The numbers, in one place
-- ---------------------------------------------------------------------------

create or replace function private.vouch_rules()
returns table (
  min_account_days integer,
  min_chat_hours integer,
  note_max integer,
  note_min_non_positive integer,
  daily_new_limit integer,
  summary_max_ids integer,
  list_max integer
)
language sql
immutable
set search_path = ''
as $$
  select
    7,    -- MIN_ACCOUNT_DAYS
    24,   -- MIN_CHAT_HOURS
    280,  -- NOTE_MAX (also in vouches_note and vouches_reply below)
    10,   -- NOTE_MIN_NON_POSITIVE (also in vouches_note below)
    10,   -- DAILY_NEW_LIMIT
    50,   -- SUMMARY_MAX_IDS
    50;   -- LIST_MAX
$$;

revoke all on function private.vouch_rules() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.vouches (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.profiles (id) on delete cascade,
  rating text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  reply text,
  reply_at timestamptz,
  reply_edited_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid,
  reply_hidden_at timestamptz,
  constraint vouches_rating check (rating in ('positive', 'neutral', 'negative')),
  -- NOTE_MAX 280, NOTE_MIN_NON_POSITIVE 10.
  constraint vouches_note check (
    pg_catalog.char_length(note) <= 280
    and note = pg_catalog.btrim(note, E' \t\r\n')
    -- QA: no control characters except a line break.
    and note !~ E'[\\x01-\\x09\\x0b-\\x1f\\x7f]'
    and (rating = 'positive' or pg_catalog.char_length(note) >= 10)
  ),
  -- NOTE_MAX 280.
  constraint vouches_reply check (
    reply is null
    or (
      pg_catalog.char_length(reply) between 1 and 280
      and reply = pg_catalog.btrim(reply, E' \t\r\n')
      -- QA: no control characters except a line break.
      and reply !~ E'[\\x01-\\x09\\x0b-\\x1f\\x7f]'
    )
  ),
  constraint vouches_not_self check (voucher_id <> subject_id),
  constraint vouches_one_per_pair unique (voucher_id, subject_id)
);

-- QA: full index (not partial) so deleting a profile can use it for the subject_id FK.
create index if not exists vouches_subject_idx
  on public.vouches (subject_id, created_at desc, id desc);

create index if not exists vouches_voucher_idx
  on public.vouches (voucher_id, created_at desc);

-- "Has a ever messaged b", and when first.
create index if not exists messages_pair_idx
  on public.messages (sender_id, receiver_id, created_at);

-- What the daily limit counts. Rows older than a day are pruned as new ones land.
create table if not exists private.vouch_log (
  voucher_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists vouch_log_voucher_idx
  on private.vouch_log (voucher_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: no policies and no grants. The functions below are the only way in.
-- ---------------------------------------------------------------------------

alter table public.vouches enable row level security;
alter table private.vouch_log enable row level security;

revoke all on table public.vouches from public, anon, authenticated;
revoke all on table private.vouch_log from public, anon, authenticated;

-- QA: moderation (hide a vouch or a reply) runs as service_role. Today it already gets ALL
-- through the postgres default privileges in public; this makes that explicit so it keeps
-- working if those defaults ever change. service_role bypasses RLS, and the direct-write
-- trigger lets it through.
grant select, update, delete on table public.vouches to service_role;

-- Direct writes from API roles are refused even if a grant or a policy is
-- added later. security definer functions run as the owner, not as authenticated.
create or replace function private.reject_direct_vouch_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'permission denied for table vouches'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.reject_direct_vouch_write() from public, anon, authenticated;

drop trigger if exists vouches_reject_direct_write on public.vouches;
create trigger vouches_reject_direct_write
  before insert or update or delete on public.vouches
  for each row
  execute function private.reject_direct_vouch_write();

-- ---------------------------------------------------------------------------
-- The rules
-- ---------------------------------------------------------------------------

-- Why p_voucher can't leave a NEW vouch on p_subject, as a stable code the app
-- maps to its own copy. Null means allowed. Every rule lives here.
create or replace function private.vouch_refusal(p_voucher uuid, p_subject uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rules record;
  voucher_created timestamptz;
  voucher_test boolean;
  subject_created timestamptz;
  subject_test boolean;
  first_message timestamptz;
begin
  select * into rules from private.vouch_rules();

  if p_voucher is null then
    return 'vouch_signed_out';
  end if;
  if p_subject is null then
    return 'vouch_not_found';
  end if;
  if p_voucher = p_subject then
    return 'vouch_self';
  end if;

  select p.created_at, coalesce(p.is_test, false)
  into voucher_created, voucher_test
  from public.profiles p
  where p.id = p_voucher;

  select p.created_at, coalesce(p.is_test, false)
  into subject_created, subject_test
  from public.profiles p
  where p.id = p_subject;

  if voucher_created is null or subject_created is null then
    return 'vouch_not_found';
  end if;
  if private.is_suspended(p_voucher) then
    return 'vouch_suspended';
  end if;
  if private.is_blocked(p_voucher, p_subject) then
    return 'vouch_blocked';
  end if;
  -- Test accounts only vouch test accounts, and real ones only real ones.
  if voucher_test <> subject_test then
    return 'vouch_test_mismatch';
  end if;
  if voucher_created > pg_catalog.now() - pg_catalog.make_interval(days => rules.min_account_days) then
    return 'vouch_too_new_voucher';
  end if;
  if subject_created > pg_catalog.now() - pg_catalog.make_interval(days => rules.min_account_days) then
    return 'vouch_too_new_subject';
  end if;

  -- A message each way.
  if not exists (
       select 1 from public.messages m
       where m.sender_id = p_voucher and m.receiver_id = p_subject
     )
     or not exists (
       select 1 from public.messages m
       where m.sender_id = p_subject and m.receiver_id = p_voucher
     ) then
    return 'vouch_no_conversation';
  end if;

  -- QA: a client can set messages.created_at on insert, so the oldest message of the
  -- pair can be backdated by either person. Use the later of the two people's first
  -- messages: each side's first message to the other must be 24 hours old, and nobody
  -- can backdate the other person's message.
  select greatest(
    (select pg_catalog.min(m.created_at) from public.messages m
      where m.sender_id = p_voucher and m.receiver_id = p_subject),
    (select pg_catalog.min(m.created_at) from public.messages m
      where m.sender_id = p_subject and m.receiver_id = p_voucher)
  )
  into first_message;

  if first_message > pg_catalog.now() - pg_catalog.make_interval(hours => rules.min_chat_hours) then
    return 'vouch_conversation_too_new';
  end if;

  -- New vouches in the last 24 hours, including ones since removed.
  if (
    select pg_catalog.count(*)
    from private.vouch_log l
    where l.voucher_id = p_voucher
      and l.created_at > pg_catalog.now() - interval '24 hours'
  ) >= rules.daily_new_limit then
    return 'vouch_rate_limited';
  end if;

  return null;
end;
$$;

revoke all on function private.vouch_refusal(uuid, uuid) from public, anon, authenticated;

-- Raises a refusal. The hint is what the app reads; the message is a fallback.
create or replace function private.raise_vouch_refusal(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%',
    case p_code
      when 'vouch_self' then 'You can''t vouch for yourself'
      when 'vouch_signed_out' then 'Sign in to vouch'
      when 'vouch_suspended' then 'Your account can''t vouch right now'
      when 'vouch_blocked' then 'You can''t vouch for this account'
      when 'vouch_no_conversation' then 'You can vouch once you''ve both sent each other a message'
      when 'vouch_conversation_too_new' then 'You can vouch 24 hours after you''ve both messaged'
      when 'vouch_too_new_voucher' then 'Your account needs to be 7 days old to vouch'
      when 'vouch_too_new_subject' then 'That account needs to be 7 days old to get vouches'
      when 'vouch_test_mismatch' then 'You can''t vouch for this account'
      when 'vouch_rate_limited' then 'You''ve left a lot of vouches today. Try again tomorrow'
      when 'vouch_not_yours' then 'Only the person a vouch is about can reply to it'
      else 'That vouch is unavailable'
    end
    using errcode = case when p_code = 'vouch_not_found' then 'P0002' else '42501' end,
          hint = p_code;
end;
$$;

revoke all on function private.raise_vouch_refusal(text) from public, anon, authenticated;

-- A note or a reply, trimmed and checked: the length, then the word filter.
create or replace function private.clean_vouch_text(p_text text, p_min integer)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rules record;
  -- QA: Windows line breaks become plain line breaks before the checks.
  body text := pg_catalog.btrim(pg_catalog.replace(coalesce(p_text, ''), E'\r\n', E'\n'), E' \t\r\n');
begin
  select * into rules from private.vouch_rules();

  if pg_catalog.char_length(body) > rules.note_max then
    raise exception 'Keep it to % characters', rules.note_max
      using errcode = '22023', hint = 'vouch_note_too_long';
  end if;
  if pg_catalog.char_length(body) < p_min then
    raise exception 'Add a short reason so others know what happened'
      using errcode = '22023', hint = 'vouch_note_required';
  end if;
  -- QA: no control characters (tab, bell, escape...) except a line break.
  if body ~ E'[\\x01-\\x09\\x0b-\\x1f\\x7f]' then
    raise exception 'Remove the special characters and try again'
      using errcode = '22023', hint = 'vouch_note_chars';
  end if;
  -- The same word filter as post text. QA: called directly (it exists on prod), so a
  -- missing filter fails loudly instead of being skipped.
  if body <> '' and coalesce(private.blocked_text(body), false) then
    raise exception 'This includes words Slabhold doesn''t allow. Edit it and try again'
      using errcode = '23514', hint = 'vouch_word_filter';
  end if;
  return body;
end;
$$;

revoke all on function private.clean_vouch_text(text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notifications: two new kinds, each written once
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_kind;
alter table public.notifications
  add constraint notifications_kind
  check (kind in (
    'like',
    'comment',
    'follow',
    'repost',
    'mention',
    'quote',
    'want_alert',
    'deal_confirm',
    'dm_reaction',
    'poll_ended',
    'vouch',
    'vouch_reply'
  ));

-- One "vouched for you" per pair, however many times the vouch is edited.
create unique index if not exists notifications_vouch_once
  on public.notifications (recipient_id, actor_id)
  where kind = 'vouch';

-- One "replied to your vouch" per vouch.
create unique index if not exists notifications_vouch_reply_once
  on public.notifications (recipient_id, (metadata ->> 'vouch_id'))
  where kind = 'vouch_reply';

-- ---------------------------------------------------------------------------
-- Writing a vouch
-- ---------------------------------------------------------------------------

-- Can the caller vouch for (or edit their vouch on) p_subject, and what they left so far.
create or replace function public.vouch_status(p_subject uuid)
returns table (can_vouch boolean, reason text, my_vouch_id uuid, my_rating text, my_note text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  mine public.vouches%rowtype;
  why text;
begin
  if me is not null then
    select * into mine from public.vouches v where v.voucher_id = me and v.subject_id = p_subject;
  end if;

  if mine.id is not null then
    -- An edit: only a suspension or a block stops it.
    why := case
      when private.is_suspended(me) then 'vouch_suspended'
      when private.is_blocked(me, p_subject) then 'vouch_blocked'
    end;
  else
    why := private.vouch_refusal(me, p_subject);
  end if;

  return query select why is null, why, mine.id, mine.rating, mine.note;
end;
$$;

revoke all on function public.vouch_status(uuid) from public, anon;
grant execute on function public.vouch_status(uuid) to authenticated;

-- Leave a vouch, or change the one you left. Returns its id.
create or replace function public.upsert_vouch(p_subject uuid, p_rating text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  rules record;
  body text;
  existing public.vouches%rowtype;
  why text;
  handle text;
  new_id uuid;
begin
  select * into rules from private.vouch_rules();

  if me is null then
    perform private.raise_vouch_refusal('vouch_signed_out');
  end if;
  if p_rating is null or p_rating not in ('positive', 'neutral', 'negative') then
    raise exception 'Pick positive, neutral or negative'
      using errcode = '22023', hint = 'vouch_rating';
  end if;

  body := private.clean_vouch_text(
    p_note,
    case when p_rating = 'positive' then 0 else rules.note_min_non_positive end
  );

  -- One at a time per voucher: the daily limit and the one-per-pair rule both
  -- see every vouch this person has finished leaving.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vouch:' || me::text, 0));

  select * into existing
  from public.vouches v
  where v.voucher_id = me and v.subject_id = p_subject
  for update;

  if existing.id is not null then
    if private.is_suspended(me) then
      perform private.raise_vouch_refusal('vouch_suspended');
    end if;
    if private.is_blocked(me, p_subject) then
      perform private.raise_vouch_refusal('vouch_blocked');
    end if;
    if existing.rating is distinct from p_rating or existing.note is distinct from body then
      update public.vouches
      set rating = p_rating,
          note = body,
          updated_at = pg_catalog.now(),
          edited_at = pg_catalog.now()
      where id = existing.id;
      -- QA: keep the one "vouched for you" notice's rating current (no new notice).
      update public.notifications n
      set metadata = pg_catalog.jsonb_set(coalesce(n.metadata, '{}'::jsonb), '{rating}', pg_catalog.to_jsonb(p_rating))
      where n.kind = 'vouch' and n.recipient_id = p_subject and n.actor_id = me
        and n.metadata ->> 'rating' is distinct from p_rating;
    end if;
    return existing.id;
  end if;

  why := private.vouch_refusal(me, p_subject);
  if why is not null then
    perform private.raise_vouch_refusal(why);
  end if;

  insert into public.vouches (voucher_id, subject_id, rating, note)
  values (me, p_subject, p_rating, body)
  returning id into new_id;

  delete from private.vouch_log l
  where l.voucher_id = me
    and l.created_at <= pg_catalog.now() - interval '24 hours';
  insert into private.vouch_log (voucher_id) values (me);

  select p.username into handle from public.profiles p where p.id = p_subject;

  insert into public.notifications (recipient_id, actor_id, kind, href, metadata)
  values (
    p_subject,
    me,
    'vouch',
    '/u/' || handle || '/vouches',
    pg_catalog.jsonb_build_object('vouch_id', new_id, 'rating', p_rating)
  )
  on conflict do nothing;

  return new_id;
end;
$$;

revoke all on function public.upsert_vouch(uuid, text, text) from public, anon;
grant execute on function public.upsert_vouch(uuid, text, text) to authenticated;

-- Remove the vouch you left on p_subject, and the notices that pointed at it.
create or replace function public.delete_vouch(p_subject uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  gone uuid;
begin
  if me is null then
    perform private.raise_vouch_refusal('vouch_signed_out');
  end if;

  delete from public.vouches v
  where v.voucher_id = me and v.subject_id = p_subject
  returning v.id into gone;

  if gone is null then
    perform private.raise_vouch_refusal('vouch_not_found');
  end if;

  delete from public.notifications n
  where n.kind = 'vouch' and n.recipient_id = p_subject and n.actor_id = me;

  delete from public.notifications n
  where n.kind = 'vouch_reply' and n.recipient_id = me and n.metadata ->> 'vouch_id' = gone::text;
end;
$$;

revoke all on function public.delete_vouch(uuid) from public, anon;
grant execute on function public.delete_vouch(uuid) to authenticated;

-- The subject's one public reply. An empty reply removes it.
create or replace function public.reply_to_vouch(p_vouch_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target public.vouches%rowtype;
  body text;
  handle text;
begin
  if me is null then
    perform private.raise_vouch_refusal('vouch_signed_out');
  end if;

  select * into target from public.vouches v where v.id = p_vouch_id for update;

  if target.id is null then
    perform private.raise_vouch_refusal('vouch_not_found');
  end if;
  if target.subject_id <> me then
    perform private.raise_vouch_refusal('vouch_not_yours');
  end if;
  -- A vouch a moderator hid is gone for everyone, its subject included.
  if target.hidden_at is not null then
    perform private.raise_vouch_refusal('vouch_not_found');
  end if;

  if pg_catalog.btrim(coalesce(p_reply, ''), E' \t\r\n') = '' then
    update public.vouches
    set reply = null,
        reply_at = null,
        reply_edited_at = null,
        reply_hidden_at = null,
        updated_at = pg_catalog.now()
    where id = target.id;

    delete from public.notifications n
    where n.kind = 'vouch_reply'
      and n.recipient_id = target.voucher_id
      and n.metadata ->> 'vouch_id' = target.id::text;
    return;
  end if;

  if private.is_suspended(me) then
    perform private.raise_vouch_refusal('vouch_suspended');
  end if;
  if private.is_blocked(me, target.voucher_id) then
    perform private.raise_vouch_refusal('vouch_blocked');
  end if;

  body := private.clean_vouch_text(p_reply, 1);

  if target.reply is not null then
    -- An edit. A reply a moderator hid stays hidden until it is removed.
    if target.reply is distinct from body then
      update public.vouches
      set reply = body,
          reply_edited_at = pg_catalog.now(),
          updated_at = pg_catalog.now()
      where id = target.id;
    end if;
    return;
  end if;

  update public.vouches
  set reply = body,
      reply_at = pg_catalog.now(),
      reply_edited_at = null,
      reply_hidden_at = null,
      updated_at = pg_catalog.now()
  where id = target.id;

  select p.username into handle from public.profiles p where p.id = me;

  insert into public.notifications (recipient_id, actor_id, kind, href, metadata)
  values (
    target.voucher_id,
    me,
    'vouch_reply',
    '/u/' || handle || '/vouches',
    pg_catalog.jsonb_build_object('vouch_id', target.id)
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.reply_to_vouch(uuid, text) from public, anon;
grant execute on function public.reply_to_vouch(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- The counts behind the trust line, for up to 50 profiles at once. One row
-- per profile asked for. Hidden vouches and vouches from suspended accounts
-- are left out. followed_* are the vouchers the caller follows (zero when
-- signed out). Percent positive is positive / (positive + negative): the app
-- works it out, and neutral never counts against anyone.
create or replace function public.vouch_summaries(p_user_ids uuid[])
returns table (
  user_id uuid,
  total integer,
  positive integer,
  neutral integer,
  negative integer,
  last_vouch_at timestamptz,
  followed_count integer,
  followed_sample_username text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  ids uuid[] := coalesce(p_user_ids, '{}'::uuid[]);
begin
  if pg_catalog.cardinality(ids) > (select r.summary_max_ids from private.vouch_rules() r) then
    raise exception 'Ask for 50 profiles or fewer at a time'
      using errcode = '22023', hint = 'vouch_too_many';
  end if;

  return query
  select
    asked.id,
    pg_catalog.count(seen.id)::integer,
    (pg_catalog.count(*) filter (where seen.rating = 'positive'))::integer,
    (pg_catalog.count(*) filter (where seen.rating = 'neutral'))::integer,
    (pg_catalog.count(*) filter (where seen.rating = 'negative'))::integer,
    pg_catalog.max(seen.created_at),
    (pg_catalog.count(*) filter (where seen.followed))::integer,
    (pg_catalog.array_agg(seen.username order by seen.created_at desc, seen.id desc) filter (where seen.followed))[1]
  from (select distinct u.id from pg_catalog.unnest(ids) as u(id) where u.id is not null) asked
  left join lateral (
    select
      v.id,
      v.rating,
      v.created_at,
      p.username,
      me is not null and exists (
        select 1 from public.follows f
        where f.follower_id = me and f.following_id = v.voucher_id
      ) and not private.is_blocked(me, v.voucher_id) as followed  -- QA: blocks don't drop follows
    from public.vouches v
    join public.profiles p on p.id = v.voucher_id
    where v.subject_id = asked.id
      and v.hidden_at is null
      and not private.is_suspended(v.voucher_id)
  ) seen on true
  group by asked.id;
end;
$$;

revoke all on function public.vouch_summaries(uuid[]) from public;
grant execute on function public.vouch_summaries(uuid[]) to anon, authenticated;

-- One page of the vouches on p_subject, newest first. Pass the last row's
-- created_at and id to get the next page. Never returns a price: a logged
-- deal only shows as true or false.
create or replace function public.list_vouches(
  p_subject uuid,
  p_rating text default null,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  rating text,
  note text,
  created_at timestamptz,
  edited_at timestamptz,
  reply text,
  reply_at timestamptz,
  reply_edited_at timestamptz,
  voucher_id uuid,
  voucher_username text,
  voucher_display_name text,
  voucher_avatar_url text,
  voucher_accent text,
  voucher_created_at timestamptz,
  voucher_vouch_total integer,
  has_logged_deal boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  page integer;
begin
  if p_rating is not null and p_rating not in ('positive', 'neutral', 'negative') then
    raise exception 'Pick positive, neutral or negative'
      using errcode = '22023', hint = 'vouch_rating';
  end if;

  select least(greatest(coalesce(p_limit, 20), 1), r.list_max) into page from private.vouch_rules() r;

  -- QA: a reader in a block with the subject (either way) sees no vouches page, so the
  -- subject's replies don't reach someone they blocked (posts and DMs work the same way).
  if me is not null and private.is_blocked(me, p_subject) then
    return;
  end if;

  return query
  select
    v.id,
    v.rating,
    v.note,
    v.created_at,
    v.edited_at,
    case when v.reply_hidden_at is null then v.reply end,
    case when v.reply_hidden_at is null then v.reply_at end,
    case when v.reply_hidden_at is null then v.reply_edited_at end,
    p.id,
    p.username::text,
    p.display_name::text,
    p.avatar_url::text,
    p.accent::text,
    p.created_at,
    (
      select pg_catalog.count(*)::integer
      from public.vouches got
      where got.subject_id = v.voucher_id
        and got.hidden_at is null
        and not private.is_suspended(got.voucher_id)
    ),
    exists (
      select 1
      from public.deals d
      where d.status = 'confirmed'
        and (
          (d.seller_id = v.voucher_id and d.buyer_id = v.subject_id)
          or (d.seller_id = v.subject_id and d.buyer_id = v.voucher_id)
        )
    )
  from public.vouches v
  join public.profiles p on p.id = v.voucher_id
  where v.subject_id = p_subject
    and v.hidden_at is null
    and (p_rating is null or v.rating = p_rating)
    and not private.is_suspended(v.voucher_id)
    and (me is null or not private.is_blocked(me, v.voucher_id))
    and (
      p_before_created is null
      or p_before_id is null
      or (v.created_at, v.id) < (p_before_created, p_before_id)
    )
  order by v.created_at desc, v.id desc
  limit page;
end;
$$;

revoke all on function public.list_vouches(uuid, text, timestamptz, uuid, integer) from public;
grant execute on function public.list_vouches(uuid, text, timestamptz, uuid, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reports: a vouch, or the reply to one
-- ---------------------------------------------------------------------------

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('post', 'reply', 'user', 'vouch', 'vouch_reply'));

-- The live function, word for word, plus the 'vouch' and 'vouch_reply' cases.
-- It sets who a report is about from the target, never from what the client sent.
-- QA: the live body copied byte for byte from prod (pg_get_functiondef, 2026-11-27), plus
-- the two new cases, so a diff against prod shows only those 4 lines.
create or replace function private.set_report_target()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  target uuid;
  author uuid;
begin
  if new.target_type is null or new.target_id is null then
    raise exception 'Report target is missing' using errcode = '22023';
  end if;
  if new.target_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Report target not found' using errcode = 'P0002';
  end if;
  target := new.target_id::uuid;

  case new.target_type
    when 'post' then
      select p.user_id into author from public.posts as p where p.id = target;
    when 'reply' then
      select c.user_id into author from public.comments as c where c.id = target;
    when 'message' then
      select m.sender_id into author from public.messages as m where m.id = target;
    when 'user' then
      select u.id into author from auth.users as u where u.id = target;
    when 'vouch' then
      select v.voucher_id into author from public.vouches as v where v.id = target;
    when 'vouch_reply' then
      select v.subject_id into author from public.vouches as v where v.id = target and v.reply is not null;
    else
      raise exception 'Unknown report target type %', new.target_type using errcode = '22023';
  end case;

  if author is null then
    raise exception 'Report target not found' using errcode = 'P0002';
  end if;
  new.reported_user_id := author;
  return new;
end;
$function$;
