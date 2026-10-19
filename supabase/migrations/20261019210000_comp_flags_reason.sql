-- Reason on a wrong-sale flag. Existing rows stay null (no row updates).
-- New flags from /api/comps/flags always send a reason.
-- Owners can already select their flags. They can also delete their own.

alter table public.comp_flags
  add column if not exists reason text;

alter table public.comp_flags drop constraint if exists comp_flags_reason_check;
alter table public.comp_flags
  add constraint comp_flags_reason_check
  check (
    reason is null
    or reason in ('wrong_set', 'wrong_parallel', 'wrong_grade', 'wrong_card', 'lot')
  );

drop policy if exists "Users delete own comp flags" on public.comp_flags;
create policy "Users delete own comp flags"
  on public.comp_flags
  for delete
  using (auth.uid() = user_id);

grant select, delete on public.comp_flags to authenticated;
