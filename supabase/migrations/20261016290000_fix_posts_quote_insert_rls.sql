-- Fix quote insert RLS: the previous EXISTS subquery bound unqualified
-- quoted_post_id to the inner posts row, so every quote insert failed.
-- Ownership alone is enough; the FK on quoted_post_id enforces existence.

drop policy if exists "Create own posts" on public.posts;
create policy "Create own posts" on public.posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "Update own posts" on public.posts;
create policy "Update own posts" on public.posts
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
