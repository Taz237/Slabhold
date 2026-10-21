-- Public hunters for one card identity.
-- Returns user_id only. Table policies are unchanged.
-- A want is public only when want_list.is_public is true.

alter table public.want_list
  add column if not exists is_public boolean not null default true;

comment on column public.want_list.is_public is
  'When true, this want may be listed by card_hunters. Row policies are unchanged.';

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
    where w.card_key = p_card_key
      and w.is_public is true
      and w.user_id is not null
    group by w.user_id
  ) s
  order by s.recent_at desc, s.user_id
  limit 1000;
$$;

revoke all on function public.card_hunters(text) from public;
grant execute on function public.card_hunters(text) to anon, authenticated;
