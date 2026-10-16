-- Card form details: season labels, serial split, raw/graded, attributes.
-- Reuses existing card_number, parallel, and grade (text) — does not add duplicates.

alter table public.cards add column if not exists no_number boolean not null default false;
alter table public.cards add column if not exists year_label text;
alter table public.cards add column if not exists set_name text;
alter table public.cards add column if not exists set_is_custom boolean not null default false;
alter table public.cards add column if not exists parallel_is_custom boolean not null default false;
alter table public.cards add column if not exists serial_run integer;
alter table public.cards add column if not exists serial_no integer;
alter table public.cards add column if not exists is_rookie boolean not null default false;
alter table public.cards add column if not exists is_auto boolean not null default false;
alter table public.cards add column if not exists is_relic boolean not null default false;
alter table public.cards add column if not exists condition_type text not null default 'raw';
alter table public.cards add column if not exists grade_qualifier text;
alter table public.cards add column if not exists cert_number text;

-- condition_type check (idempotent)
alter table public.cards drop constraint if exists cards_condition_type;
alter table public.cards
  add constraint cards_condition_type check (condition_type in ('raw', 'graded'));

-- Backfill year_label / set_name from existing year / set
update public.cards
set year_label = coalesce(nullif(trim(year_label), ''), year::text)
where year_label is null or trim(year_label) = '';

update public.cards
set set_name = coalesce(nullif(trim(set_name), ''), "set")
where set_name is null or trim(set_name) = '';

-- Parallels like "/10" → serial_run + Base
update public.cards
set
  serial_run = (regexp_match(trim(parallel), '^/(\d+)$'))[1]::integer,
  parallel = 'Base'
where trim(parallel) ~ '^/\d+$'
  and serial_run is null;

-- "1/1" parallel → serial_run = 1, keep parallel as 1/1 only if not pure serial;
-- pure "/N" already handled. Map bare "1/1" to serial_run 1 with parallel Base when it is exactly 1/1.
update public.cards
set
  serial_run = 1,
  parallel = 'Base'
where lower(trim(parallel)) = '1/1'
  and serial_run is null;

-- None / empty / Raw / Ungraded → raw
update public.cards
set
  condition_type = 'raw',
  grade = case
    when trim(coalesce(grade, '')) = '' then ''
    when lower(grade) ~ 'raw|ungraded|none' then 'Raw'
    else grade
  end
where
  trim(coalesce(grade, '')) = ''
  or lower(grade) ~ 'raw|ungraded|^none$';

-- Real grader string → graded
update public.cards
set condition_type = 'graded'
where
  trim(coalesce(grade, '')) <> ''
  and lower(grade) !~ 'raw|ungraded|^none$'
  and grade ~* '\b(PSA|BGS|SGC|CGC|TAG|HGA)\b';
