-- Create quote notifications server-side when a post quotes another.
-- Clients keep inserting like/comment/follow/repost/mention; quote inserts are blocked.

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

  -- Skip missing originals and self-quotes.
  if original_author is null or original_author = new.user_id then
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

drop trigger if exists on_post_quote_notify on public.posts;
create trigger on_post_quote_notify
  after insert on public.posts
  for each row
  execute function public.notify_quote_on_post();

-- Clients may still insert like/comment/follow/repost/mention — not quote.
drop policy if exists "Create notifications as yourself" on public.notifications;
create policy "Create notifications as yourself" on public.notifications
  for insert with check (
    auth.uid() = actor_id
    and actor_id <> recipient_id
    and kind <> 'quote'
  );
