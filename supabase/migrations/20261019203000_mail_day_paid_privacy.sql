-- Mail Day paid stays on cards. posts.meta must not carry it.
-- Readers get cards.paid_price only from mail_day_paid.

update public.posts
set meta = meta - 'paid'
where jsonb_typeof(meta) = 'object'
  and meta ? 'paid';

create or replace function public.enforce_mail_day_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  card_text text;
  card_id uuid;
begin
  if new.meta is not null and jsonb_typeof(new.meta) = 'object' then
    new.meta := new.meta - 'paid';
  end if;

  if new.post_type is distinct from 'mail_day' then
    return new;
  end if;

  card_text := nullif(new.card->>'id', '');
  if card_text is null
     or card_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Mail Day posts must attach your own card'
      using errcode = '42501';
  end if;

  begin
    card_id := card_text::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Mail Day posts must attach your own card'
        using errcode = '42501';
  end;

  if not exists (
    select 1
    from public.cards
    where id = card_id
      and user_id = new.user_id
  ) then
    raise exception 'Mail Day posts must attach your own card'
      using errcode = '42501';
  end if;

  if new.image_url is not null
     and (
       new.image_url ~ '\.\.'
       or new.image_url !~ '^https://knuwflptobyutrauxblj\.supabase\.co/storage/v1/object/public/(card-photos|avatars|covers|post-images)/[A-Za-z0-9][A-Za-z0-9._/-]*$'
     ) then
    raise exception 'Mail Day photos must use Slabhold storage'
      using errcode = '22023';
  end if;

  if new.meta is not null and new.meta ? 'photos' then
    if jsonb_typeof(new.meta->'photos') is distinct from 'array'
       or exists (
         select 1
         from jsonb_array_elements(new.meta->'photos') as item(value)
         where jsonb_typeof(item.value) is distinct from 'string'
            or (item.value #>> '{}') ~ '\.\.'
            or (item.value #>> '{}') !~ '^https://knuwflptobyutrauxblj\.supabase\.co/storage/v1/object/public/(card-photos|avatars|covers|post-images)/[A-Za-z0-9][A-Za-z0-9._/-]*$'
       ) then
      raise exception 'Mail Day photos must use Slabhold storage'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_mail_day_post() from public;
grant execute on function public.enforce_mail_day_post() to authenticated, service_role;

drop trigger if exists enforce_mail_day_post on public.posts;
create trigger enforce_mail_day_post
  before insert or update on public.posts
  for each row execute function public.enforce_mail_day_post();

-- Paid for a Mail Day post. Owner sees it on a public card even when show_paid is off.
-- Everyone else needs the card in public_cards and show_paid. A private card returns nothing.
create or replace function public.mail_day_paid(p_post_ids uuid[])
returns table (post_id uuid, paid numeric)
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
  select p.id, c.paid_price
  from public.posts p
  join public.cards c
    on c.user_id = p.user_id
   and c.id::text = lower(p.card->>'id')
  join public.public_cards pc on pc.id = c.id
  where p.post_type = 'mail_day'
    and p.id = any(p_post_ids)
    and c.paid_price is not null
    and (
      p.show_paid is true
      or auth.uid() = p.user_id
    );
end;
$$;

revoke all on function public.mail_day_paid(uuid[]) from public;
grant execute on function public.mail_day_paid(uuid[]) to anon, authenticated;

-- Card-page posts never return a paid key, even if a row still has one.
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
