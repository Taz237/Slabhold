-- Donnie must approve this migration before it is applied.
-- A collector can mark one of their cards sold or traded. The other person confirms.
-- No payments and no fees.
-- price_cents stays on deals and is readable only by the seller and the buyer.
-- The write path is private.* (security definer, search_path empty). Clients call
-- public.create_deal, public.respond_deal, and public.cancel_deal.

begin;

set local lock_timeout = '5s';

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

alter table public.cards
  add column if not exists sold_at timestamptz;

alter table public.cards
  add column if not exists sold_deal_id uuid;

comment on column public.cards.sold_at is
  'Set when a deal is confirmed. The card stays on the owner account and leaves the public collection.';

create table if not exists public.deals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  card_id uuid,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  price_cents integer,
  status text not null,
  card_player text not null default '',
  card_year text not null default '',
  card_set text not null default '',
  card_number text not null default '',
  card_parallel text not null default '',
  created_at timestamptz not null default pg_catalog.now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint deals_card_id_fkey foreign key (card_id) references public.cards (id) on delete set null,
  constraint deals_seller_not_buyer check (seller_id <> buyer_id),
  constraint deals_kind check (kind in ('sale', 'trade')),
  constraint deals_price_cents check (
    price_cents is null or (price_cents >= 0 and price_cents <= 100000000)
  ),
  constraint deals_status check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  constraint deals_confirmed_at check (
    (status = 'confirmed' and confirmed_at is not null)
    or (status <> 'confirmed' and confirmed_at is null)
  ),
  constraint deals_pending_has_card check (status <> 'pending' or card_id is not null)
);

comment on table public.deals is
  'Sold or traded card, confirmed by the buyer. price_cents is for the two parties only. A deleted card keeps a confirmed deal and its snapshot.';

create unique index if not exists deals_one_pending_per_card
  on public.deals (card_id)
  where status = 'pending';

create index if not exists deals_seller_idx
  on public.deals (seller_id, created_at desc);

create index if not exists deals_buyer_idx
  on public.deals (buyer_id, created_at desc);

alter table public.cards drop constraint if exists cards_sold_deal_id_fkey;
alter table public.cards
  add constraint cards_sold_deal_id_fkey
  foreign key (sold_deal_id) references public.deals (id) on delete set null;

alter table public.deals enable row level security;

drop policy if exists "Seller or buyer can read deals" on public.deals;
create policy "Seller or buyer can read deals"
  on public.deals
  for select
  to authenticated
  using (auth.uid() = seller_id or auth.uid() = buyer_id);

revoke all on public.deals from anon, authenticated;
grant select on public.deals to authenticated;

-- Direct writes from API roles are rejected even if a policy is added later.
-- security definer functions run as the owner, not as authenticated.
create or replace function private.reject_direct_deal_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'permission denied for table deals'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.reject_direct_deal_write() from public, anon, authenticated;

drop trigger if exists deals_reject_direct_write on public.deals;
create trigger deals_reject_direct_write
  before insert or update or delete on public.deals
  for each row
  execute function private.reject_direct_deal_write();

-- API roles cannot mark a card sold. The confirm function runs as the owner.
create or replace function private.reject_direct_sold_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.sold_at is not null or new.sold_deal_id is not null then
        raise exception 'permission denied for column sold_at'
          using errcode = '42501';
      end if;
    elsif new.sold_at is distinct from old.sold_at
       or new.sold_deal_id is distinct from old.sold_deal_id then
      raise exception 'permission denied for column sold_at'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.reject_direct_sold_write() from public, anon, authenticated;
grant execute on function private.reject_direct_sold_write() to authenticated;

drop trigger if exists cards_reject_direct_sold_write on public.cards;
create trigger cards_reject_direct_sold_write
  before insert or update of sold_at, sold_deal_id on public.cards
  for each row
  execute function private.reject_direct_sold_write();

-- Deleting a card keeps confirmed deals. Pending ones are cancelled first,
-- then the foreign key clears card_id. Runs as the owner so the deal write
-- guard above allows it.
create or replace function private.cancel_pending_deals_for_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.deals
  set status = 'cancelled',
      updated_at = pg_catalog.now()
  where card_id = old.id
    and status = 'pending';
  return old;
end;
$$;

revoke all on function private.cancel_pending_deals_for_card() from public, anon, authenticated;
grant execute on function private.cancel_pending_deals_for_card() to authenticated;

drop trigger if exists cards_cancel_pending_deals on public.cards;
create trigger cards_cancel_pending_deals
  before delete on public.cards
  for each row
  execute function private.cancel_pending_deals_for_card();

-- Clients cannot forge the confirm prompt. The definer insert bypasses this policy.
drop policy if exists "Create notifications as yourself" on public.notifications;
create policy "Create notifications as yourself"
  on public.notifications
  for insert
  with check (
    auth.uid() = actor_id
    and actor_id <> recipient_id
    and kind <> 'quote'
    and kind <> 'want_alert'
    and kind <> 'deal_confirm'
    and not private.is_blocked(auth.uid(), recipient_id)
  );

alter table public.notifications drop constraint if exists notifications_kind;
alter table public.notifications
  add constraint notifications_kind
  check (kind in (
    'like',
    'comment',
    'follow',
    'repost',
    'mention',
    'quote',
    'want_alert',
    'deal_confirm'
  ));

create or replace function private.create_deal(
  p_card_id uuid,
  p_buyer_id uuid,
  p_kind text,
  p_price_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid := auth.uid();
  v_player text;
  v_year text;
  v_set text;
  v_num text;
  v_parallel text;
  v_sport text;
  v_rookie boolean;
  v_username text;
  v_deal uuid;
  v_recent integer;
begin
  if v_seller is null then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_kind is distinct from 'sale' and p_kind is distinct from 'trade' then
    raise exception 'invalid kind' using errcode = '22023';
  end if;
  if p_price_cents is not null and p_price_cents < 0 then
    raise exception 'price must be positive' using errcode = '22023';
  end if;
  if p_price_cents is not null and p_price_cents > 100000000 then
    raise exception 'price too high' using errcode = '22023';
  end if;
  if p_buyer_id is null or p_buyer_id = v_seller then
    raise exception 'invalid buyer' using errcode = '22023';
  end if;

  if private.is_blocked(v_seller, p_buyer_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select
    player,
    coalesce(nullif(pg_catalog.btrim(year_label), ''), year::text),
    coalesce(nullif(pg_catalog.btrim(set_name), ''), "set"),
    card_number,
    parallel,
    sport,
    is_rookie
  into v_player, v_year, v_set, v_num, v_parallel, v_sport, v_rookie
  from public.cards
  where id = p_card_id
    and user_id = v_seller
    and sold_at is null
    and (sell_date is null or sell_price is null)
  for update;

  if not found then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.messages
    where (sender_id = v_seller and receiver_id = p_buyer_id)
       or (sender_id = p_buyer_id and receiver_id = v_seller)
  ) then
    raise exception 'no conversation' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_seller::text),
    pg_catalog.hashtext(p_buyer_id::text)
  );

  select count(*)
  into v_recent
  from public.deals
  where seller_id = v_seller
    and buyer_id = p_buyer_id
    and created_at > pg_catalog.now() - interval '1 hour';

  if v_recent >= 5 then
    raise exception 'too many deals' using errcode = '42501';
  end if;

  insert into public.deals (
    card_id,
    seller_id,
    buyer_id,
    kind,
    price_cents,
    status,
    card_player,
    card_year,
    card_set,
    card_number,
    card_parallel
  ) values (
    p_card_id,
    v_seller,
    p_buyer_id,
    p_kind,
    p_price_cents,
    'pending',
    coalesce(v_player, ''),
    coalesce(v_year, ''),
    coalesce(v_set, ''),
    coalesce(v_num, ''),
    coalesce(v_parallel, '')
  )
  returning id into v_deal;

  select username into v_username
  from public.profiles
  where id = v_seller;

  insert into public.notifications (
    recipient_id,
    actor_id,
    kind,
    preview,
    href,
    metadata
  ) values (
    p_buyer_id,
    v_seller,
    'deal_confirm',
    'Confirm deal for ' || coalesce(nullif(pg_catalog.btrim(v_player), ''), 'this card') || '?',
    '/messages/' || coalesce(v_username, ''),
    pg_catalog.jsonb_build_object(
      'deal_id', v_deal,
      'card_id', p_card_id,
      'actor_id', v_seller,
      'player', coalesce(v_player, ''),
      'year', coalesce(v_year, ''),
      'set', coalesce(v_set, ''),
      'num', coalesce(v_num, ''),
      'parallel', coalesce(v_parallel, ''),
      'sport', coalesce(v_sport, ''),
      'rookie', coalesce(v_rookie, false)
    )
  );

  return v_deal;
end;
$$;

create or replace function private.respond_deal(p_deal_id uuid, p_decision text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer uuid := auth.uid();
  v_deal public.deals%rowtype;
  v_sold_at timestamptz;
  v_sell_price numeric;
  v_sell_date date;
begin
  if v_buyer is null then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_decision is distinct from 'confirmed' and p_decision is distinct from 'declined' then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  select * into v_deal
  from public.deals
  where id = p_deal_id
  for update;

  if not found or v_deal.buyer_id is distinct from v_buyer or v_deal.status is distinct from 'pending' then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if p_decision = 'declined' then
    update public.deals
    set status = 'declined',
        updated_at = pg_catalog.now()
    where id = v_deal.id;
    return 'declined';
  end if;

  if private.is_blocked(v_deal.seller_id, v_buyer) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select sold_at, sell_price, sell_date
  into v_sold_at, v_sell_price, v_sell_date
  from public.cards
  where id = v_deal.card_id
    and user_id = v_deal.seller_id
  for update;

  if not found
     or v_sold_at is not null
     or (v_sell_price is not null and v_sell_date is not null) then
    update public.deals
    set status = 'cancelled',
        updated_at = pg_catalog.now()
    where id = v_deal.id
      and status = 'pending';
    return 'already sold';
  end if;

  update public.deals
  set status = 'confirmed',
      confirmed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_deal.id;

  update public.cards
  set sold_at = pg_catalog.now(),
      sold_deal_id = v_deal.id,
      open_to_offers = false,
      sell_price = case
        when v_deal.price_cents is null then sell_price
        else pg_catalog.round(v_deal.price_cents / 100.0, 2)
      end,
      sell_date = case
        when v_deal.price_cents is null then sell_date
        else current_date
      end,
      updated_at = pg_catalog.now()
  where id = v_deal.card_id
    and user_id = v_deal.seller_id;

  return 'confirmed';
end;
$$;

create or replace function private.cancel_deal(p_deal_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid := auth.uid();
  v_id uuid;
begin
  if v_seller is null then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  update public.deals
  set status = 'cancelled',
      updated_at = pg_catalog.now()
  where id = p_deal_id
    and seller_id = v_seller
    and status = 'pending'
  returning id into v_id;

  if v_id is null then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return 'cancelled';
end;
$$;

revoke all on function private.create_deal(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function private.respond_deal(uuid, text) from public, anon, authenticated;
revoke all on function private.cancel_deal(uuid) from public, anon, authenticated;
grant execute on function private.create_deal(uuid, uuid, text, integer) to authenticated;
grant execute on function private.respond_deal(uuid, text) to authenticated;
grant execute on function private.cancel_deal(uuid) to authenticated;

create or replace function public.create_deal(
  p_card_id uuid,
  p_buyer_id uuid,
  p_kind text,
  p_price_cents integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_deal(p_card_id, p_buyer_id, p_kind, p_price_cents);
$$;

create or replace function public.respond_deal(p_deal_id uuid, p_decision text)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.respond_deal(p_deal_id, p_decision);
$$;

create or replace function public.cancel_deal(p_deal_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_deal(p_deal_id);
$$;

revoke all on function public.create_deal(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.respond_deal(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_deal(uuid) from public, anon, authenticated;
grant execute on function public.create_deal(uuid, uuid, text, integer) to authenticated;
grant execute on function public.respond_deal(uuid, text) to authenticated;
grant execute on function public.cancel_deal(uuid) to authenticated;

comment on function public.create_deal(uuid, uuid, text, integer) is
  'Owner asks someone they already message to confirm a sale or trade. Pending only.';
comment on function public.respond_deal(uuid, text) is
  'Buyer confirms or declines a pending deal. Confirm marks the card sold and clears Open to offers.';
comment on function public.cancel_deal(uuid) is
  'Seller cancels a pending deal. The card stays held.';

-- Deal-confirmed cards leave the public collection. A sale recorded by hand stays as it was.
create or replace view public.public_cards
with (security_invoker = false) as
select
  id,
  user_id,
  player,
  year,
  "set",
  grade,
  parallel,
  estimated_value,
  image_url,
  card_number,
  sport,
  accent,
  is_public,
  category,
  created_at,
  updated_at,
  no_number,
  year_label,
  set_name,
  set_is_custom,
  parallel_is_custom,
  serial_run,
  serial_no,
  is_rookie,
  is_auto,
  is_relic,
  condition_type,
  grader,
  grade_qualifier,
  open_to_offers
from public.cards
where is_public = true
  and sold_at is null;

revoke insert, update, delete, truncate, references, trigger
  on public.public_cards from anon, authenticated, public;
grant select on public.public_cards to anon, authenticated;

comment on view public.public_cards is
  'Public card fields only. Deal-confirmed cards and private cards are omitted. A hand-recorded sale stays. price_cents is not here.';

notify pgrst, 'reload schema';

commit;
