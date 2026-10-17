-- Apple 1.2 safety: block, mute, report, and hide posts.
-- Replies stay in public.comments (there is no posts.parent_id).
-- Quotes stay on posts.quoted_post_id.
-- Existing policy behavior is kept; new checks are added on top.

create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);

create table if not exists public.mutes (
  muter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  muted_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);

create index if not exists mutes_muted_id_idx on public.mutes (muted_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'reply', 'user')),
  target_id text not null,
  reported_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in (
    'spam', 'harassment', 'hate', 'sexual', 'violence', 'scam', 'misleading_listing', 'other'
  )),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index if not exists reports_status_created_idx on public.reports (status, created_at);

alter table public.posts add column if not exists hidden_at timestamptz;
alter table public.posts add column if not exists hidden_by uuid;

alter table public.blocks enable row level security;
alter table public.mutes enable row level security;
alter table public.reports enable row level security;

grant select, insert, delete on public.blocks to authenticated;
grant select, insert, delete on public.mutes to authenticated;
grant select, insert on public.reports to authenticated;

drop policy if exists "Read own blocks" on public.blocks;
drop policy if exists "Insert own blocks" on public.blocks;
drop policy if exists "Delete own blocks" on public.blocks;
create policy "Read own blocks" on public.blocks
  for select using (auth.uid() = blocker_id);
create policy "Insert own blocks" on public.blocks
  for insert with check (auth.uid() = blocker_id and blocker_id <> blocked_id);
create policy "Delete own blocks" on public.blocks
  for delete using (auth.uid() = blocker_id);

drop policy if exists "Read own mutes" on public.mutes;
drop policy if exists "Insert own mutes" on public.mutes;
drop policy if exists "Delete own mutes" on public.mutes;
create policy "Read own mutes" on public.mutes
  for select using (auth.uid() = muter_id);
create policy "Insert own mutes" on public.mutes
  for insert with check (auth.uid() = muter_id and muter_id <> muted_id);
create policy "Delete own mutes" on public.mutes
  for delete using (auth.uid() = muter_id);

drop policy if exists "Insert own reports" on public.reports;
drop policy if exists "Read own reports" on public.reports;
create policy "Insert own reports" on public.reports
  for insert with check (auth.uid() = reporter_id);
create policy "Read own reports" on public.reports
  for select using (auth.uid() = reporter_id);

-- Either direction. The blocked user cannot read the blocker's rows, so this
-- security definer function is the only check they can use.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null
    and b is not null
    and a <> b
    and exists (
      select 1
      from public.blocks
      where (blocker_id = a and blocked_id = b)
         or (blocker_id = b and blocked_id = a)
    );
$$;

create or replace function public.is_muted(viewer uuid, author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select viewer is not null
    and author is not null
    and viewer <> author
    and exists (
      select 1
      from public.mutes
      where muter_id = viewer
        and muted_id = author
    );
$$;

-- Author of a post the caller may not be allowed to read (quotes and replies).
create or replace function public.post_author(post_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.posts where id = post_id;
$$;

-- Session user only. apply_mute adds accounts that user muted.
create or replace function public.hidden_author_ids(apply_mute boolean default false)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select blocked_id from public.blocks where blocker_id = auth.uid()
  union
  select blocker_id from public.blocks where blocked_id = auth.uid()
  union
  select muted_id from public.mutes
  where coalesce(apply_mute, false)
    and muter_id = auth.uid();
$$;

revoke all on function public.is_blocked(uuid, uuid) from public;
revoke all on function public.is_muted(uuid, uuid) from public;
revoke all on function public.post_author(uuid) from public;
revoke all on function public.hidden_author_ids(boolean) from public;
grant execute on function public.is_blocked(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.is_muted(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.post_author(uuid) to anon, authenticated, service_role;
grant execute on function public.hidden_author_ids(boolean) to anon, authenticated, service_role;

-- Users cannot set or clear moderation columns. Service role still can.
create or replace function public.protect_post_moderation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.hidden_at := null;
    new.hidden_by := null;
    return new;
  end if;
  new.hidden_at := old.hidden_at;
  new.hidden_by := old.hidden_by;
  return new;
end;
$$;

drop trigger if exists protect_post_moderation on public.posts;
create trigger protect_post_moderation
  before insert or update on public.posts
  for each row execute function public.protect_post_moderation();

drop policy if exists "Posts are public" on public.posts;
create policy "Posts are public" on public.posts
  for select using (
    (
      hidden_at is null
      or user_id = auth.uid()
      or coalesce(auth.role(), '') = 'service_role'
    )
    and not public.is_blocked(auth.uid(), user_id)
  );

drop policy if exists "Create own posts" on public.posts;
create policy "Create own posts" on public.posts
  for insert with check (
    auth.uid() = user_id
    and (
      quoted_post_id is null
      or not public.is_blocked(auth.uid(), public.post_author(quoted_post_id))
    )
  );

drop policy if exists "Update own posts" on public.posts;
create policy "Update own posts" on public.posts
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Delete own posts" on public.posts;
create policy "Delete own posts" on public.posts
  for delete using (auth.uid() = user_id);

drop policy if exists "Follows are public" on public.follows;
create policy "Follows are public" on public.follows
  for select using (true);

drop policy if exists "Follow as yourself" on public.follows;
create policy "Follow as yourself" on public.follows
  for insert with check (
    auth.uid() = follower_id
    and not public.is_blocked(auth.uid(), following_id)
  );

drop policy if exists "Unfollow as yourself" on public.follows;
create policy "Unfollow as yourself" on public.follows
  for delete using (auth.uid() = follower_id);

drop policy if exists "Read own messages" on public.messages;
create policy "Read own messages" on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Send messages as yourself" on public.messages;
create policy "Send messages as yourself" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and sender_id <> receiver_id
    and not public.is_blocked(auth.uid(), receiver_id)
  );

drop policy if exists "Mark received messages read" on public.messages;
create policy "Mark received messages read" on public.messages
  for update using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

drop policy if exists "Comments are public" on public.comments;
create policy "Comments are public" on public.comments
  for select using (not public.is_blocked(auth.uid(), user_id));

drop policy if exists "Comment as yourself" on public.comments;
create policy "Comment as yourself" on public.comments
  for insert with check (
    auth.uid() = user_id
    and not public.is_blocked(auth.uid(), public.post_author(post_id))
  );

drop policy if exists "Delete own comments" on public.comments;
create policy "Delete own comments" on public.comments
  for delete using (auth.uid() = user_id);

drop policy if exists "Read related notifications" on public.notifications;
create policy "Read related notifications" on public.notifications
  for select using (
    (auth.uid() = recipient_id or auth.uid() = actor_id)
    and (
      actor_id is null
      or not public.is_blocked(auth.uid(), actor_id)
    )
  );

-- Quote notifications skip blocked pairs and recipients who muted the actor.
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

  if public.is_blocked(new.user_id, original_author)
     or public.is_muted(original_author, new.user_id) then
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

-- Collectors' posts: same identity match, plus block and mute for the viewer.
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
  where not public.is_blocked(auth.uid(), p.user_id)
    and not public.is_muted(auth.uid(), p.user_id)
    and (
      p_before is null
      or (p.created_at, p.id) < (p_before, p_before_id)
    )
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 6), 41));
$$;
