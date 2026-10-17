-- card_identity_key set aliases must match SET_MANUFACTURER_WORDS /
-- setMatchPhrase() / cardIdentityKey() so posts_about_card treats
-- "Select" and "Panini Select" as the same card.
-- BEGIN set_identity_aliases
-- panini
-- END set_identity_aliases

drop index if exists public.cards_public_identity_idx;

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
            regexp_replace(
              lower(btrim(p_set)),
              '(^|[^[:alnum:]_])(?:panini)([^[:alnum:]_]|$)',
              '\1\2',
              'g'
            ),
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

create index cards_public_identity_idx
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

revoke all on public.comp_flags from anon;
