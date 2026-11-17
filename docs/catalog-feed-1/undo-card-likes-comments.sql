-- UNDO for supabase/migrations/20261117120000_card_likes_comments.sql.
-- UNAPPLIED. Needs review before running. Only run it if that migration was applied.
-- It removes every card heart and card comment. Post likes and replies are untouched.

begin;

drop table if exists public.card_comments;
drop table if exists public.card_likes;

notify pgrst, 'reload schema';

commit;
