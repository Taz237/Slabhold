-- UNAPPLIED. Needs review before running.
-- Do not `supabase db push` this, and do not apply it with the Supabase CLI.
--
-- DM reactions, Instagram style.
--
-- public.message_reactions
--   One reaction per person per message: the primary key is
--   (message_id, user_id). Picking another emoji updates the row, picking
--   the same one again deletes it. The emoji is one of six.
--   RLS: only the two people in that conversation can read, add, change or
--   remove reactions, and only their own. The message check reads
--   public.messages under its own RLS, so a block hides the reactions too.
--   The primary key is the replica identity, so a realtime DELETE event
--   still names its message_id.
--
-- Notifications
--   A new reaction writes one quiet 'dm_reaction' notice for the message's
--   sender ("reacted ❤️ to your message"). A swap changes that notice's
--   emoji in place; it is not a new notice. Removing the reaction removes
--   the notice. One notice per inbox, person and message (a partial unique
--   index on recipient_id, actor_id and metadata->>'message_id').
--   The trigger only swaps or removes the notice in the message sender's
--   inbox, so a stray dm_reaction row in anyone else's inbox is never
--   touched. A delete also clears a notice whose actor is already null.
--   A reaction can't be moved to another message or person: an update that
--   changes message_id or user_id is refused (42501).
--   'dm_reaction' is not a push kind: the push outbox trigger only queues
--   like, comment, follow, repost, mention, quote and dm, so this never
--   sends a push. Clients still cannot write 'dm_reaction' notices: the
--   live "Create notifications as yourself" policy goes through
--   private.notification_insert_allowed, which returns false for any kind it
--   doesn't know. This migration leaves that policy untouched; only the
--   definer trigger below writes these notices.
--
-- Realtime: the table joins the supabase_realtime publication (best effort,
-- like the other live tables in schema.sql).

begin;

set local lock_timeout = '5s';

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id),
  constraint message_reactions_emoji check (emoji in ('❤️', '👍', '😂', '😮', '😢', '🔥'))
);

create index if not exists message_reactions_user_idx
  on public.message_reactions (user_id, created_at desc);

-- True when the signed-in user is the sender or receiver of that message
-- and can still read it (messages RLS: participants only, no blocks).
create or replace function private.in_message_conversation(p_message_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.messages m
    where m.id = p_message_id
      and (select auth.uid()) in (m.sender_id, m.receiver_id)
  );
$$;

revoke all on function private.in_message_conversation(uuid) from public, anon;
grant execute on function private.in_message_conversation(uuid) to authenticated;

alter table public.message_reactions enable row level security;

revoke all on table public.message_reactions from public, anon, authenticated;
grant select, insert, update, delete on table public.message_reactions to authenticated;

drop policy if exists "Read reactions in your conversations" on public.message_reactions;
create policy "Read reactions in your conversations" on public.message_reactions
  for select
  to authenticated
  using (private.in_message_conversation(message_id));

drop policy if exists "React as yourself in your conversations" on public.message_reactions;
create policy "React as yourself in your conversations" on public.message_reactions
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and private.in_message_conversation(message_id)
  );

drop policy if exists "Change your own reactions" on public.message_reactions;
create policy "Change your own reactions" on public.message_reactions
  for update
  to authenticated
  using ((select auth.uid()) = user_id and private.in_message_conversation(message_id))
  with check ((select auth.uid()) = user_id and private.in_message_conversation(message_id));

drop policy if exists "Remove your own reactions" on public.message_reactions;
create policy "Remove your own reactions" on public.message_reactions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id and private.in_message_conversation(message_id));

-- ---------------------------------------------------------------------------
-- Quiet notice for the message's sender
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
    'dm_reaction'
  ));

-- One notice per inbox, person and message. The recipient is part of the
-- key, so a stray dm_reaction row in someone else's inbox can't collide.
drop index if exists public.notifications_dm_reaction_once;
create unique index notifications_dm_reaction_once
  on public.notifications (recipient_id, actor_id, ((metadata ->> 'message_id')))
  where kind = 'dm_reaction';

create or replace function private.message_reaction_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
  body text;
  preview text;
begin
  if tg_op = 'DELETE' then
    -- Only the notice in the message sender's inbox. The actor may already
    -- be null (a deleted account). With the message gone too (a cascade),
    -- the author is null and any inbox's notice for it goes.
    select m.sender_id into author from public.messages m where m.id = old.message_id;
    delete from public.notifications n
    where n.kind = 'dm_reaction'
      and (n.actor_id = old.user_id or n.actor_id is null)
      and n.metadata ->> 'message_id' = old.message_id::text
      and (author is null or n.recipient_id = author);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- A reaction is only ever re-picked in place. Moving it would leave its
    -- notice pointing at the wrong message or person.
    if new.message_id is distinct from old.message_id or new.user_id is distinct from old.user_id then
      raise exception 'a reaction cannot move to another message or person'
        using errcode = '42501';
    end if;
    if new.emoji is distinct from old.emoji then
      select m.sender_id into author from public.messages m where m.id = new.message_id;
      update public.notifications n
      set metadata = pg_catalog.jsonb_set(coalesce(n.metadata, '{}'::jsonb), '{emoji}', pg_catalog.to_jsonb(new.emoji))
      where n.kind = 'dm_reaction'
        and n.actor_id = new.user_id
        and n.metadata ->> 'message_id' = new.message_id::text
        and n.recipient_id = author;
    end if;
    return new;
  end if;

  select m.sender_id, m.content
  into author, body
  from public.messages m
  where m.id = new.message_id;

  -- Reacting to your own message notifies nobody.
  if author is null or author = new.user_id then
    return new;
  end if;

  if private.is_blocked(new.user_id, author) then
    return new;
  end if;

  preview := nullif(pg_catalog.btrim(coalesce(body, '')), '');
  if preview is not null and pg_catalog.char_length(preview) > 80 then
    preview := pg_catalog.left(preview, 77) || '…';
  end if;

  begin
    insert into public.notifications (recipient_id, actor_id, kind, preview, metadata)
    values (
      author,
      new.user_id,
      'dm_reaction',
      preview,
      pg_catalog.jsonb_build_object('message_id', new.message_id::text, 'emoji', new.emoji)
    );
  exception
    when unique_violation then
      null;
  end;

  return new;
end;
$$;

revoke all on function private.message_reaction_notice() from public, anon, authenticated;

drop trigger if exists message_reactions_notice on public.message_reactions;
create trigger message_reactions_notice
  after insert or update or delete on public.message_reactions
  for each row
  execute function private.message_reaction_notice();

-- Live updates for the other person. Ignore if realtime is off.
do $$
begin
  begin
    alter publication supabase_realtime add table public.message_reactions;
  exception when others then
    null;
  end;
end $$;

commit;
