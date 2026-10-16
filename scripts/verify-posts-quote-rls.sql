-- Verify posts insert RLS: owner can create plain + quote posts; wrong user_id is rejected.
-- Deletes its own test rows on success.

do $$
declare
  owner_id uuid;
  other_id uuid;
  original_id uuid;
  plain_id uuid;
  quote_id uuid;
  rejected boolean := false;
begin
  select id into owner_id from public.profiles order by created_at asc limit 1;
  select id into other_id from public.profiles where id <> owner_id order by created_at asc limit 1;

  if owner_id is null then
    raise exception 'verify failed: need at least one profile';
  end if;
  if other_id is null then
    raise exception 'verify failed: need a second profile to test rejected inserts';
  end if;

  -- Act as owner (authenticated).
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', owner_id::text, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  insert into public.posts (user_id, content, quoted_post_id)
  values (owner_id, 'rls-verify plain post', null)
  returning id into plain_id;

  if plain_id is null then
    raise exception 'verify failed: plain post insert returned null';
  end if;

  original_id := plain_id;

  insert into public.posts (user_id, content, quoted_post_id)
  values (owner_id, 'rls-verify quote post', original_id)
  returning id into quote_id;

  if quote_id is null then
    raise exception 'verify failed: quote post insert returned null';
  end if;

  begin
    insert into public.posts (user_id, content, quoted_post_id)
    values (other_id, 'rls-verify should fail', null);
  exception
    when insufficient_privilege then
      rejected := true;
    when others then
      if sqlerrm ilike '%row-level security%' or sqlstate = '42501' then
        rejected := true;
      else
        raise;
      end if;
  end;

  if not rejected then
    raise exception 'verify failed: insert as different user_id was allowed';
  end if;

  -- Clean up as the owner (quote first: FK from quoted_post_id is ON DELETE SET NULL, but keep tidy).
  delete from public.posts where id in (quote_id, plain_id);

  raise notice 'ok: plain and quote inserts succeeded; other user_id rejected; cleaned up';
end;
$$;

select 'ok' as verify_posts_quote_rls;
