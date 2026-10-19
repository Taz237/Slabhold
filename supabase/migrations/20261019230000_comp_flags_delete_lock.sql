-- Undo and restore reprice through /api/comps/flags (service role).
-- A direct client delete must not remove a flag without repricing.

drop policy if exists "Users delete own comp flags" on public.comp_flags;

revoke delete on public.comp_flags from authenticated;
revoke delete on public.comp_flags from anon;
