-- Buckets stay public so a direct object URL still loads.
-- Drop the select policies so a logged-out list of storage.objects is empty or refused.
-- The owner can delete files in their own card-photos/<uid>/ folder.

drop policy if exists "Public can view card photos" on storage.objects;
drop policy if exists "Public can view avatars" on storage.objects;
drop policy if exists "Public can view covers" on storage.objects;
drop policy if exists "Public can view post images" on storage.objects;

drop policy if exists "Users can delete own card photos" on storage.objects;
create policy "Users can delete own card photos"
  on storage.objects for delete
  using (
    bucket_id = 'card-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create or replace function public.enforce_mail_day_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned jsonb;
  ids text[] := '{}';
  card_text text;
  card_uuid uuid;
  item jsonb;
  photo text;
  seen int := 0;
begin
  if new.meta is not null and jsonb_typeof(new.meta) = 'object' then
    new.meta := new.meta
      - 'paid' - 'public' - 'value'
      - 'estimatedValue' - 'estimated_value'
      - 'purchasePrice' - 'paid_price';
    if jsonb_typeof(new.meta->'cards') = 'array' then
      select coalesce(jsonb_agg(
        case
          when jsonb_typeof(elem.value) = 'object' then
            elem.value
              - 'paid' - 'public' - 'value'
              - 'estimatedValue' - 'estimated_value'
              - 'purchasePrice' - 'paid_price'
          else elem.value
        end
        order by elem.ordinality
      ), '[]'::jsonb)
      into cleaned
      from jsonb_array_elements(new.meta->'cards') with ordinality as elem(value, ordinality);
      new.meta := jsonb_set(new.meta, '{cards}', cleaned);
    end if;
  end if;

  if new.post_type is distinct from 'mail_day' then
    return new;
  end if;

  if not public.mail_day_photo_ok(new.image_url, new.user_id) then
    raise exception 'Mail Day photos must use Slabhold storage'
      using errcode = '22023';
  end if;

  if not public.mail_day_photo_ok(new.card->>'photoDataUrl', new.user_id) then
    raise exception 'Mail Day photos must use Slabhold storage'
      using errcode = '22023';
  end if;

  if new.meta is not null and new.meta ? 'photos' then
    if jsonb_typeof(new.meta->'photos') is distinct from 'array' then
      raise exception 'Mail Day photos must use Slabhold storage'
        using errcode = '22023';
    end if;
    for item in select value from jsonb_array_elements(new.meta->'photos')
    loop
      if jsonb_typeof(item) is distinct from 'string'
         or not public.mail_day_photo_ok(item #>> '{}', new.user_id) then
        raise exception 'Mail Day photos must use Slabhold storage'
          using errcode = '22023';
      end if;
    end loop;
  end if;

  if new.meta is not null and jsonb_typeof(new.meta->'cards') = 'array' then
    for item in select value from jsonb_array_elements(new.meta->'cards')
    loop
      if jsonb_typeof(item) is distinct from 'object' or not (item ? 'photos') then
        continue;
      end if;
      if jsonb_typeof(item->'photos') is distinct from 'array' then
        raise exception 'Mail Day photos must use Slabhold storage'
          using errcode = '22023';
      end if;
      for photo in
        select value #>> '{}'
        from jsonb_array_elements(item->'photos')
      loop
        if not public.mail_day_photo_ok(photo, new.user_id) then
          raise exception 'Mail Day photos must use Slabhold storage'
            using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;

  if nullif(new.card->>'id', '') is not null then
    ids := array_append(ids, new.card->>'id');
  end if;

  if new.meta is not null and jsonb_typeof(new.meta->'cards') = 'array' then
    for item in select value from jsonb_array_elements(new.meta->'cards')
    loop
      if jsonb_typeof(item) = 'object' and nullif(item->>'id', '') is not null then
        ids := array_append(ids, item->>'id');
      end if;
    end loop;
  end if;

  for card_uuid in
    select pc.card_id from public.post_cards pc where pc.post_id = new.id
  loop
    ids := array_append(ids, card_uuid::text);
  end loop;

  if tg_op = 'INSERT' and coalesce(cardinality(ids), 0) = 0 then
    raise exception 'Mail Day posts must attach your own card'
      using errcode = '42501';
  end if;

  foreach card_text in array ids loop
    seen := seen + 1;
    if card_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Mail Day posts must attach your own card'
        using errcode = '42501';
    end if;

    begin
      card_uuid := card_text::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Mail Day posts must attach your own card'
          using errcode = '42501';
    end;

    if exists (
      select 1 from public.cards c
      where c.id = card_uuid and c.user_id = new.user_id
    ) then
      continue;
    end if;

    if exists (select 1 from public.cards c where c.id = card_uuid) then
      raise exception 'Mail Day posts must attach your own card'
        using errcode = '42501';
    end if;

    -- The card row is gone (deleted, or hidden with the card removed).
    -- Allow the update, including moderation setting hidden_at / hidden_by,
    -- when this id was already on the post.
    if tg_op = 'UPDATE' and (
      old.card->>'id' = card_text
      or exists (
        select 1
        from jsonb_array_elements(coalesce(old.meta->'cards', '[]'::jsonb)) old_item
        where old_item->>'id' = card_text
      )
    ) then
      continue;
    end if;

    raise exception 'Mail Day posts must attach your own card'
      using errcode = '42501';
  end loop;

  return new;
end;
$$;

revoke all on function public.enforce_mail_day_post() from public;
grant execute on function public.enforce_mail_day_post() to authenticated, service_role;

drop trigger if exists enforce_mail_day_post on public.posts;
create trigger enforce_mail_day_post
  before insert or update on public.posts
  for each row execute function public.enforce_mail_day_post();
