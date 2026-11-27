-- UNAPPLIED. Needs review before running.
-- Do not run supabase db push. Do not apply this with the Supabase CLI.
--
-- Polls on posts, the way X does them.
--
-- Tables
--   public.polls         one per post: when it ends and its running total.
--   public.poll_options  2 to 4 choices, 1 to 25 characters, no repeats
--                        (case does not matter), each with its own count.
--   public.poll_votes    one row per voter per poll. The primary key is
--                        (poll_id, user_id), so a second vote is refused.
--
-- Who can do what
--   - Anyone who can see the post can read its poll and the counts.
--   - Nobody writes polls or poll_options directly. Only
--     public.create_poll_post makes them, in the same transaction as the post.
--   - A signed-in user may insert one vote, as themselves, in an open poll
--     they did not write, on a post they can see (blocks hide it).
--   - Votes can't be changed or taken back: there is no update or delete
--     grant on poll_votes. A voter only ever reads their own vote.
--   - The counts are kept by a trigger. Each vote locks its poll's row, so
--     many people voting at once still add up exactly.
--   - The poll copy on posts.meta.poll (so a timeline can draw the poll
--     before the counts load) can't be added, changed or removed by a client,
--     and a poll post's text can't be edited, the same as X.
--   - A poll post has text only: no photos, GIF, video, card, quote or thread.
--
-- Notifications
--   'poll_ended' is a new, quiet kind (no push: the push outbox only queues
--   like, comment, follow, repost, mention, quote and dm). public.settle_ended_polls
--   writes one for the author once a poll has ended. The app calls it when the
--   author's inbox loads. Clients still can't write 'poll_ended' notices
--   themselves: private.notification_insert_allowed refuses kinds it doesn't know.
--
-- Safe to run twice.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  ends_at timestamptz not null,
  total_votes integer not null default 0,
  ended_notified_at timestamptz,
  constraint polls_length check (
    ends_at >= created_at + interval '5 minutes'
    and ends_at <= created_at + interval '7 days'
  ),
  constraint polls_total_votes check (total_votes >= 0)
);

create index if not exists polls_unsettled_idx
  on public.polls (user_id, ends_at)
  where ended_notified_at is null;

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  position smallint not null,
  label text not null,
  vote_count integer not null default 0,
  constraint poll_options_position check (position between 0 and 3),
  constraint poll_options_label check (
    pg_catalog.char_length(label) between 1 and 25
    and label = pg_catalog.btrim(label, E' \t\r\n')
  ),
  constraint poll_options_vote_count check (vote_count >= 0),
  constraint poll_options_slot unique (poll_id, position),
  constraint poll_options_pair unique (id, poll_id)
);

create unique index if not exists poll_options_label_once
  on public.poll_options (poll_id, lower(label));

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id),
  -- The choice must belong to the same poll.
  constraint poll_votes_option foreign key (option_id, poll_id)
    references public.poll_options (id, poll_id) on delete cascade
);

create index if not exists poll_votes_option_idx on public.poll_votes (option_id);
create index if not exists poll_votes_user_idx on public.poll_votes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

revoke all on table public.polls from public, anon, authenticated;
revoke all on table public.poll_options from public, anon, authenticated;
revoke all on table public.poll_votes from public, anon, authenticated;

grant select on table public.polls to anon, authenticated;
grant select on table public.poll_options to anon, authenticated;
grant select, insert on table public.poll_votes to authenticated;
-- Signed out, poll_results still reads this table, and the policy below shows them no rows.
grant select on table public.poll_votes to anon;

-- The post's own RLS decides: hidden posts and blocks hide the poll too.
drop policy if exists "Polls follow their post" on public.polls;
create policy "Polls follow their post" on public.polls
  for select
  to anon, authenticated
  using (exists (select 1 from public.posts po where po.id = polls.post_id));

drop policy if exists "Poll choices follow their poll" on public.poll_options;
create policy "Poll choices follow their poll" on public.poll_options
  for select
  to anon, authenticated
  using (exists (select 1 from public.polls p where p.id = poll_options.poll_id));

drop policy if exists "Read your own votes" on public.poll_votes;
create policy "Read your own votes" on public.poll_votes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Vote once as yourself in an open poll" on public.poll_votes;
create policy "Vote once as yourself in an open poll" on public.poll_votes
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.polls p
      where p.id = poll_votes.poll_id
        and p.ends_at > pg_catalog.now()
        and p.user_id <> (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Votes: the rules again (with a clear reason), then the counts
-- ---------------------------------------------------------------------------

-- Runs before RLS, so a refused vote says why. The hint is what the app reads.
create or replace function private.guard_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  ends timestamptz;
begin
  select p.user_id, p.ends_at
  into author, ends
  from public.polls p
  where p.id = new.poll_id;

  if author is null then
    raise exception 'That poll is unavailable'
      using errcode = '42501', hint = 'poll_missing';
  end if;
  if author = new.user_id then
    raise exception 'You can''t vote in your own poll'
      using errcode = '42501', hint = 'own_poll';
  end if;
  if ends <= pg_catalog.now() then
    raise exception 'This poll has ended'
      using errcode = '42501', hint = 'poll_ended';
  end if;
  if private.is_blocked(new.user_id, author) then
    raise exception 'That poll is unavailable'
      using errcode = '42501', hint = 'poll_missing';
  end if;

  new.created_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.guard_poll_vote() from public, anon, authenticated;

drop trigger if exists poll_votes_guard on public.poll_votes;
create trigger poll_votes_guard
  before insert on public.poll_votes
  for each row
  execute function private.guard_poll_vote();

-- Every vote updates the poll row first, then the choice, so votes on one
-- poll queue up on that row and each one adds to the latest total.
create or replace function private.count_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.polls set total_votes = total_votes + 1 where id = new.poll_id;
    update public.poll_options set vote_count = vote_count + 1 where id = new.option_id;
  else
    -- Only when a voter's account (or the whole poll) is deleted.
    update public.polls set total_votes = greatest(total_votes - 1, 0) where id = old.poll_id;
    update public.poll_options set vote_count = greatest(vote_count - 1, 0) where id = old.option_id;
  end if;
  return null;
end;
$$;

revoke all on function private.count_poll_vote() from public, anon, authenticated;

drop trigger if exists poll_votes_count on public.poll_votes;
create trigger poll_votes_count
  after insert or delete on public.poll_votes
  for each row
  execute function private.count_poll_vote();

-- A poll always has 2 to 4 choices, at positions 0..n-1.
create or replace function private.check_poll_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.poll_options o
    where o.poll_id in (select i.poll_id from inserted i)
    group by o.poll_id
    having pg_catalog.count(*) < 2
        or pg_catalog.count(*) > 4
        or pg_catalog.max(o.position) <> pg_catalog.count(*) - 1
  ) then
    raise exception 'A poll needs 2 to 4 choices'
      using errcode = '22023', hint = 'poll_choices';
  end if;
  return null;
end;
$$;

revoke all on function private.check_poll_options() from public, anon, authenticated;

drop trigger if exists poll_options_check on public.poll_options;
create trigger poll_options_check
  after insert on public.poll_options
  referencing new table as inserted
  for each statement
  execute function private.check_poll_options();

-- ---------------------------------------------------------------------------
-- The poll copy on posts.meta.poll
-- ---------------------------------------------------------------------------

-- A poll post carries nothing else.
alter table public.posts drop constraint if exists posts_poll_alone;
alter table public.posts
  add constraint posts_poll_alone
  check (
    not (coalesce(meta, '{}'::jsonb) ? 'poll')
    or (
      image_url is null
      and gif is null
      and video is null
      and (card is null or card = 'null'::jsonb)
      and quoted_post_id is null
      and thread_id is null
      and coalesce(post_type, 'post') = 'post'
      and not (meta ? 'images')
    )
  );

-- Only the table owner (create_poll_post's helper below) sets meta.poll.
-- A client insert can't bring one, an update keeps the stored one, and the
-- text of a poll post can't change.
create or replace function private.protect_poll_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner name;
begin
  select pg_catalog.pg_get_userbyid(c.relowner)
  into owner
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'posts';

  if current_user is not distinct from owner then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.meta ? 'poll', false) then
      new.meta := new.meta - 'poll';
    end if;
    return new;
  end if;

  if coalesce(old.meta ? 'poll', false) then
    if new.content is distinct from old.content then
      raise exception 'Polls can''t be edited'
        using errcode = '42501', hint = 'poll_locked';
    end if;
    new.meta := coalesce(new.meta, '{}'::jsonb) || pg_catalog.jsonb_build_object('poll', old.meta -> 'poll');
  elsif coalesce(new.meta ? 'poll', false) then
    new.meta := new.meta - 'poll';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_poll_fields() from public, anon, authenticated;

drop trigger if exists posts_protect_poll on public.posts;
create trigger posts_protect_poll
  before insert or update on public.posts
  for each row
  execute function private.protect_poll_fields();

-- ---------------------------------------------------------------------------
-- Making a poll post
-- ---------------------------------------------------------------------------

-- Adds the poll to a post this same transaction just inserted. Called only by
-- public.create_poll_post (private is not an API schema).
create or replace function private.attach_poll(p_post_id uuid, p_options text[], p_minutes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner_id uuid;
  fresh boolean;
  clean text[];
  label text;
  bad boolean;
  new_poll uuid;
  ends timestamptz;
  choices jsonb;
begin
  -- Made in this transaction: created_at defaults to now(), the transaction's start.
  select p.user_id, p.created_at = pg_catalog.now()
  into owner_id, fresh
  from public.posts p
  where p.id = p_post_id;

  if me is null or owner_id is null or owner_id <> me or not fresh then
    raise exception 'A poll goes on a new post of your own'
      using errcode = '42501', hint = 'poll_missing';
  end if;

  if p_options is null or pg_catalog.cardinality(p_options) not between 2 and 4 then
    raise exception 'A poll needs 2 to 4 choices'
      using errcode = '22023', hint = 'poll_choices';
  end if;

  select pg_catalog.array_agg(pg_catalog.btrim(coalesce(t.choice, ''), E' \t\r\n') order by t.place)
  into clean
  from pg_catalog.unnest(p_options) with ordinality as t(choice, place);

  foreach label in array clean loop
    if pg_catalog.char_length(label) not between 1 and 25 then
      raise exception 'Each choice is 1 to 25 characters'
        using errcode = '22023', hint = 'poll_choice_length';
    end if;
    -- The same word filter as post text, where this database has it.
    if pg_catalog.to_regprocedure('private.blocked_text(text)') is not null then
      execute 'select private.blocked_text($1)' into bad using label;
      if coalesce(bad, false) then
        raise exception 'This includes words Slabhold doesn''t allow. Edit it and try again'
          using errcode = '23514';
      end if;
    end if;
  end loop;

  if (select pg_catalog.count(distinct pg_catalog.lower(c)) from pg_catalog.unnest(clean) as c)
     <> pg_catalog.cardinality(clean) then
    raise exception 'Each choice needs to be different'
      using errcode = '22023', hint = 'poll_choice_repeat';
  end if;

  if p_minutes is null or p_minutes not between 5 and 10080 then
    raise exception 'A poll runs from 5 minutes to 7 days'
      using errcode = '22023', hint = 'poll_length';
  end if;

  ends := pg_catalog.now() + pg_catalog.make_interval(mins => p_minutes);

  insert into public.polls (post_id, user_id, ends_at)
  values (p_post_id, me, ends)
  returning id into new_poll;

  insert into public.poll_options (poll_id, position, label)
  select new_poll, (t.place - 1)::smallint, t.choice
  from pg_catalog.unnest(clean) with ordinality as t(choice, place);

  select pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object('id', o.id, 'label', o.label)
           order by o.position
         )
  into choices
  from public.poll_options o
  where o.poll_id = new_poll;

  update public.posts
  set meta = coalesce(meta, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'poll',
    pg_catalog.jsonb_build_object('id', new_poll, 'ends_at', ends, 'options', choices)
  )
  where id = p_post_id;
end;
$$;

revoke all on function private.attach_poll(uuid, text[], integer) from public, anon;
grant execute on function private.attach_poll(uuid, text[], integer) to authenticated;

-- The post goes in as the caller, under the posts table's own RLS and
-- triggers. Then the poll is added. One transaction: both land or neither.
create or replace function public.create_poll_post(p_content text, p_options text[], p_duration_minutes integer)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  body text := pg_catalog.btrim(coalesce(p_content, ''), E' \t\r\n');
  new_post uuid;
begin
  if me is null then
    raise exception 'Sign in to post a poll'
      using errcode = '42501', hint = 'signed_out';
  end if;
  if pg_catalog.char_length(body) < 1 then
    raise exception 'Ask a question for your poll'
      using errcode = '22023', hint = 'poll_question';
  end if;
  if pg_catalog.char_length(body) > 280 then
    raise exception 'Keep it to 280 characters'
      using errcode = '22023', hint = 'poll_question';
  end if;

  insert into public.posts (user_id, content)
  values (me, body)
  returning id into new_post;

  perform private.attach_poll(new_post, p_options, p_duration_minutes);
  return new_post;
end;
$$;

revoke all on function public.create_poll_post(text, text[], integer) from public, anon;
grant execute on function public.create_poll_post(text, text[], integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading and voting
-- ---------------------------------------------------------------------------

-- Counts for up to 100 polls, plus the caller's own choice (null if none).
create or replace function public.poll_results(p_poll_ids uuid[])
returns table (poll_id uuid, ends_at timestamptz, total_votes integer, options jsonb, viewer_option_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.ends_at,
    p.total_votes,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
                 pg_catalog.jsonb_build_object('id', o.id, 'votes', o.vote_count)
                 order by o.position
               )
        from public.poll_options o
        where o.poll_id = p.id
      ),
      '[]'::jsonb
    ),
    (
      select v.option_id
      from public.poll_votes v
      where v.poll_id = p.id
        and v.user_id = (select auth.uid())
    )
  from public.polls p
  where p.id = any ((coalesce(p_poll_ids, '{}'::uuid[]))[1:100]);
$$;

revoke all on function public.poll_results(uuid[]) from public;
grant execute on function public.poll_results(uuid[]) to anon, authenticated;

-- One vote, as the caller. Returns the poll's counts after it.
create or replace function public.vote_in_poll(p_option_id uuid)
returns table (poll_id uuid, ends_at timestamptz, total_votes integer, options jsonb, viewer_option_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  target uuid;
begin
  if me is null then
    raise exception 'Sign in to vote'
      using errcode = '42501', hint = 'signed_out';
  end if;

  select o.poll_id into target from public.poll_options o where o.id = p_option_id;
  if target is null then
    raise exception 'That poll is unavailable'
      using errcode = '42501', hint = 'poll_missing';
  end if;

  begin
    insert into public.poll_votes (poll_id, option_id, user_id)
    values (target, p_option_id, me);
  exception
    when unique_violation then
      raise exception 'You already voted in this poll'
        using errcode = '42501', hint = 'already_voted';
  end;

  return query select * from public.poll_results(array[target]);
end;
$$;

revoke all on function public.vote_in_poll(uuid) from public, anon;
grant execute on function public.vote_in_poll(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- "Your poll ended"
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
    'poll_ended'
  ));

-- One notice per ended poll. A signed-in caller settles only their own
-- polls; the service role (no auth.uid()) settles everyone's. Two calls at
-- once can't both notify: each poll row is claimed with skip locked and
-- marked before its notice is written.
create or replace function public.settle_ended_polls()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  done integer;
begin
  with due as (
    select p.id
    from public.polls p
    where p.ended_notified_at is null
      and p.ends_at <= pg_catalog.now()
      and (me is null or p.user_id = me)
    order by p.ends_at
    limit 200
    for update skip locked
  ),
  marked as (
    update public.polls p
    set ended_notified_at = pg_catalog.now()
    from due
    where p.id = due.id
    returning p.id, p.post_id, p.user_id, p.total_votes
  )
  insert into public.notifications (recipient_id, actor_id, kind, post_id, preview, metadata)
  select
    m.user_id,
    null,
    'poll_ended',
    m.post_id,
    case
      when pg_catalog.char_length(pg_catalog.btrim(po.content)) > 80
        then pg_catalog.left(pg_catalog.btrim(po.content), 77) || '…'
      else nullif(pg_catalog.btrim(po.content), '')
    end,
    pg_catalog.jsonb_build_object('poll_id', m.id, 'votes', m.total_votes)
  from marked m
  join public.posts po on po.id = m.post_id;

  get diagnostics done = row_count;
  return done;
end;
$$;

revoke all on function public.settle_ended_polls() from public, anon;
grant execute on function public.settle_ended_polls() to authenticated, service_role;

commit;
