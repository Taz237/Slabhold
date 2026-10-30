-- UNAPPLIED. Needs review before running.
--
-- Web Push notifications for the installed app.
--
-- public.push_subscriptions
--   One row per browser push subscription (endpoint is unique). RLS is on: a
--   user can read and delete only their own rows. There is no insert or update
--   policy for authenticated: /api/push/subscribe writes with the service role
--   after checking the endpoint against the push-service allowlist. anon gets
--   nothing.
--
-- public.notification_prefs
--   One optional row per user. A missing row means every default (all types
--   on, previews on, quiet hours off). RLS: select, insert and update your own
--   row only. The time zone must be a zone Postgres knows.
--
-- private.push_outbox
--   One row per event that may push. Written only by the two triggers below,
--   after insert on public.notifications (like, comment, follow, repost,
--   mention, quote) and on public.messages (dm). The triggers never send
--   anything and never fail the source insert. Not exposed through the API.
--
-- private.push_tail_leases
--   A short lease per recipient and group key, so only one sender at a time
--   pushes for that group.
--
-- public.push_* functions
--   Security definer, execute granted to service_role only. The push routes
--   use them to claim outbox rows, read send-time context, record results and
--   prune. anon and authenticated cannot call them.
--
-- No existing table, policy or grant changes. profiles grants are untouched.

begin;

set local lock_timeout = '5s';

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0,
  constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://' and char_length(endpoint) <= 1024),
  constraint push_subscriptions_platform check (platform is null or platform in ('ios', 'android', 'desktop', 'other')),
  constraint push_subscriptions_user_agent_len check (user_agent is null or char_length(user_agent) <= 200)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

drop policy if exists "Read own push subscriptions" on public.push_subscriptions;
create policy "Read own push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Delete own push subscriptions" on public.push_subscriptions;
create policy "Delete own push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Preferences
-- ---------------------------------------------------------------------------

create or replace function private.is_valid_time_zone(zone text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if zone is null or pg_catalog.char_length(zone) not between 1 and 64 then
    return false;
  end if;
  perform pg_catalog.timezone(zone, pg_catalog.now());
  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function private.is_valid_time_zone(text) from public, anon, authenticated;
-- The time_zone check runs as the user writing their own row.
grant execute on function private.is_valid_time_zone(text) to authenticated, service_role;

create table if not exists public.notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  push_follow boolean not null default true,
  push_like boolean not null default true,
  push_reply boolean not null default true,
  push_repost boolean not null default true,
  push_quote boolean not null default true,
  push_mention boolean not null default true,
  push_dm boolean not null default true,
  show_previews boolean not null default true,
  quiet_enabled boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  time_zone text not null default 'America/New_York',
  updated_at timestamptz not null default now(),
  constraint notification_prefs_time_zone check (private.is_valid_time_zone(time_zone))
);

alter table public.notification_prefs enable row level security;

revoke all on table public.notification_prefs from public, anon, authenticated;
grant select, insert, update on table public.notification_prefs to authenticated;
grant select, insert, update, delete on table public.notification_prefs to service_role;

drop policy if exists "Read own notification prefs" on public.notification_prefs;
create policy "Read own notification prefs"
  on public.notification_prefs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own notification prefs" on public.notification_prefs;
create policy "Create own notification prefs"
  on public.notification_prefs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update own notification prefs" on public.notification_prefs;
create policy "Update own notification prefs"
  on public.notification_prefs
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------

create table if not exists private.push_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  kind text not null,
  post_id uuid,
  -- No foreign keys: an unlike or unfollow deletes the source row, and the
  -- sender reads that as "skip".
  notification_id uuid,
  message_id uuid,
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  -- Sent rows: when the push went out. Collapsed rows: when a trailing summary
  -- covered them (null until then).
  sent_at timestamptz,
  attempts integer not null default 0,
  claimed_at timestamptz,
  group_key text not null,
  constraint push_outbox_kind check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote', 'dm')),
  constraint push_outbox_status check (status in ('pending', 'sent', 'collapsed', 'skipped', 'failed'))
);

create index if not exists push_outbox_status_created_idx
  on private.push_outbox (status, created_at);
create index if not exists push_outbox_group_idx
  on private.push_outbox (recipient_id, group_key, created_at);
create index if not exists push_outbox_actor_idx
  on private.push_outbox (actor_id, created_at);

alter table private.push_outbox enable row level security;
revoke all on table private.push_outbox from public, anon, authenticated;

create table if not exists private.push_tail_leases (
  recipient_id uuid not null,
  group_key text not null,
  leased_until timestamptz not null,
  primary key (recipient_id, group_key)
);

alter table private.push_tail_leases enable row level security;
revoke all on table private.push_tail_leases from public, anon, authenticated;

-- Notification tag for a group. Mirrors pushGroupKey in lib/push/group.ts.
create or replace function private.push_group_key(kind text, post_id uuid, actor_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when kind = 'follow' then 'follow'
    when kind = 'dm' then 'dm:' || coalesce(actor_id::text, 'none')
    when kind = 'comment' then 'reply:' || coalesce(post_id::text, 'none')
    else kind || ':' || coalesce(post_id::text, 'none')
  end;
$$;

revoke all on function private.push_group_key(text, uuid, uuid) from public, anon, authenticated;

-- Both triggers only queue a row. A failure here is logged and swallowed so
-- the like, follow, reply or message itself always saves.
create or replace function private.push_outbox_from_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote')
     and new.actor_id is not null
     and new.actor_id <> new.recipient_id then
    insert into private.push_outbox (recipient_id, actor_id, kind, post_id, notification_id, group_key)
    values (
      new.recipient_id,
      new.actor_id,
      new.kind,
      new.post_id,
      new.id,
      private.push_group_key(new.kind, new.post_id, new.actor_id)
    );
  end if;
  return null;
exception
  when others then
    raise warning 'push outbox skipped a notification (%)', sqlstate;
    return null;
end;
$$;

revoke all on function private.push_outbox_from_notification() from public, anon, authenticated;

drop trigger if exists notifications_push_outbox on public.notifications;
create trigger notifications_push_outbox
  after insert on public.notifications
  for each row
  execute function private.push_outbox_from_notification();

create or replace function private.push_outbox_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_id is not null and new.sender_id <> new.receiver_id then
    insert into private.push_outbox (recipient_id, actor_id, kind, message_id, group_key)
    values (
      new.receiver_id,
      new.sender_id,
      'dm',
      new.id,
      private.push_group_key('dm', null, new.sender_id)
    );
  end if;
  return null;
exception
  when others then
    raise warning 'push outbox skipped a message (%)', sqlstate;
    return null;
end;
$$;

revoke all on function private.push_outbox_from_message() from public, anon, authenticated;

drop trigger if exists messages_push_outbox on public.messages;
create trigger messages_push_outbox
  after insert on public.messages
  for each row
  execute function private.push_outbox_from_message();

-- ---------------------------------------------------------------------------
-- Service-role functions for the push routes
-- ---------------------------------------------------------------------------

-- Claims pending rows so two flushes never send the same one: the caller's
-- own rows from the last 10 minutes, plus a few overdue rows of anyone's.
create or replace function public.push_claim(p_actor uuid, p_limit integer, p_sweep_limit integer)
returns table (
  id uuid,
  recipient_id uuid,
  actor_id uuid,
  kind text,
  post_id uuid,
  notification_id uuid,
  message_id uuid,
  created_at timestamptz,
  status text,
  sent_at timestamptz,
  attempts integer,
  group_key text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with mine as (
    select o.id
    from private.push_outbox o
    where p_actor is not null
      and o.actor_id = p_actor
      and o.status = 'pending'
      and o.created_at > pg_catalog.now() - interval '10 minutes'
      and (o.claimed_at is null or o.claimed_at < pg_catalog.now() - interval '2 minutes')
      and o.attempts < 3
    order by o.created_at
    limit greatest(0, least(coalesce(p_limit, 0), 100))
    for update skip locked
  ),
  overdue as (
    select o.id
    from private.push_outbox o
    where o.status = 'pending'
      and o.created_at < pg_catalog.now() - interval '15 seconds'
      and o.created_at > pg_catalog.now() - interval '10 minutes'
      and (o.claimed_at is null or o.claimed_at < pg_catalog.now() - interval '2 minutes')
      and o.attempts < 3
    order by o.created_at
    limit greatest(0, least(coalesce(p_sweep_limit, 0), 100))
    for update skip locked
  ),
  picked as (
    select mine.id from mine
    union
    select overdue.id from overdue
  )
  update private.push_outbox o
  set claimed_at = pg_catalog.now(),
      attempts = o.attempts + 1
  from picked
  where o.id = picked.id
  returning o.id, o.recipient_id, o.actor_id, o.kind, o.post_id, o.notification_id,
    o.message_id, o.created_at, o.status, o.sent_at, o.attempts, o.group_key;
end;
$$;

-- Everything the sender checks at send time, read fresh.
create or replace function public.push_context(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o private.push_outbox;
  source_found boolean := false;
  post_found boolean := false;
  post_hidden boolean := false;
  post_text text;
  body text;
  message_kind text;
  note_metadata jsonb;
  note_created timestamptz;
begin
  select * into o from private.push_outbox where private.push_outbox.id = p_id;
  if not found then
    return null;
  end if;

  if o.kind = 'dm' then
    select m.content, coalesce(m.kind, 'text')
    into body, message_kind
    from public.messages m
    where m.id = o.message_id;
    source_found := found;
  else
    select n.metadata, n.created_at
    into note_metadata, note_created
    from public.notifications n
    where n.id = o.notification_id;
    source_found := found;
  end if;

  if o.post_id is not null then
    select p.hidden_at is not null, p.content
    into post_hidden, post_text
    from public.posts p
    where p.id = o.post_id;
    post_found := found;
  end if;

  if o.kind = 'comment' or (o.kind = 'mention' and note_metadata ->> 'source' = 'reply') then
    select c.body
    into body
    from public.comments c
    where c.post_id = o.post_id
      and c.user_id = o.actor_id
      and c.created_at <= coalesce(note_created, pg_catalog.now()) + interval '5 seconds'
    order by c.created_at desc
    limit 1;
  elsif o.kind in ('like', 'repost', 'quote', 'mention') then
    body := post_text;
  end if;

  return pg_catalog.jsonb_build_object(
    'source_exists', source_found,
    'recipient_exists', exists (select 1 from public.profiles p where p.id = o.recipient_id),
    'actor', (
      select pg_catalog.jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'username', p.username,
        'avatar_url', p.avatar_url
      )
      from public.profiles p
      where p.id = o.actor_id
    ),
    'post', case when post_found then pg_catalog.jsonb_build_object('hidden', post_hidden) else null end,
    'text', pg_catalog.left(body, 400),
    'message_kind', message_kind,
    'blocked', coalesce(private.is_blocked(o.actor_id, o.recipient_id), false),
    'muted', coalesce(private.is_muted(o.recipient_id, o.actor_id), false),
    'prefs', (
      select pg_catalog.to_jsonb(np) - 'user_id' - 'updated_at'
      from public.notification_prefs np
      where np.user_id = o.recipient_id
    ),
    'subscription_count', (
      select pg_catalog.count(*) from public.push_subscriptions s where s.user_id = o.recipient_id
    ),
    'badge', (
      select pg_catalog.count(*) from public.notifications n
      where n.recipient_id = o.recipient_id and not n.read
    ) + (
      select pg_catalog.count(*) from public.messages m
      where m.receiver_id = o.recipient_id and not m.read
    )
  );
end;
$$;

-- The newest push in a group, the recipient's recent push counts (rate
-- limits), and for DMs the unread messages from that sender.
create or replace function public.push_group_state(p_recipient uuid, p_group_key text, p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return pg_catalog.jsonb_build_object(
    'last_push_at', (
      select pg_catalog.max(o.sent_at)
      from private.push_outbox o
      where o.recipient_id = p_recipient
        and o.group_key = p_group_key
        and o.status = 'sent'
        and o.created_at > pg_catalog.now() - interval '1 day'
    ),
    'sent_last_minute', (
      select pg_catalog.count(*)
      from private.push_outbox o
      where o.recipient_id = p_recipient
        and o.status = 'sent'
        and o.sent_at > pg_catalog.now() - interval '1 minute'
    ),
    'sent_last_hour', (
      select pg_catalog.count(*)
      from private.push_outbox o
      where o.recipient_id = p_recipient
        and o.status = 'sent'
        and o.sent_at > pg_catalog.now() - interval '1 hour'
    ),
    'dm_unread', case
      when p_group_key like 'dm:%' and p_actor is not null then (
        select pg_catalog.count(*)
        from public.messages m
        where m.receiver_id = p_recipient
          and m.sender_id = p_actor
          and not m.read
      )
      else 0
    end
  );
end;
$$;

-- A group's sent and collapsed rows from the last day, with whether each one
-- would still notify (source row there, actor there, no block or mute).
create or replace function public.push_group_rows(p_recipient uuid, p_group_key text)
returns table (
  id uuid,
  recipient_id uuid,
  actor_id uuid,
  kind text,
  post_id uuid,
  notification_id uuid,
  message_id uuid,
  created_at timestamptz,
  status text,
  sent_at timestamptz,
  attempts integer,
  group_key text,
  valid boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select o.id, o.recipient_id, o.actor_id, o.kind, o.post_id, o.notification_id,
    o.message_id, o.created_at, o.status, o.sent_at, o.attempts, o.group_key,
    (
      case
        when o.kind = 'dm' then exists (select 1 from public.messages m where m.id = o.message_id)
        else exists (select 1 from public.notifications n where n.id = o.notification_id)
      end
      and exists (select 1 from public.profiles p where p.id = o.actor_id)
      and not coalesce(private.is_blocked(o.actor_id, o.recipient_id), false)
      and not coalesce(private.is_muted(o.recipient_id, o.actor_id), false)
    ) as valid
  from private.push_outbox o
  where o.recipient_id = p_recipient
    and o.group_key = p_group_key
    and o.status in ('sent', 'collapsed')
    and o.created_at > pg_catalog.now() - interval '1 day'
  order by o.created_at desc
  limit 500;
end;
$$;

create or replace function public.push_mark(p_ids uuid[], p_status text, p_sent_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pending', 'sent', 'collapsed', 'skipped', 'failed') then
    raise exception 'bad push status' using errcode = '22023';
  end if;
  update private.push_outbox o
  set status = p_status,
      sent_at = p_sent_at,
      claimed_at = null
  where o.id = any (p_ids);
end;
$$;

-- Groups with collapsed rows still waiting for their trailing summary.
create or replace function public.push_due_tails(p_limit integer)
returns table (recipient_id uuid, group_key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select o.recipient_id, o.group_key
  from private.push_outbox o
  where o.status = 'collapsed'
    and o.sent_at is null
    and o.created_at > pg_catalog.now() - interval '2 hours'
  group by o.recipient_id, o.group_key
  order by pg_catalog.min(o.created_at)
  limit greatest(0, least(coalesce(p_limit, 0), 100));
end;
$$;

create or replace function public.push_take_lease(p_recipient uuid, p_group_key text, p_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  taken boolean;
begin
  insert into private.push_tail_leases as l (recipient_id, group_key, leased_until)
  values (
    p_recipient,
    p_group_key,
    pg_catalog.now() + pg_catalog.make_interval(secs => greatest(1, least(coalesce(p_seconds, 30), 120)))
  )
  on conflict (recipient_id, group_key) do update
  set leased_until = excluded.leased_until
  where l.leased_until < pg_catalog.now()
  returning true into taken;
  return coalesce(taken, false);
end;
$$;

create or replace function public.push_release_lease(p_recipient uuid, p_group_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.push_tail_leases l
  where l.recipient_id = p_recipient
    and l.group_key = p_group_key;
end;
$$;

-- Rows older than 7 days go. Pending rows past the 10-minute send window and
-- collapsed rows that never got a summary are closed as skipped.
create or replace function public.push_prune()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from private.push_outbox o
  where o.created_at < pg_catalog.now() - interval '7 days';
  get diagnostics removed = row_count;

  update private.push_outbox o
  set status = 'skipped', claimed_at = null
  where (o.status = 'pending' and o.created_at < pg_catalog.now() - interval '10 minutes')
     or (o.status = 'collapsed' and o.sent_at is null and o.created_at < pg_catalog.now() - interval '2 hours');

  delete from private.push_tail_leases l
  where l.leased_until < pg_catalog.now() - interval '5 minutes';

  return removed;
end;
$$;

revoke all on function public.push_claim(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.push_context(uuid) from public, anon, authenticated;
revoke all on function public.push_group_state(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.push_group_rows(uuid, text) from public, anon, authenticated;
revoke all on function public.push_mark(uuid[], text, timestamptz) from public, anon, authenticated;
revoke all on function public.push_due_tails(integer) from public, anon, authenticated;
revoke all on function public.push_take_lease(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.push_release_lease(uuid, text) from public, anon, authenticated;
revoke all on function public.push_prune() from public, anon, authenticated;

grant execute on function public.push_claim(uuid, integer, integer) to service_role;
grant execute on function public.push_context(uuid) to service_role;
grant execute on function public.push_group_state(uuid, text, uuid) to service_role;
grant execute on function public.push_group_rows(uuid, text) to service_role;
grant execute on function public.push_mark(uuid[], text, timestamptz) to service_role;
grant execute on function public.push_due_tails(integer) to service_role;
grant execute on function public.push_take_lease(uuid, text, integer) to service_role;
grant execute on function public.push_release_lease(uuid, text) to service_role;
grant execute on function public.push_prune() to service_role;

commit;

notify pgrst, 'reload schema';
