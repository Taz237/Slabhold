-- Identity lookup for "posts about this card".
-- Mirrors cardIdentityKey() in lib/social/card-identity.ts:
-- lowercase/trim, strip a leading #, drop the word panini from the set,
-- prefer year_label, null parallel -> base, raw vs grader + grade.

create or replace function public.card_identity_key(
  p_player text,
  p_year_label text,
  p_year integer,
  p_set text,
  p_number text,
  p_parallel text,
  p_condition_type text,
  p_grader text,
  p_grade text
) returns text
language sql
immutable
set search_path = public
as $$
  with cond as (
    select
      lower(btrim(coalesce(p_condition_type, ''))) as condition,
      lower(btrim(coalesce(p_grader, ''))) as grader_col,
      lower(btrim(coalesce(p_grade, ''))) as grade_text,
      lower(coalesce((regexp_match(coalesce(p_grade, ''), '\y(PSA|BGS|SGC|CGC|TAG|Other)\y', 'i'))[1], '')) as parsed_company,
      coalesce((regexp_match(coalesce(p_grade, ''), '(\d+(?:\.\d+)?)'))[1], '') as raw_number
  ),
  norm as (
    select
      condition,
      grade_text,
      case
        when raw_number like '%.%' then regexp_replace(raw_number, '\.?0+$', '')
        else raw_number
      end as grade_number,
      case
        when grader_col <> '' then grader_col
        else parsed_company
      end as grader
    from cond
  )
  select concat_ws(
    '|',
    lower(btrim(coalesce(p_player, ''))),
    lower(btrim(case
      when nullif(btrim(coalesce(p_year_label, '')), '') is not null then btrim(p_year_label)
      when p_year is not null and p_year > 0 then p_year::text
      else ''
    end)),
    case
      when p_set is null or btrim(p_set) = '' then ''
      else coalesce(
        nullif(
          btrim(regexp_replace(
            regexp_replace(lower(btrim(p_set)), '\ypanini\y', '', 'g'),
            '\s+',
            ' ',
            'g'
          )),
          ''
        ),
        lower(btrim(p_set))
      )
    end,
    lower(btrim(regexp_replace(btrim(coalesce(p_number, '')), '^#', ''))),
    case
      when nullif(lower(btrim(coalesce(p_parallel, ''))), '') is null then 'base'
      else lower(btrim(p_parallel))
    end,
    case
      when condition = 'raw' then 'raw'
      when condition <> 'graded'
        and grader = ''
        and (grade_text = '' or grade_text ~ 'raw|ungraded|^none$')
        then 'raw'
      when grader = '' then coalesce(nullif(grade_number, ''), 'raw')
      when grade_number = '' then grader
      else grader || ' ' || grade_number
    end
  )
  from norm;
$$;

create index if not exists cards_public_identity_idx
  on public.cards (
    public.card_identity_key(
      player,
      year_label,
      year,
      coalesce(set_name, "set"),
      card_number,
      parallel,
      condition_type,
      grader,
      grade
    )
  )
  where is_public = true;

-- Posts whose attached card is this id, or another public card with the same identity.
-- Card columns are the public_cards projection. Owner-only rows are used only so the
-- owner can see posts on their own private copy, and only safe columns are returned.
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
  where p_before is null
    or (p.created_at, p.id) < (p_before, p_before_id)
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 6), 41));
$$;

grant execute on function public.card_identity_key(text, text, integer, text, text, text, text, text, text)
  to anon, authenticated;

grant execute on function public.posts_about_card(uuid, integer, timestamptz, uuid)
  to anon, authenticated;
