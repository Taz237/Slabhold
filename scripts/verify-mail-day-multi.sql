-- Mail Day multi-card privacy and trigger checks.
-- Writes only as the updates account (@slabholdupdates, formerly @grokbotreview).
-- Same profile uuid. Another card id is a read-only target.
-- Always rolls back.

BEGIN;

DO $$
DECLARE
  bot_id uuid;
  other_card uuid;
  v_public uuid := gen_random_uuid();
  v_private uuid := gen_random_uuid();
  v_post uuid := gen_random_uuid();
  v_foreign uuid := gen_random_uuid();
  rejected boolean;
  n int;
  meta_text text;
  sport_text text;
  hidden timestamptz;
BEGIN
  SELECT id INTO bot_id
  FROM public.profiles
  WHERE id = '6d31ab97-9162-4296-876d-9e0378872fce'
     OR lower(username) IN ('slabholdupdates', 'grokbotreview')
  ORDER BY CASE WHEN id = '6d31ab97-9162-4296-876d-9e0378872fce' THEN 0 ELSE 1 END
  LIMIT 1;

  IF bot_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: updates profile not found';
  END IF;

  SELECT c.id INTO other_card
  FROM public.cards c
  WHERE c.user_id <> bot_id
  LIMIT 1;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', bot_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.cards (id, user_id, player, year, "set", grade, is_public, paid_price, sport)
  VALUES
    (v_public, bot_id, 'Public Player', 2024, 'Panini Prizm', 'Raw', true, 12.25, 'Basketball'),
    (v_private, bot_id, 'Private Player', 2024, 'Topps Chrome', 'Raw', false, 77.77, 'Baseball');

  SELECT c.sport INTO sport_text FROM public.cards c WHERE c.id = v_private;
  IF sport_text IS DISTINCT FROM 'Baseball' THEN
    RAISE EXCEPTION 'FAIL: sport did not save on the private card';
  END IF;

  INSERT INTO public.posts (id, user_id, content, post_type, show_paid, card, meta)
  VALUES (
    v_post,
    bot_id,
    'mail day check',
    'mail_day',
    false,
    jsonb_build_object('id', v_public::text, 'playerName', 'Public Player', 'estimatedSellPrice', 0),
    jsonb_build_object(
      'source', 'ebay',
      'acquiredAt', '2026-10-19',
      'paid', 77.77,
      'public', true,
      'cards', jsonb_build_array(
        jsonb_build_object('id', v_public::text, 'showPaid', true, 'photos', '[]'::jsonb, 'playerName', 'Public Player'),
        jsonb_build_object('id', v_private::text, 'showPaid', true, 'paid', 77.77, 'public', true, 'playerName', 'Private Player')
      )
    )
  );

  INSERT INTO public.post_cards (post_id, card_id, position)
  VALUES (v_post, v_public, 0), (v_post, v_private, 1);

  SELECT p.meta::text INTO meta_text FROM public.posts p WHERE p.id = v_post;
  IF meta_text LIKE '%77.77%' OR meta_text LIKE '%"paid"%' OR meta_text LIKE '%"public"%' THEN
    RAISE EXCEPTION 'FAIL: posts.meta kept paid or public (%).', meta_text;
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.posts (id, user_id, content, post_type, card)
    VALUES (
      v_foreign,
      bot_id,
      'foreign',
      'mail_day',
      jsonb_build_object('id', coalesce(other_card, gen_random_uuid())::text)
    );
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL: another user''s card id was accepted on the post';
  END IF;

  rejected := false;
  BEGIN
    INSERT INTO public.post_cards (post_id, card_id, position)
    VALUES (v_post, coalesce(other_card, gen_random_uuid()), 2);
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL: another user''s card id was accepted in post_cards';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';

  SELECT p.meta::text INTO meta_text FROM public.posts p WHERE p.id = v_post;
  IF meta_text IS NULL OR meta_text LIKE '%77.77%' OR meta_text LIKE '%"paid"%' THEN
    RAISE EXCEPTION 'FAIL: anon posts response leaked paid';
  END IF;

  SELECT count(*) INTO n FROM public.post_cards pc WHERE pc.post_id = v_post;
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL: anon could not read both post_cards rows (%)', n;
  END IF;

  SELECT count(*) INTO n FROM public.mail_day_paid(ARRAY[v_post]) paid_row WHERE paid_row.card_id = v_private;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: anon rpc returned the private card';
  END IF;

  SELECT count(*) INTO n FROM public.mail_day_paid(ARRAY[v_post]) paid_row WHERE paid_row.card_id = v_public AND paid_row.paid = 12.25;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL: anon rpc did not return the public card paid (%)', n;
  END IF;

  SELECT count(*) INTO n FROM public.public_cards pc WHERE pc.id = v_private;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: private card was visible in public_cards';
  END IF;

  SELECT count(*) INTO n FROM public.cards c WHERE c.id = v_private;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: anon read the private cards row';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', bot_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  DELETE FROM public.cards c WHERE c.id = v_public;

  UPDATE public.posts p
  SET content = 'mail day check updated'
  WHERE p.id = v_post;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'service_role', 'sub', bot_id::text)::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE service_role';

  UPDATE public.posts p
  SET hidden_at = now(), hidden_by = bot_id
  WHERE p.id = v_post;

  SELECT p.hidden_at INTO hidden FROM public.posts p WHERE p.id = v_post;
  IF hidden IS NULL THEN
    RAISE EXCEPTION 'FAIL: moderation hide was rejected after the card was deleted';
  END IF;

  RAISE NOTICE 'PASS: mail day multi-card privacy, trigger, and deleted-card update';
END $$;

ROLLBACK;
