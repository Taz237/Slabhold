-- UNAPPLIED. Needs review before running.
-- Learning from scan fixes (docs/scanner-plan.md, post-launch 1). Do not run this
-- on production from this PR, and do not db push it.
--
-- When a collector changes the scanner's top pick (another row or another
-- parallel), the app records what was read and what they chose, as normalized
-- text keys only: no photos, no cert numbers, no card ids, no free text.
-- One row per collector per read, so one person can't outvote anyone.
-- Clients can't read or write the table directly. record_scan_fix writes the
-- caller's own row. scan_fix_boosts returns only fixes that at least 2
-- different collectors agree on, with no user ids.
-- Additive: no existing table, policy or row changes.

create table if not exists public.scan_fixes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  read_key text not null check (char_length(read_key) between 1 and 300),
  wrong_identity text not null default '' check (char_length(wrong_identity) <= 300),
  right_identity text not null check (char_length(right_identity) between 1 and 300),
  right_parallel text not null default '' check (char_length(right_parallel) <= 80),
  created_at timestamptz not null default now(),
  primary key (user_id, read_key)
);

comment on table public.scan_fixes is
  'Scanner fixes: what was read and what the collector chose, as text keys. No photos, certs or card ids. Read only through scan_fix_boosts.';

alter table public.scan_fixes enable row level security;
revoke all on public.scan_fixes from anon, authenticated;

create index if not exists scan_fixes_read_key_idx on public.scan_fixes (read_key);

create or replace function public.record_scan_fix(
  p_read_key text,
  p_wrong_identity text,
  p_right_identity text,
  p_right_parallel text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.scan_fixes (user_id, read_key, wrong_identity, right_identity, right_parallel)
  values (
    auth.uid(),
    left(p_read_key, 300),
    left(coalesce(p_wrong_identity, ''), 300),
    left(p_right_identity, 300),
    left(coalesce(p_right_parallel, ''), 80)
  )
  on conflict (user_id, read_key) do update
    set wrong_identity = excluded.wrong_identity,
        right_identity = excluded.right_identity,
        right_parallel = excluded.right_parallel,
        created_at = now();
end;
$$;

revoke all on function public.record_scan_fix(text, text, text, text) from public;
grant execute on function public.record_scan_fix(text, text, text, text) to authenticated;

create or replace function public.scan_fix_boosts(p_read_keys text[])
returns table (read_key text, right_identity text, right_parallel text, collectors integer)
language sql
stable
security definer
set search_path = public
as $$
  select f.read_key, f.right_identity, f.right_parallel, count(distinct f.user_id)::integer as collectors
  from public.scan_fixes f
  where f.read_key = any (p_read_keys[1:20])
  group by f.read_key, f.right_identity, f.right_parallel
  having count(distinct f.user_id) >= 2
  order by collectors desc
  limit 20;
$$;

revoke all on function public.scan_fix_boosts(text[]) from public;
grant execute on function public.scan_fix_boosts(text[]) to authenticated;
