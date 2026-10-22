-- Reject want_list rows whose source_card_id is another user's private card.
-- Inserts only under the updates account (@slabholdupdates, formerly @grokbotreview).
-- Same profile uuid. The other private card is a read-only SELECT.
-- If none exists, that case prints SKIP. Always rolls back. Does not delete accounts.
-- Do not run this script against production.

BEGIN;

DO $$
DECLARE
  bot_id uuid;
  private_id uuid;
  own_id uuid;
  public_id uuid;
  rejected boolean;
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

  SELECT id INTO private_id
  FROM public.cards
  WHERE user_id <> bot_id
    AND is_public IS NOT TRUE
  LIMIT 1;

  INSERT INTO public.cards (user_id, player, year, "set", is_public)
  VALUES (bot_id, 'Want Visibility Own', 1999, 'Probe', false)
  RETURNING id INTO own_id;

  INSERT INTO public.cards (user_id, player, year, "set", is_public)
  VALUES (bot_id, 'Want Visibility Public', 1999, 'Probe', true)
  RETURNING id INTO public_id;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', bot_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  IF private_id IS NULL THEN
    RAISE NOTICE 'SKIP: no other user private card';
  ELSE
    rejected := false;
    BEGIN
      INSERT INTO public.want_list (user_id, card_key, label, source_card_id)
      VALUES (bot_id, 'want-visibility-private', 'probe', private_id);
    EXCEPTION WHEN OTHERS THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'FAIL: private source_card_id was accepted';
    END IF;

    rejected := false;
    BEGIN
      INSERT INTO public.want_list (user_id, card_key, label, source_card_id)
      VALUES (bot_id, 'want-visibility-update', 'upd', own_id);
      UPDATE public.want_list
        SET source_card_id = private_id
        WHERE user_id = bot_id AND card_key = 'want-visibility-update';
    EXCEPTION WHEN OTHERS THEN
      rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'FAIL: update to a private source was accepted';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.want_list (user_id, card_key, label, source_card_id)
    VALUES (bot_id, 'want-visibility-own', 'own', own_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: own card was rejected: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.want_list (user_id, card_key, label, source_card_id)
    VALUES (bot_id, 'want-visibility-public', 'public', public_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: public card was rejected: %', SQLERRM;
  END;

  EXECUTE 'SET LOCAL ROLE anon';
  rejected := false;
  BEGIN
    INSERT INTO public.want_list (user_id, card_key, label)
    VALUES (bot_id, 'want-visibility-anon', 'anon');
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL: logged-out insert was accepted';
  END IF;
END $$;

ROLLBACK;
