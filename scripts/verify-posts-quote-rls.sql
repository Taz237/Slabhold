-- Safe quote-post RLS check.
-- Uses ONLY the @grokbotreview test account (looked up by username).
-- Does not read or write any other user.
-- Wrapped in a transaction that always rolls back.

BEGIN;

DO $$
DECLARE
  bot_id uuid;
  plain_id uuid;
  quote_id uuid;
  rejected boolean := false;
BEGIN
  SELECT id INTO bot_id
  FROM public.profiles
  WHERE lower(username) = 'grokbotreview'
  LIMIT 1;

  IF bot_id IS NULL THEN
    RAISE NOTICE 'FAIL: @grokbotreview profile not found';
    RETURN;
  END IF;

  RAISE NOTICE 'PASS: resolved @grokbotreview only (%).', bot_id;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', bot_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.posts (user_id, content, quoted_post_id)
  VALUES (bot_id, 'rls-verify plain post', null)
  RETURNING id INTO plain_id;

  IF plain_id IS NULL THEN
    RAISE NOTICE 'FAIL: plain post insert returned null';
    RETURN;
  END IF;
  RAISE NOTICE 'PASS: plain post insert as @grokbotreview';

  INSERT INTO public.posts (user_id, content, quoted_post_id)
  VALUES (bot_id, 'rls-verify quote post', plain_id)
  RETURNING id INTO quote_id;

  IF quote_id IS NULL THEN
    RAISE NOTICE 'FAIL: quote post insert returned null';
    RETURN;
  END IF;
  RAISE NOTICE 'PASS: quote post insert as @grokbotreview';

  BEGIN
    INSERT INTO public.posts (user_id, content, quoted_post_id)
    VALUES (gen_random_uuid(), 'rls-verify should fail', null);
    rejected := false;
  EXCEPTION
    WHEN insufficient_privilege THEN
      rejected := true;
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%row-level security%' OR SQLSTATE = '42501' THEN
        rejected := true;
      ELSE
        RAISE NOTICE 'FAIL: unexpected error on foreign user_id insert: %', SQLERRM;
        RETURN;
      END IF;
  END;

  IF rejected THEN
    RAISE NOTICE 'PASS: insert with a different user_id was rejected';
  ELSE
    RAISE NOTICE 'FAIL: insert with a different user_id was allowed';
  END IF;
END $$;

ROLLBACK;
