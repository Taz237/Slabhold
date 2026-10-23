-- RLS checks for want_list, want_alerts, and card_value_snapshots.
-- Uses ONLY the updates account (@slabholdupdates, formerly @grokbotreview).
-- Prefer the profile uuid; accept either handle.
-- Wrapped in a transaction that always rolls back. Does not delete accounts.

BEGIN;

DO $$
DECLARE
  bot_id uuid;
  want_id uuid;
  owned_card uuid;
  seen int;
  rejected boolean;
BEGIN
  SELECT id INTO bot_id
  FROM public.profiles
  WHERE id = '6d31ab97-9162-4296-876d-9e0378872fce'
     OR lower(username) IN ('slabholdupdates', 'grokbotreview')
  ORDER BY CASE WHEN id = '6d31ab97-9162-4296-876d-9e0378872fce' THEN 0 ELSE 1 END
  LIMIT 1;

  IF bot_id IS NULL THEN
    RAISE NOTICE 'FAIL: updates profile not found';
    RETURN;
  END IF;

  RAISE NOTICE 'PASS: resolved updates account only (%).', bot_id;

  INSERT INTO public.cards (user_id, player, year, "set")
  VALUES (bot_id, 'RLS Want', 2020, 'Select')
  RETURNING id INTO owned_card;

  INSERT INTO public.want_list (user_id, card_key, label)
  VALUES (bot_id, 'rls-key', 'RLS label')
  RETURNING id INTO want_id;

  INSERT INTO public.want_alerts (want_id, user_id, source_type, source_id)
  VALUES (want_id, bot_id, 'sale', 'item-rls');

  -- card_key is required after 20261023001052. It survives a later card delete.
  INSERT INTO public.card_value_snapshots (card_id, card_key, snapshot_date, median)
  VALUES (owned_card, owned_card, DATE '2026-10-17', 10);

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', bot_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO seen FROM public.want_list WHERE user_id = bot_id AND card_key = 'rls-key';
  IF seen = 1 THEN
    RAISE NOTICE 'PASS: select own want_list';
  ELSE
    RAISE NOTICE 'FAIL: select own want_list (%)', seen;
  END IF;

  BEGIN
    INSERT INTO public.want_list (user_id, card_key, label)
    VALUES (bot_id, 'rls-key-2', 'Second');
    RAISE NOTICE 'PASS: insert own want_list';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL: insert own want_list: %', SQLERRM;
  END;

  rejected := false;
  BEGIN
    INSERT INTO public.want_list (user_id, card_key, label)
    VALUES (gen_random_uuid(), 'rls-other', 'nope');
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF rejected THEN
    RAISE NOTICE 'PASS: want_list insert for another user rejected';
  ELSE
    RAISE NOTICE 'FAIL: want_list insert for another user allowed';
  END IF;

  SELECT count(*) INTO seen FROM public.want_alerts WHERE user_id = bot_id;
  IF seen >= 1 THEN
    RAISE NOTICE 'PASS: select own want_alerts';
  ELSE
    RAISE NOTICE 'FAIL: select own want_alerts';
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.want_alerts (want_id, user_id, source_type, source_id)
    VALUES (want_id, bot_id, 'post', 'should-fail');
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF rejected THEN
    RAISE NOTICE 'PASS: want_alerts insert rejected for authenticated';
  ELSE
    RAISE NOTICE 'FAIL: want_alerts insert allowed';
  END IF;

  SELECT count(*) INTO seen
  FROM public.card_value_snapshots AS snaps
  WHERE snaps.card_id = owned_card AND snaps.snapshot_date = DATE '2026-10-17';
  IF seen = 1 THEN
    RAISE NOTICE 'PASS: select own card_value_snapshots';
  ELSE
    RAISE NOTICE 'FAIL: select own card_value_snapshots (%)', seen;
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.card_value_snapshots (card_id, card_key, snapshot_date, median)
    VALUES (owned_card, owned_card, DATE '2026-10-16', 9);
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF rejected THEN
    RAISE NOTICE 'PASS: card_value_snapshots insert rejected';
  ELSE
    RAISE NOTICE 'FAIL: card_value_snapshots insert allowed';
  END IF;
END $$;

ROLLBACK;
