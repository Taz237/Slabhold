-- Block and mute checks must not be callable at /rest/v1/rpc/.
-- private is not an exposed API schema. Policies and triggers call private.*.
-- A session may only evaluate is_blocked / is_muted for a pair it belongs to.
-- Service role (auth.uid() is null) still sees the real row, for triggers.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_blocked(a uuid, b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() is distinct from a
     and auth.uid() is distinct from b then
    raise exception 'permission denied for function is_blocked'
      using errcode = '42501';
  end if;

  return a is not null
    and b is not null
    and a <> b
    and exists (
      select 1
      from public.blocks
      where (blocker_id = a and blocked_id = b)
         or (blocker_id = b and blocked_id = a)
    );
end;
$$;

create or replace function private.is_muted(viewer uuid, author uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() is distinct from viewer
     and auth.uid() is distinct from author then
    raise exception 'permission denied for function is_muted'
      using errcode = '42501';
  end if;

  return viewer is not null
    and author is not null
    and viewer <> author
    and exists (
      select 1
      from public.mutes
      where muter_id = viewer
        and muted_id = author
    );
end;
$$;

-- Author of a post the caller may not be allowed to read (quotes, replies, reposts).
create or replace function private.post_author(post_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.posts where id = post_id;
$$;

revoke all on function private.is_blocked(uuid, uuid) from public;
revoke all on function private.is_muted(uuid, uuid) from public;
revoke all on function private.post_author(uuid) from public;

-- SELECT policies run for anon and authenticated. post_author is insert-only.
grant execute on function private.is_blocked(uuid, uuid) to anon, authenticated;
grant execute on function private.is_muted(uuid, uuid) to anon, authenticated;
grant execute on function private.post_author(uuid) to authenticated;

-- People the caller blocked, plus people the caller muted when asked.
-- Accounts that blocked the caller are hidden by RLS, not by this list.
create or replace function public.hidden_author_ids(apply_mute boolean default false)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select blocked_id
  from public.blocks
  where blocker_id = auth.uid()
  union
  select muted_id
  from public.mutes
  where coalesce(apply_mute, false)
    and muter_id = auth.uid();
$$;

-- True when the signed-in user and other have not blocked each other.
create or replace function public.can_interact(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and other is not null
    and auth.uid() <> other
    and not private.is_blocked(auth.uid(), other);
$$;

revoke all on function public.can_interact(uuid) from public, anon, authenticated, service_role;
grant execute on function public.can_interact(uuid) to authenticated;

drop policy if exists "Posts are public" on public.posts;
create policy "Posts are public" on public.posts
  for select using (
    (
      hidden_at is null
      or user_id = auth.uid()
      or coalesce(auth.role(), '') = 'service_role'
    )
    and not private.is_blocked(auth.uid(), user_id)
  );

drop policy if exists "Create own posts" on public.posts;
create policy "Create own posts" on public.posts
  for insert with check (
    auth.uid() = user_id
    and (
      quoted_post_id is null
      or not private.is_blocked(auth.uid(), private.post_author(quoted_post_id))
    )
  );

drop policy if exists "Follow as yourself" on public.follows;
create policy "Follow as yourself" on public.follows
  for insert with check (
    auth.uid() = follower_id
    and not private.is_blocked(auth.uid(), following_id)
  );

drop policy if exists "Read own messages" on public.messages;
create policy "Read own messages" on public.messages
  for select using (
    (auth.uid() = sender_id or auth.uid() = receiver_id)
    and not private.is_blocked(auth.uid(), sender_id)
    and not private.is_blocked(auth.uid(), receiver_id)
  );

drop policy if exists "Send messages as yourself" on public.messages;
create policy "Send messages as yourself" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and sender_id <> receiver_id
    and not private.is_blocked(auth.uid(), receiver_id)
  );

drop policy if exists "Comments are public" on public.comments;
create policy "Comments are public" on public.comments
  for select using (not private.is_blocked(auth.uid(), user_id));

drop policy if exists "Comment as yourself" on public.comments;
create policy "Comment as yourself" on public.comments
  for insert with check (
    auth.uid() = user_id
    and not private.is_blocked(auth.uid(), private.post_author(post_id))
  );

drop policy if exists "Read related notifications" on public.notifications;
create policy "Read related notifications" on public.notifications
  for select using (
    (auth.uid() = recipient_id or auth.uid() = actor_id)
    and (
      actor_id is null
      or (
        not private.is_blocked(auth.uid(), actor_id)
        and not private.is_muted(auth.uid(), actor_id)
      )
    )
  );

drop policy if exists "Create notifications as yourself" on public.notifications;
create policy "Create notifications as yourself"
  on public.notifications
  for insert
  with check (
    auth.uid() = actor_id
    and actor_id <> recipient_id
    and kind <> 'quote'
    and kind <> 'want_alert'
    and not private.is_blocked(auth.uid(), recipient_id)
  );

drop policy if exists "Reposts are public" on public.reposts;
create policy "Reposts are public" on public.reposts
  for select using (not private.is_blocked(auth.uid(), user_id));

drop policy if exists "Repost as yourself" on public.reposts;
create policy "Repost as yourself" on public.reposts
  for insert with check (
    auth.uid() = user_id
    and not private.is_blocked(auth.uid(), private.post_author(post_id))
  );

create or replace function public.notify_quote_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  original_author uuid;
  preview text;
begin
  if new.quoted_post_id is null then
    return new;
  end if;

  select user_id into original_author
  from public.posts
  where id = new.quoted_post_id;

  if original_author is null or original_author = new.user_id then
    return new;
  end if;

  if private.is_blocked(new.user_id, original_author)
     or private.is_muted(original_author, new.user_id) then
    return new;
  end if;

  preview := nullif(btrim(coalesce(new.content, '')), '');
  if preview is not null and char_length(preview) > 80 then
    preview := left(preview, 77) || '…';
  end if;
  if preview is null then
    preview := 'Quoted your post';
  end if;

  begin
    insert into public.notifications (recipient_id, actor_id, kind, post_id, preview)
    values (original_author, new.user_id, 'quote', new.id, preview);
  exception
    when unique_violation then
      null;
  end;

  return new;
end;
$$;

create or replace function public.posts_about_card(
  p_card_id uuid,
  p_limit integer default 6,
  p_before timestamptz default null,
  p_before_id uuid default null
) returns table (
  id uuid,
  user_id uuid,
  content text,
  image_url text,
  quoted_post_id uuid,
  created_at timestamptz,
  attached_id uuid,
  attached_player text,
  attached_year integer,
  attached_year_label text,
  attached_set text,
  attached_number text,
  attached_sport text,
  attached_image text,
  attached_accent text,
  attached_estimate numeric,
  attached_grade text,
  attached_grader text,
  attached_parallel text,
  attached_condition text
)
language sql
stable
security invoker
set search_path = public
as $$
  with subject as (
    select public.card_identity_key(
      player, year_label, year, coalesce(set_name, "set"),
      card_number, parallel, condition_type, grader, grade
    ) as identity
    from public.public_cards
    where public.public_cards.id = p_card_id
    union all
    select public.card_identity_key(
      player, year_label, year, coalesce(set_name, "set"),
      card_number, parallel, condition_type, grader, grade
    )
    from public.cards
    where public.cards.id = p_card_id
      and public.cards.user_id = auth.uid()
      and not exists (
        select 1 from public.public_cards pc where pc.id = p_card_id
      )
  ),
  match_ids as (
    select pc.id
    from public.public_cards pc
    join subject s on public.card_identity_key(
      pc.player, pc.year_label, pc.year, coalesce(pc.set_name, pc."set"),
      pc.card_number, pc.parallel, pc.condition_type, pc.grader, pc.grade
    ) = s.identity
    union
    select p_card_id
    from subject
    where exists (
      select 1
      from public.cards c
      where c.id = p_card_id
        and c.user_id = auth.uid()
    )
  )
  select
    p.id,
    p.user_id,
    p.content,
    p.image_url,
    p.quoted_post_id,
    p.created_at,
    coalesce(pc.id, own.id) as attached_id,
    coalesce(pc.player, own.player) as attached_player,
    coalesce(pc.year, own.year) as attached_year,
    coalesce(pc.year_label, own.year_label) as attached_year_label,
    coalesce(pc.set_name, pc."set", own.set_name) as attached_set,
    coalesce(pc.card_number, own.card_number) as attached_number,
    coalesce(pc.sport, own.sport) as attached_sport,
    coalesce(pc.image_url, own.image_url) as attached_image,
    coalesce(pc.accent, own.accent) as attached_accent,
    coalesce(pc.estimated_value, own.estimated_value) as attached_estimate,
    coalesce(pc.grade, own.grade) as attached_grade,
    coalesce(pc.grader, own.grader) as attached_grader,
    coalesce(pc.parallel, own.parallel) as attached_parallel,
    coalesce(pc.condition_type, own.condition_type) as attached_condition
  from public.posts p
  join match_ids m on (p.card->>'id') = m.id::text
  left join public.public_cards pc on pc.id = m.id
  left join lateral (
    select
      c.id,
      c.player,
      c.year,
      c.year_label,
      coalesce(c.set_name, c."set") as set_name,
      c.card_number,
      c.sport,
      c.image_url,
      c.accent,
      c.estimated_value,
      c.grade,
      c.grader,
      c.parallel,
      c.condition_type
    from public.cards c
    where pc.id is null
      and c.id = p_card_id
      and c.user_id = auth.uid()
      and c.id::text = p.card->>'id'
  ) own on true
  where not private.is_blocked(auth.uid(), p.user_id)
    and not private.is_muted(auth.uid(), p.user_id)
    and (
      p_before is null
      or (p.created_at, p.id) < (p_before, p_before_id)
    )
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 6), 41));
$$;

drop function if exists public.is_blocked(uuid, uuid);
drop function if exists public.is_muted(uuid, uuid);
drop function if exists public.post_author(uuid);

revoke all on table public.blocks from public, anon, authenticated;
revoke all on table public.mutes from public, anon, authenticated;
revoke all on table public.reports from public, anon, authenticated;

grant select, insert, delete on table public.blocks to authenticated;
grant select, insert, delete on table public.mutes to authenticated;
grant select, insert on table public.reports to authenticated;

notify pgrst, 'reload schema';
