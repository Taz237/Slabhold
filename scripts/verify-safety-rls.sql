-- RLS for blocks, mutes, and reports, plus private block/mute checks.
-- Writes only as @grokbotreview. Another profile id is a read-only FK target.
-- Always rolls back. Does not delete accounts. Do not run against production.

BEGIN;

DO $$
DECLARE
  bot_id uuid;
  other_id uuid;
  stranger_a uuid := '00000000-0000-4000-8000-000000000001';
  stranger_b uuid := '00000000-0000-4000-8000-000000000002';
  rejected boolean;
  seen int;
  n int;
  blocked boolean;
  muted boolean;
  allowed boolean;
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

  IF stranger_a = bot_id OR stranger_b = bot_id OR stranger_a = other_id OR stranger_b = other_id THEN
    stranger_a := '00000000-0000-4000-8000-000000000003';
    stranger_b := '00000000-0000-4000-8000-000000000004';
  END IF;

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

    SELECT private.is_blocked(bot_id, other_id) INTO blocked;
    IF NOT blocked THEN
      RAISE EXCEPTION 'FAIL: is_blocked did not see the new block';
    END IF;

    SELECT public.can_interact(other_id) INTO allowed;
    IF allowed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'FAIL: can_interact allowed a blocked pair';
    END IF;

    n := -1;
    rejected := false;
    BEGIN
      UPDATE public.blocks SET created_at = now() WHERE blocker_id = bot_id;
      GET DIAGNOSTICS n = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      rejected := true;
    END;
    IF NOT rejected AND n <> 0 THEN
      RAISE EXCEPTION 'FAIL: block update was accepted (% rows)', n;
    END IF;

    INSERT INTO public.mutes (muter_id, muted_id)
    VALUES (bot_id, other_id);
    SELECT private.is_muted(bot_id, other_id) INTO muted;
    IF NOT muted THEN
      RAISE EXCEPTION 'FAIL: is_muted did not see the new mute';
    END IF;
    SELECT private.is_muted(other_id, bot_id) INTO muted;
    IF muted THEN
      RAISE EXCEPTION 'FAIL: mute was not one-way';
    END IF;
  END IF;

  rejected := false;
  BEGIN
    PERFORM private.is_blocked(stranger_a, stranger_b);
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL: is_blocked for an unrelated pair was callable';
  END IF;

  rejected := false;
  BEGIN
    PERFORM private.is_muted(stranger_a, stranger_b);
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL: is_muted for an unrelated pair was callable';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.is_blocked(stranger_a, stranger_b);
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL: public.is_blocked was callable';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.is_muted(stranger_a, stranger_b);
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL: public.is_muted was callable';
  END IF;

  INSERT INTO public.reports (reporter_id, target_type, target_id, reported_user_id, reason)
  VALUES (bot_id, 'user', bot_id::text, bot_id, 'spam');

  SELECT count(*) INTO seen
  FROM public.reports
  WHERE reporter_id = bot_id AND target_type = 'user';
  IF seen <> 1 THEN
    RAISE EXCEPTION 'FAIL: own report was not readable';
  END IF;

  n := -1;
  rejected := false;
  BEGIN
    UPDATE public.reports SET status = 'reviewed' WHERE reporter_id = bot_id;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected AND n <> 0 THEN
    RAISE EXCEPTION 'FAIL: report update was accepted (% rows)', n;
  END IF;

  n := -1;
  rejected := false;
  BEGIN
    DELETE FROM public.reports WHERE reporter_id = bot_id;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected AND n <> 0 THEN
    RAISE EXCEPTION 'FAIL: report delete was accepted (% rows)', n;
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
