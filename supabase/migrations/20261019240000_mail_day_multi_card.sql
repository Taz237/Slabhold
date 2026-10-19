-- Mail Day can attach 1-10 cards. posts.card stays the first card.
-- Paid still never lives in posts.meta. Readers use mail_day_paid per card.

create table if not exists public.post_cards (
  post_id uuid not null references public.posts (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  position smallint not null,
  primary key (post_id, card_id),
  unique (post_id, position),
  constraint post_cards_position_range check (position >= 0 and position < 10)
);

create index if not exists post_cards_card_id_idx on public.post_cards (card_id);

alter table public.post_cards enable row level security;

drop policy if exists "Read post cards when the post is visible" on public.post_cards;
create policy "Read post cards when the post is visible"
  on public.post_cards for select
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_cards.post_id
        and (
          p.hidden_at is null
          or p.user_id = auth.uid()
          or coalesce(auth.role(), '') = 'service_role'
        )
        and not private.is_blocked(auth.uid(), p.user_id)
    )
  );

drop policy if exists "Insert post cards for your card" on public.post_cards;
create policy "Insert post cards for your card"
  on public.post_cards for insert
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.cards c
      where c.id = card_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Delete post cards for your card" on public.post_cards;
create policy "Delete post cards for your card"
  on public.post_cards for delete
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.cards c
      where c.id = card_id and c.user_id = auth.uid()
    )
  );

revoke all on public.post_cards from anon, authenticated;
grant select on public.post_cards to anon, authenticated;
grant insert, delete on public.post_cards to authenticated;

-- One Mail Day post alerts once per card. Older rows keep a null card_id,
-- and coalesce keeps their (want, source) dedupe.
alter table public.want_alerts add column if not exists card_id text;

do $$
declare
  con name;
begin
  select c.conname into con
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'want_alerts'
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) like '%want_id%'
    and pg_get_constraintdef(c.oid) not like '%card_id%';
  if con is not null then
    execute format('alter table public.want_alerts drop constraint %I', con);
  end if;
end $$;

create unique index if not exists want_alerts_want_source_card_key
  on public.want_alerts (want_id, source_type, source_id, coalesce(card_id, ''));

create or replace function public.mail_day_photo_ok(url text)
returns boolean
language sql
immutable
as $$
  select url is null
    or (
      url !~ '\.\.'
      and url ~ '^https://knuwflptobyutrauxblj\.supabase\.co/storage/v1/object/public/(card-photos|avatars|covers|post-images)/[A-Za-z0-9][A-Za-z0-9._/-]*$'
    );
$$;

revoke all on function public.mail_day_photo_ok(text) from public, anon, authenticated;

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

  if not public.mail_day_photo_ok(new.image_url) then
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
         or not public.mail_day_photo_ok(item #>> '{}') then
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
        if not public.mail_day_photo_ok(photo) then
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

create or replace function public.enforce_post_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  poster uuid;
  n int;
begin
  select user_id into poster from public.posts where id = new.post_id;
  if poster is null or not exists (
    select 1 from public.cards c
    where c.id = new.card_id and c.user_id = poster
  ) then
    raise exception 'Mail Day posts must attach your own card'
      using errcode = '42501';
  end if;

  select count(*) into n from public.post_cards where post_id = new.post_id;
  if n >= 10 then
    raise exception 'Mail Day holds up to 10 cards'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_post_card() from public;
grant execute on function public.enforce_post_card() to authenticated, service_role;

drop trigger if exists enforce_post_card on public.post_cards;
create trigger enforce_post_card
  before insert on public.post_cards
  for each row execute function public.enforce_post_card();

-- Paid per card. A private card returns nothing. Owner sees paid on a public
-- card even when that card's show-paid flag is off.
drop function if exists public.mail_day_paid(uuid[]);

create function public.mail_day_paid(p_post_ids uuid[])
returns table (post_id uuid, card_id uuid, paid numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(cardinality(p_post_ids), 0) > 500 then
    raise exception 'too many posts'
      using errcode = '22023';
  end if;

  return query
  select p.id, c.id, c.paid_price
  from public.posts p
  join lateral (
    select pc.card_id
    from public.post_cards pc
    where pc.post_id = p.id
    union
    select (p.card->>'id')::uuid
    where (p.card->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) link on true
  join public.cards c
    on c.id = link.card_id
   and c.user_id = p.user_id
  join public.public_cards pub on pub.id = c.id
  where p.post_type = 'mail_day'
    and p.id = any (p_post_ids)
    and c.paid_price is not null
    and (
      auth.uid() = p.user_id
      or coalesce(
        (
          select (item.value->>'showPaid')::boolean
          from jsonb_array_elements(coalesce(p.meta->'cards', '[]'::jsonb)) item(value)
          where item.value->>'id' = c.id::text
            and jsonb_typeof(item.value->'showPaid') = 'boolean'
          limit 1
        ),
        p.show_paid
      ) is true
    );
end;
$$;

revoke all on function public.mail_day_paid(uuid[]) from public;
grant execute on function public.mail_day_paid(uuid[]) to anon, authenticated;

-- Card pages match every card on the post, not only posts.card.
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
  attached_condition text,
  attached_is_public boolean,
  post_type text,
  show_paid boolean,
  meta jsonb
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
    coalesce(pc.condition_type, own.condition_type) as attached_condition,
    (pc.id is not null) as attached_is_public,
    p.post_type,
    p.show_paid,
    case
      when jsonb_typeof(p.meta) = 'object' then p.meta - 'paid'
      else p.meta
    end as meta
  from public.posts p
  join match_ids m on (
    (p.card->>'id') = m.id::text
    or exists (
      select 1
      from public.post_cards linked
      where linked.post_id = p.id
        and linked.card_id = m.id
    )
  )
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
      and (
        c.id::text = p.card->>'id'
        or exists (
          select 1
          from public.post_cards linked
          where linked.post_id = p.id
            and linked.card_id = c.id
        )
      )
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
