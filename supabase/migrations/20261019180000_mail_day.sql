-- Mail Day: where a card came from, and a post that can show that pickup.
-- posts RLS is unchanged.

alter table public.cards
  add column if not exists acquired_source text;

alter table public.cards
  add column if not exists acquired_at date;

alter table public.cards drop constraint if exists cards_acquired_source;
alter table public.cards
  add constraint cards_acquired_source
  check (
    acquired_source is null
    or acquired_source in ('ebay', 'card_show', 'lcs', 'trade', 'other')
  );

alter table public.posts
  add column if not exists post_type text not null default 'post';

alter table public.posts
  add column if not exists show_paid boolean not null default false;

alter table public.posts
  add column if not exists meta jsonb;

alter table public.posts drop constraint if exists posts_post_type;
alter table public.posts
  add constraint posts_post_type
  check (post_type in ('post', 'mail_day'));

-- Return type changes, so replace the card-page post function.
drop function if exists public.posts_about_card(uuid, integer, timestamptz, uuid);

create function public.posts_about_card(
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
      when pc.id is null then p.meta - 'paid'
      when p.show_paid is true then p.meta
      else p.meta - 'paid'
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

grant execute on function public.posts_about_card(uuid, integer, timestamptz, uuid)
  to anon, authenticated;
