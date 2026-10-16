-- Fix graded backfill: Postgres \b is backspace, not a word boundary (\y).
-- Split company into grader and numeric grade when the old grade text has a company.

alter table public.cards add column if not exists grader text;

update public.cards
set
  condition_type = 'graded',
  grader = upper((regexp_match(grade, '\y(PSA|BGS|SGC|CGC|TAG|HGA)\y', 'i'))[1]),
  grade = coalesce((regexp_match(grade, '(\d+(?:\.\d+)?)'))[1], '')
where
  (grader is null or condition_type = 'raw')
  and trim(coalesce(grade, '')) <> ''
  and lower(grade) !~ 'raw|ungraded|^none$'
  and grade ~* '\y(PSA|BGS|SGC|CGC|TAG|HGA)\y';

select
  count(*) filter (
    where condition_type = 'graded'
      and grader is not null
      and nullif(trim(grade), '') is not null
  ) as graded,
  count(*) filter (where condition_type = 'raw') as raw,
  count(*) filter (
    where condition_type = 'graded'
      and (grader is null or nullif(trim(grade), '') is null)
  ) as needs_details
from public.cards;
