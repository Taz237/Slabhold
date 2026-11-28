-- UNDO for PR #353 vouches (supabase/migrations/20261127200000_vouches.sql or QA's proposed-qa-fixed.sql).
-- QA Guard fixed version, 2026-11-27. Needs Donnie's OK before running (rules.md: any undo.sql).
-- DATA LOSS / REAL USERS' DATA: deletes every vouch and reply (drops public.vouches).
-- Ready for apply_migration (no begin/commit). For the SQL Editor, paste as-is (one transaction).
-- QA changes: no begin/commit; private.set_report_target restored byte for byte from prod.
-- UNDO. Do not run without Donnie's OK.
-- Do not run supabase db push. Do not apply this with the Supabase CLI.
--
-- Takes supabase/migrations/20261127200000_vouches.sql back out. This file is
-- in supabase/undo/, not supabase/migrations/, so nothing ever runs it by
-- accident.
--
-- What it does
--   - Drops the vouch functions, the vouches table (every vouch and reply is
--     deleted with it), private.vouch_log, and the indexes the migration
--     added, messages_pair_idx included.
--   - Puts notifications_kind back to the live list without 'vouch' and
--     'vouch_reply'.
--   - Puts reports_target_type_check back to ('post', 'reply', 'user').
--   - Puts private.set_report_target back to its live body, without the
--     'vouch' and 'vouch_reply' cases.
--
-- It refuses to run while any notification of kind 'vouch' or 'vouch_reply',
-- or any report with target_type 'vouch' or 'vouch_reply', still exists: the
-- old constraints would not accept those rows. The reviewer decides what to
-- do with them first (for example, after exporting the reports):
--
--   delete from public.notifications where kind in ('vouch', 'vouch_reply');
--   delete from public.reports where target_type in ('vouch', 'vouch_reply');
--
-- Those two deletes are NOT part of this file on purpose.
--
-- Safe to run twice.


set local lock_timeout = '5s';

do $$
begin
  if exists (select 1 from public.notifications where kind in ('vouch', 'vouch_reply')) then
    raise exception 'Undo refused: vouch notifications still exist. Delete them first (see the comment at the top of this file).'
      using errcode = '55000';
  end if;
  if exists (select 1 from public.reports where target_type in ('vouch', 'vouch_reply')) then
    raise exception 'Undo refused: reports about vouches still exist. Delete them first (see the comment at the top of this file).'
      using errcode = '55000';
  end if;
end
$$;

-- Reports first, while public.vouches is still there to be forgotten.
-- QA: the live prod body, byte for byte (pg_get_functiondef 2026-11-27).
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

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('post', 'reply', 'user'));

-- Notifications.
drop index if exists public.notifications_vouch_once;
drop index if exists public.notifications_vouch_reply_once;

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
    'poll_ended'
  ));

-- Functions.
drop function if exists public.list_vouches(uuid, text, timestamptz, uuid, integer);
drop function if exists public.vouch_summaries(uuid[]);
drop function if exists public.reply_to_vouch(uuid, text);
drop function if exists public.delete_vouch(uuid);
drop function if exists public.upsert_vouch(uuid, text, text);
drop function if exists public.vouch_status(uuid);
drop function if exists private.clean_vouch_text(text, integer);
drop function if exists private.raise_vouch_refusal(text);
drop function if exists private.vouch_refusal(uuid, uuid);

-- Tables (their indexes, constraints and the direct-write trigger go with them).
drop table if exists public.vouches;
drop table if exists private.vouch_log;
drop function if exists private.reject_direct_vouch_write();
drop function if exists private.vouch_rules();

drop index if exists public.messages_pair_idx;

