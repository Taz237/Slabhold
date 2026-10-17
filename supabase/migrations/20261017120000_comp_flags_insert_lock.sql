-- comp_flags writes go through /api/comps/flags with the service role.
-- Drop the authenticated insert policy so a signed-in user cannot insert
-- a flag for a card they do not own.

drop policy if exists "Users insert own comp flags" on public.comp_flags;
revoke insert on public.comp_flags from authenticated;

-- comps_rate_limits.user_id is a uuid foreign key to auth.users, so a
-- logged-out IP cannot be stored there. Anonymous card-value reads use this
-- sibling table (service role only).

create table if not exists public.anon_rate_limits (
  subject text not null,
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (subject, bucket, window_start)
);

alter table public.anon_rate_limits enable row level security;

revoke all on public.anon_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.anon_rate_limits to service_role;
