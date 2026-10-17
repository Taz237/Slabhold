-- Want list, per-card value snapshots, and account-deletion foreign keys.
-- Does not drop columns. New tables have RLS enabled.

-- ---------------------------------------------------------------------------
-- want_list
-- ---------------------------------------------------------------------------

create table if not exists public.want_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_key text not null,
  source_card_id uuid references public.cards (id) on delete set null,
  label text not null,
  target_price numeric,
  created_at timestamptz default now(),
  unique (user_id, card_key),
  constraint want_list_target_price_positive check (target_price is null or target_price > 0)
);

create index if not exists want_list_card_key_idx on public.want_list (card_key);

alter table public.want_list enable row level security;

drop policy if exists "Users select own wants" on public.want_list;
drop policy if exists "Users insert own wants" on public.want_list;
drop policy if exists "Users update own wants" on public.want_list;
drop policy if exists "Users delete own wants" on public.want_list;

create policy "Users select own wants"
  on public.want_list for select
  using (auth.uid() = user_id);

create policy "Users insert own wants"
  on public.want_list for insert
  with check (auth.uid() = user_id);

create policy "Users update own wants"
  on public.want_list for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own wants"
  on public.want_list for delete
  using (auth.uid() = user_id);

revoke all on public.want_list from anon, authenticated;
grant select, insert, update, delete on public.want_list to authenticated;
grant select, insert, update, delete on public.want_list to service_role;

-- ---------------------------------------------------------------------------
-- want_alerts (dedupe log; service role writes)
-- ---------------------------------------------------------------------------

create table if not exists public.want_alerts (
  id uuid primary key default gen_random_uuid(),
  want_id uuid not null references public.want_list (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null,
  source_id text not null,
  created_at timestamptz default now(),
  unique (want_id, source_type, source_id),
  constraint want_alerts_source_type check (source_type in ('sale', 'post', 'listing'))
);

create index if not exists want_alerts_user_id_idx on public.want_alerts (user_id);

alter table public.want_alerts enable row level security;

drop policy if exists "Users read own want alerts" on public.want_alerts;
create policy "Users read own want alerts"
  on public.want_alerts for select
  using (auth.uid() = user_id);

revoke all on public.want_alerts from anon, authenticated;
grant select on public.want_alerts to authenticated;
grant select, insert, update, delete on public.want_alerts to service_role;

-- ---------------------------------------------------------------------------
-- notifications: want_alert + links + cross-user FKs
-- Changed constraints:
--   notifications_post_id_fkey  ON DELETE CASCADE -> ON DELETE SET NULL
--   notifications_actor_id_fkey ON DELETE CASCADE -> ON DELETE SET NULL
--     (actor_id made nullable so ON DELETE SET NULL is valid, and sale alerts
--     have no actor)
-- ---------------------------------------------------------------------------

alter table public.notifications add column if not exists href text;

alter table public.notifications drop constraint if exists notifications_kind;
alter table public.notifications
  add constraint notifications_kind
  check (kind in ('like', 'comment', 'follow', 'repost', 'mention', 'quote', 'want_alert'));

alter table public.notifications drop constraint if exists notifications_actor_id_fkey;
alter table public.notifications alter column actor_id drop not null;
alter table public.notifications
  add constraint notifications_actor_id_fkey
  foreign key (actor_id) references public.profiles (id) on delete set null;

alter table public.notifications drop constraint if exists notifications_post_id_fkey;
alter table public.notifications
  add constraint notifications_post_id_fkey
  foreign key (post_id) references public.posts (id) on delete set null;

alter table public.notifications drop constraint if exists notifications_not_self;
alter table public.notifications
  add constraint notifications_not_self
  check (actor_id is null or actor_id <> recipient_id);

drop policy if exists "Create notifications as yourself" on public.notifications;
create policy "Create notifications as yourself"
  on public.notifications
  for insert
  with check (
    auth.uid() = actor_id
    and actor_id <> recipient_id
    and kind <> 'quote'
    and kind <> 'want_alert'
  );

-- ---------------------------------------------------------------------------
-- card_value_snapshots (service role writes; owner reads via cards.user_id)
-- ---------------------------------------------------------------------------

create table if not exists public.card_value_snapshots (
  card_id uuid references public.cards (id) on delete cascade,
  snapshot_date date not null,
  median numeric,
  primary key (card_id, snapshot_date)
);

alter table public.card_value_snapshots enable row level security;

drop policy if exists "Users read own card value snapshots" on public.card_value_snapshots;
create policy "Users read own card value snapshots"
  on public.card_value_snapshots
  for select
  using (
    exists (
      select 1
      from public.cards
      where cards.id = card_value_snapshots.card_id
        and cards.user_id = auth.uid()
    )
  );

revoke all on public.card_value_snapshots from anon, authenticated;
grant select on public.card_value_snapshots to authenticated;
grant select, insert, update, delete on public.card_value_snapshots to service_role;
