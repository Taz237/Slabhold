-- UNAPPLIED. Needs review before running.
--
-- Perf: indexes for the reads every Home load makes. Indexes only. No policy,
-- table or data changes. Safe to run more than once.
--
-- 1. The For you timeline reads the newest posts:
--      order by created_at desc, id asc limit 30
--    With no index on created_at, Postgres reads every post, runs the posts
--    RLS check (private.is_blocked) on each one, then sorts. That cost grows
--    with every post ever made. With this index it reads the newest ~30 and
--    stops. Local test with 4,000 fake posts: 16.6 ms -> 0.1 ms.
create index if not exists posts_created_at_id_idx
  on public.posts (created_at desc, id);

-- 2. Reposts merge into the same timeline with the same order:
--      order by created_at desc, user_id, post_id limit 30
--    Today only (user_id, created_at) exists, so the global read sorts the
--    whole table.
create index if not exists reposts_created_at_idx
  on public.reposts (created_at desc, user_id, post_id);

-- 3. Follower lists and follower counts filter on following_id. The only
--    follows index is unique (follower_id, following_id), which can't serve
--    following_id alone.
create index if not exists follows_following_id_idx
  on public.follows (following_id);

-- To check after running (each should say "Index Scan" or "Index Only Scan"):
--   explain select id from public.posts order by created_at desc, id limit 30;
--   explain select post_id from public.reposts order by created_at desc, user_id, post_id limit 30;
--   explain select follower_id from public.follows where following_id = '00000000-0000-0000-0000-000000000000';
