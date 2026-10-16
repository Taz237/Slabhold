-- Allow unpaid / unknown purchase price (empty "What you paid" → null).
alter table public.cards
  alter column paid_price drop not null;

alter table public.cards
  alter column paid_price set default null;
