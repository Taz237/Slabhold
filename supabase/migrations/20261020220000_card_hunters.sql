-- Public hunters for one card identity.
-- Returns user_id only. Table policies are unchanged.
-- A person is listed only when profiles.show_as_hunter is true.
-- The column defaults to false, so existing wants stay opted out.
-- "Users update own profile" is row-wide (auth.uid() = id) and the
-- profiles update grant is not limited to a column list, so owners
-- can change this new flag. No policy change in this file.

alter table public.profiles
  add column if not exists show_as_hunter boolean not null default false;

comment on column public.profiles.show_as_hunter is
  'When true, card_hunters may list this account for cards they want. Prices and notes stay on want_list.';

create or replace function public.card_hunters(p_card_key text)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id
  from (
    select w.user_id, max(w.created_at) as recent_at
    from public.want_list w
    join public.profiles p on p.id = w.user_id
    where w.card_key = p_card_key
      and p.show_as_hunter is true
      and w.user_id is not null
    group by w.user_id
  ) s
  order by s.recent_at desc, s.user_id
  limit 1000;
$$;

revoke all on function public.card_hunters(text) from public;
grant execute on function public.card_hunters(text) to anon, authenticated;
