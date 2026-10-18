-- Mutes hide notifications when the recipient reads them.
-- Inserts (quote trigger included) still create the row, so a muted actor
-- sees the same notification rows an unmuted actor would.
-- Actors may read rows they sent so mention sync can add and remove them,
-- except want_alert, which names the wanter.

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

  if private.is_blocked(new.user_id, original_author) then
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

drop policy if exists "Read related notifications" on public.notifications;
create policy "Read related notifications" on public.notifications
  for select using (
    (
      auth.uid() = recipient_id
      and (
        actor_id is null
        or (
          not private.is_blocked(auth.uid(), actor_id)
          and not private.is_muted(auth.uid(), actor_id)
        )
      )
    )
    or (
      auth.uid() = actor_id
      and kind <> 'want_alert'
    )
  );

notify pgrst, 'reload schema';
