-- RLS for blocks, mutes, and reports, plus is_blocked.
-- Writes only as @grokbotreview. Another profile id is a read-only FK target.
-- Always rolls back. Does not delete accounts. Do not run against production.

BEGIN;

DO $$
DECLARE
  bot_id uuid;
  other_id uuid;
  rejected boolean;
  seen int;
  blocked boolean;
  muted boolean;
BEGIN
  SELECT id INTO bot_id
  FROM public.profiles
  WHERE lower(username) = 'grokbotreview'
  LIMIT 1;

  IF bot_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: @grokbotreview profile not found';
  END IF;

  SELECT id INTO other_id
  FROM public.profiles
  WHERE id <> bot_id
  LIMIT 1;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', bot_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  rejected := false;
  BEGIN
    INSERT INTO public.blocks (blocker_id, blocked_id)
    VALUES (bot_id, bot_id);
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL: blocking yourself was accepted';
  END IF;

  IF other_id IS NULL THEN
    RAISE NOTICE 'SKIP: no second profile for block pair';
  ELSE
    INSERT INTO public.blocks (blocker_id, blocked_id)
    VALUES (bot_id, other_id);

    SELECT count(*) INTO seen FROM public.blocks WHERE blocker_id = bot_id;
    IF seen <> 1 THEN
      RAISE EXCEPTION 'FAIL: own block was not readable';
    END IF;

    SELECT public.is_blocked(bot_id, other_id) INTO blocked;
    IF NOT blocked THEN
      RAISE EXCEPTION 'FAIL: is_blocked did not see the new block';
    END IF;

    rejected := false;
    BEGIN
      UPDATE public.blocks SET created_at = now() WHERE blocker_id = bot_id;
    EXCEPTION WHEN OTHERS THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'FAIL: block update was accepted';
    END IF;

    INSERT INTO public.mutes (muter_id, muted_id)
    VALUES (bot_id, other_id);
    SELECT public.is_muted(bot_id, other_id) INTO muted;
    IF NOT muted THEN
      RAISE EXCEPTION 'FAIL: is_muted did not see the new mute';
    END IF;
    SELECT public.is_muted(other_id, bot_id) INTO muted;
    IF muted THEN
      RAISE EXCEPTION 'FAIL: mute was not one-way';
    END IF;
  END IF;

  INSERT INTO public.reports (reporter_id, target_type, target_id, reported_user_id, reason)
  VALUES (bot_id, 'user', bot_id::text, bot_id, 'spam');

  SELECT count(*) INTO seen
  FROM public.reports
  WHERE reporter_id = bot_id AND target_type = 'user';
  IF seen <> 1 THEN
    RAISE EXCEPTION 'FAIL: own report was not readable';
  END IF;

  rejected := false;
  BEGIN
    UPDATE public.reports SET status = 'reviewed' WHERE reporter_id = bot_id;
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL: report update was accepted';
  END IF;

  rejected := false;
  BEGIN
    DELETE FROM public.reports WHERE reporter_id = bot_id;
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL: report delete was accepted';
  END IF;

  IF other_id IS NOT NULL THEN
    rejected := false;
    BEGIN
      INSERT INTO public.reports (reporter_id, target_type, target_id, reported_user_id, reason)
      VALUES (other_id, 'user', other_id::text, bot_id, 'spam');
    EXCEPTION WHEN OTHERS THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'FAIL: report as another user was accepted';
    END IF;
  END IF;

  RAISE NOTICE 'PASS';
END $$;

ROLLBACK;
