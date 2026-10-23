-- Pin one of your own posts to the top of your profile.
-- Not applied. Do not run this from supabase db push until it is reviewed.
--
-- profiles.pinned_post_id is nullable and references posts(id) on delete set null,
-- so deleting the post clears the pin.
--
-- "Users update own profile" stays row-wide (auth.uid() = id). That policy can
-- write pinned_post_id, and the table update grant is not column-limited.
-- profiles_enforce_own_pin rejects the row unless the post's user_id is the
-- profile id, so the policy cannot pin someone else's post.
--
-- public.pin_post(post_id) and public.unpin_post() are the app RPCs. Both are
-- security definer with an empty search_path. anon cannot execute them.
-- They only update the caller's profile. pin_post requires posts.user_id to
-- be the caller and posts.hidden_at to be null.
--
-- posts_clear_pin_when_hidden runs after hidden_at changes. When moderation
-- hides a post, every profile pin of that post is cleared.
--
-- profiles_reserve_username is not replaced. It still runs before insert or
-- update of username only. A pin does not rename anyone, and a rename does
-- not run the pin trigger.

begin;

set local lock_timeout = '5s';

create schema if not exists private;

alter table public.profiles
  add column if not exists pinned_post_id uuid;

alter table public.profiles
  drop constraint if exists profiles_pinned_post_id_fkey;

alter table public.profiles
  add constraint profiles_pinned_post_id_fkey
  foreign key (pinned_post_id)
  references public.posts (id)
  on delete set null;

comment on column public.profiles.pinned_post_id is
  'The one post this profile pins. Null when nothing is pinned. Must be a visible post whose user_id is this profile. Cleared when that post is deleted or hidden.';

create index if not exists profiles_pinned_post_id_idx
  on public.profiles (pinned_post_id);

create or replace function private.enforce_own_pinned_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.pinned_post_id is not distinct from old.pinned_post_id then
    return new;
  end if;
  if new.pinned_post_id is null then
    return new;
  end if;
  -- Share lock so a moderator hide waits, then clears this pin, instead of
  -- committing a hidden post that this transaction already decided to pin.
  perform 1
  from public.posts
  where public.posts.id = new.pinned_post_id
    and public.posts.user_id = new.id
    and public.posts.hidden_at is null
  for share;
  if not found then
    raise exception 'can only pin your own post'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_own_pinned_post() from public, anon, authenticated;

drop trigger if exists profiles_enforce_own_pin on public.profiles;
create trigger profiles_enforce_own_pin
  before insert or update of pinned_post_id on public.profiles
  for each row
  execute function private.enforce_own_pinned_post();

create or replace function public.pin_post(post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null or post_id is null then
    raise exception 'can only pin your own post'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.posts
    where public.posts.id = post_id
      and public.posts.user_id = uid
      and public.posts.hidden_at is null
  ) then
    raise exception 'can only pin your own post'
      using errcode = '42501';
  end if;
  update public.profiles
  set pinned_post_id = post_id
  where public.profiles.id = uid;
  if not found then
    raise exception 'can only pin your own post'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.unpin_post()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'can only pin your own post'
      using errcode = '42501';
  end if;
  update public.profiles
  set pinned_post_id = null
  where public.profiles.id = uid;
end;
$$;

revoke all on function public.pin_post(uuid) from public, anon, authenticated;
revoke all on function public.unpin_post() from public, anon, authenticated;
grant execute on function public.pin_post(uuid) to authenticated;
grant execute on function public.unpin_post() to authenticated;

comment on function public.pin_post(uuid) is
  'Pin one of your own posts. Replaces the previous pin. anon cannot execute this.';
comment on function public.unpin_post() is
  'Clear your pinned post. anon cannot execute this.';

create or replace function private.clear_pin_when_post_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hidden_at is not null then
    update public.profiles
    set pinned_post_id = null
    where public.profiles.pinned_post_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.clear_pin_when_post_hidden() from public, anon, authenticated;

drop trigger if exists posts_clear_pin_when_hidden on public.posts;
create trigger posts_clear_pin_when_hidden
  after update of hidden_at on public.posts
  for each row
  execute function private.clear_pin_when_post_hidden();

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'profiles_reserve_username'
      and tgrelid = 'public.profiles'::regclass
      and not tgisinternal
  ) then
    raise exception 'profiles_reserve_username must stay on public.profiles';
  end if;
end
$$;

commit;
