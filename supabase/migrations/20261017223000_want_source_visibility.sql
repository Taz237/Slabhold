-- Want inserts and updates may only point at a card the user can already see.
-- Does not drop columns. Select and delete policies stay owner-only.

drop policy if exists "Users insert own wants" on public.want_list;
drop policy if exists "Users update own wants" on public.want_list;

create policy "Users insert own wants"
  on public.want_list for insert
  with check (
    auth.uid() = user_id
    and (
      source_card_id is null
      or exists (select 1 from public.public_cards pc where pc.id = source_card_id)
      or exists (
        select 1 from public.cards c
        where c.id = source_card_id and c.user_id = auth.uid()
      )
    )
  );

create policy "Users update own wants"
  on public.want_list for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      source_card_id is null
      or exists (select 1 from public.public_cards pc where pc.id = source_card_id)
      or exists (
        select 1 from public.cards c
        where c.id = source_card_id and c.user_id = auth.uid()
      )
    )
  );
