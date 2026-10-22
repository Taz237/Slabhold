-- Donnie must approve this migration before it is applied.
-- Groundwork for collectors messaging each other about a public card.
-- Not a marketplace: no payments, checkout, listings, escrow, or fees.
--
-- cards.open_to_offers stays false unless the owner sets it, and only a public
-- card may be true. Other people can read it through public_cards.
-- messages.card_preview is cardId-only: {"cardId":"<uuid>"} and nothing else.

begin;

alter table public.cards
  add column if not exists open_to_offers boolean;

update public.cards
set open_to_offers = false
where open_to_offers is null;

alter table public.cards
  alter column open_to_offers set default false;

alter table public.cards
  alter column open_to_offers set not null;

comment on column public.cards.open_to_offers is
  'Owner will hear offers in DMs. False by default. Readable by others only while the card is public.';

-- A private card cannot stay open to offers. The trigger clears the flag
-- before the check, so making a card private still succeeds.
create or replace function public.clear_open_to_offers_when_private()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_public is distinct from true then
    new.open_to_offers := false;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_open_to_offers_when_private() from public, anon, authenticated;

drop trigger if exists cards_clear_open_to_offers_when_private on public.cards;
create trigger cards_clear_open_to_offers_when_private
  before insert or update of is_public, open_to_offers on public.cards
  for each row
  execute function public.clear_open_to_offers_when_private();

alter table public.cards drop constraint if exists cards_open_to_offers_requires_public;
alter table public.cards
  add constraint cards_open_to_offers_requires_public
  check (open_to_offers = false or is_public is true);

-- Same owner-only update rule as the existing cards policies.
drop policy if exists "Users can update own cards" on public.cards;
create policy "Users can update own cards"
  on public.cards
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Append-only so create-or-replace keeps the existing public_cards columns.
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
where is_public = true;

revoke insert, update, delete, truncate, references, trigger
  on public.public_cards from anon, authenticated, public;
grant select on public.public_cards to anon, authenticated;

comment on view public.public_cards is
  'Public card fields only, including open_to_offers. Sensitive columns stay omitted. Private cards are not in this view.';

-- Card preview on an existing DM. Text messages stay unchanged.
alter table public.messages
  add column if not exists kind text;

update public.messages
set kind = 'text'
where kind is null;

alter table public.messages
  alter column kind set default 'text';

alter table public.messages
  alter column kind set not null;

alter table public.messages
  add column if not exists card_preview jsonb;

alter table public.messages drop constraint if exists messages_kind;
alter table public.messages
  add constraint messages_kind
  check (kind in ('text', 'card_preview'));

alter table public.messages drop constraint if exists messages_content_len;
alter table public.messages
  add constraint messages_content_len
  check (
    (
      kind = 'card_preview'
      and char_length(content) <= 1000
    )
    or (
      kind = 'text'
      and char_length(btrim(content)) between 1 and 1000
    )
  );

-- cardId-only shape rule: one key, a uuid string, and a small payload.
alter table public.messages drop constraint if exists messages_card_preview_shape;
alter table public.messages
  add constraint messages_card_preview_shape
  check (
    (
      kind = 'text'
      and card_preview is null
    )
    or (
      kind = 'card_preview'
      and jsonb_typeof(card_preview) = 'object'
      and card_preview = jsonb_build_object('cardId', card_preview->>'cardId')
      and (card_preview->>'cardId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and pg_column_size(card_preview) <= 256
    )
  );

-- Text DMs keep the existing block rule. A card preview must also be a public
-- open-to-offers card owned by the recipient, and neither person has muted
-- the other. You still cannot message yourself.
drop policy if exists "Send messages as yourself" on public.messages;
create policy "Send messages as yourself" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and sender_id <> receiver_id
    and not private.is_blocked(auth.uid(), receiver_id)
    and (
      kind = 'text'
      or (
        kind = 'card_preview'
        and not private.is_muted(auth.uid(), receiver_id)
        and not private.is_muted(receiver_id, auth.uid())
        and exists (
          select 1
          from public.public_cards pc
          where pc.user_id = receiver_id
            and pc.open_to_offers is true
            and pc.id::text = card_preview->>'cardId'
        )
      )
    )
  );

create or replace function public.protect_message_rows()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.sender_id is distinct from old.sender_id
    or new.receiver_id is distinct from old.receiver_id
    or new.content is distinct from old.content
    or new.created_at is distinct from old.created_at
    or new.kind is distinct from old.kind
    or new.card_preview is distinct from old.card_preview then
    raise exception 'Only the read status of a message can change';
  end if;
  return new;
end;
$$;

commit;
