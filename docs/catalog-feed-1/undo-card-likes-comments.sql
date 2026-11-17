-- UNDO for docs/catalog-feed-1/proposed-card-likes-comments.sql.
-- UNAPPLIED. Needs review before running. Only run it if that proposal was applied.
-- It removes every card heart and card comment. Post likes and replies are untouched.

begin;

drop table if exists public.card_comments;
drop table if exists public.card_likes;

notify pgrst, 'reload schema';

commit;
