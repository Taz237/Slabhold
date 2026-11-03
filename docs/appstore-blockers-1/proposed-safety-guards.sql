-- PROPOSED, NOT APPLIED. For QA Guard review. Do not run. Nobody runs db push or the Supabase CLI.
--
-- appstore-blockers-1 (#178). Database backstop for the client-side guards:
--   1. The content filter (lib/safety/content-filter.ts) only runs in the app.
--      A direct REST/API write skips it. guard_user_text() checks the same list.
--   2. A Supabase Auth ban stops new logins and token refreshes, but an access
--      token that's already issued works until it expires (up to 1h). The
--      trigger refuses writes from a banned account in that window.
--   3. submitReport's 20-a-day cap is a soft check in a server action. The
--      reports trigger makes it a hard cap.
--
-- Mirrors the TS filter as closely as SQL allows. Differences, on purpose:
--   - Diacritics: TS strips every combining mark (\p{M}); SQL strips the
--     U+0300-U+036F block after normalize(NFKD).
--   - Boundaries: TS treats anything but a-z and * as a word boundary. \m and
--     \M would count digits and _ as word characters ("kys_" would pass), so
--     the explicit class (^|[^a-z*]) / ($|[^a-z*]) is used instead.
--   - TS reads usernames with usernameProblem (handle squeezed to letters).
--     The profiles branch checks the squeezed username as well.
-- The word list must match BLOCKED in lib/safety/content-filter.ts
-- (lib/safety/sql-filter-sync.test.ts checks it).
--
-- Columns: posts keep their text in content (not body), comments in body,
-- messages in content, profiles in username, display_name and bio.

begin;

create schema if not exists private;

-- Lowercase, NFKD without accents, no zero-width characters, Cyrillic and
-- Greek lookalikes and leetspeak mapped. ! | + only count before a letter.
create or replace function private.filter_normalise(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(regexp_replace(regexp_replace(
    translate(
      lower(regexp_replace(
        normalize(regexp_replace(coalesce(t, ''), '[\u00AD\u180E\u200B-\u200F\u2060-\u2064\uFEFF]', '', 'g'), NFKD),
        '[\u0300-\u036F]', '', 'g'
      )),
      'аАеЕоОрРсСуУхХіІјЈѕЅкКмМтТнНвВοΟαΑνΝιΙκΚρΡτΤ013457@$',
      'aaeeooppccyyxxiijjsskkmmtthhbbooaavviikkppttoieastas'
    ),
    '!(?=[a-z])', 'i', 'g'),
    '\|(?=[a-z])', 'l', 'g'),
    '\+(?=[a-z])', 't', 'g')
$$;

-- One entry as a regex: inner letters also match * (p*rn), spaces match any
-- run of separators or none. Same as pattern() in content-filter.ts.
create or replace function private.filter_pattern(w text)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(
    case
      when length(part) <= 2 then part
      else left(part, 1)
        || regexp_replace(substr(part, 2, length(part) - 2), '([a-z])', '[\1*]', 'g')
        || right(part, 1)
    end,
    '[^a-z*]*' order by ord
  )
  from unnest(string_to_array(w, ' ')) with ordinality as p(part, ord)
$$;

create or replace function private.blocked_text(t text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- Plain entries: anywhere inside a word.
  plain_words constant text[] := array[
      'nigger',
      'niggers',
      'nigga',
      'niggas',
      'wetback',
      'beaner',
      'raghead',
      'towelhead',
      'sandnigger',
      'faggot',
      'faggots',
      'tranny',
      'trannies',
      'shemale',
      'mongoloid',
      'porn',
      'blowjob',
      'handjob',
      'cumshot',
      'creampie',
      'gangbang',
      'dildo',
      'hentai'
    ];
  -- Phrases: need a word start, any separators (or none) between the words.
  phrases constant text[] := array[
      'kill yourself',
      'kill urself',
      'kill your self',
      'hang yourself',
      'neck yourself'
    ];
  -- {word} entries: whole word only.
  whole_words constant text[] := array[
      'chink',
      'chinks',
      'spic',
      'spics',
      'kike',
      'kikes',
      'gook',
      'gooks',
      'fag',
      'fags',
      'retard',
      'retarded',
      'retards',
      'milf',
      'pussy',
      'cunt',
      'cunts',
      'cock',
      'nudes',
      'rape',
      'rapist',
      'kys'
    ];
  pattern text;
  base text;
  spelled text;
  joined text;
begin
  if t is null or t = '' then
    return false;
  end if;
  select
    '(^|[^a-z*])(' || (select string_agg(private.filter_pattern(w), '|') from unnest(whole_words) as w) || ')($|[^a-z*])'
    || '|(^|[^a-z*])(' || (select string_agg(private.filter_pattern(w), '|') from unnest(phrases) as w) || ')'
    || '|' || (select string_agg(private.filter_pattern(w), '|') from unnest(plain_words) as w)
  into pattern;
  base := private.filter_normalise(t);
  -- As typed, and with ph read as f.
  foreach spelled in array array[base, replace(base, 'ph', 'f')] loop
    -- As typed, and with single letters split by one separator joined (p.o.r.n).
    foreach joined in array array[
      spelled,
      regexp_replace(spelled, '(?<![a-z*])([a-z*])[^a-z*](?=[a-z*]([^a-z*]|$))', '\1', 'g')
    ] loop
      -- Runs of 3 or more of a letter, collapsed to one and to two.
      if regexp_replace(joined, '([a-z])\1{2,}', '\1', 'g') ~ pattern
        or regexp_replace(joined, '([a-z])\1{2,}', '\1\1', 'g') ~ pattern then
        return true;
      end if;
    end loop;
  end loop;
  return false;
end;
$$;

-- banned_until is set by the Supabase Auth ban that Suspend account uses.
create or replace function private.is_suspended(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.banned_until is not null and u.banned_until > now() from auth.users as u where u.id = uid),
    false
  )
$$;

-- One trigger function for the four tables. Only new or changed text is
-- checked, so an unrelated update (a like count, read = true) never trips it.
create or replace function private.guard_user_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_insert boolean := tg_op = 'INSERT';
  problem constant text := 'This includes words Slabhold doesn''t allow. Edit it and try again';
begin
  if uid is not null and private.is_suspended(uid) then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;

  if tg_table_name = 'posts' then
    if (is_insert or new.content is distinct from old.content) and private.blocked_text(new.content) then
      raise exception '%', problem using errcode = '23514';
    end if;
  elsif tg_table_name = 'comments' then
    if (is_insert or new.body is distinct from old.body) and private.blocked_text(new.body) then
      raise exception '%', problem using errcode = '23514';
    end if;
  elsif tg_table_name = 'messages' then
    if (is_insert or new.content is distinct from old.content) and private.blocked_text(new.content) then
      raise exception '%', problem using errcode = '23514';
    end if;
  elsif tg_table_name = 'profiles' then
    if (is_insert or new.username is distinct from old.username)
      and (
        private.blocked_text(new.username)
        or private.blocked_text(regexp_replace(private.filter_normalise(new.username), '[^a-z]', '', 'g'))
      ) then
      raise exception '%', problem using errcode = '23514';
    end if;
    if (is_insert or new.display_name is distinct from old.display_name) and private.blocked_text(new.display_name) then
      raise exception '%', problem using errcode = '23514';
    end if;
    if (is_insert or new.bio is distinct from old.bio) and private.blocked_text(new.bio) then
      raise exception '%', problem using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_user_text on public.posts;
create trigger guard_user_text
  before insert or update on public.posts
  for each row execute function private.guard_user_text();

drop trigger if exists guard_user_text on public.comments;
create trigger guard_user_text
  before insert or update on public.comments
  for each row execute function private.guard_user_text();

drop trigger if exists guard_user_text on public.messages;
create trigger guard_user_text
  before insert or update on public.messages
  for each row execute function private.guard_user_text();

drop trigger if exists guard_user_text on public.profiles;
create trigger guard_user_text
  before insert or update on public.profiles
  for each row execute function private.guard_user_text();

-- Hard cap: the 21st report from one reporter inside 24 hours is refused.
-- Same number and message as REPORT_DAILY_LIMIT / REPORT_LIMIT_MESSAGE.
create or replace function private.cap_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.reports as r
    where r.reporter_id = new.reporter_id
      and r.created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception 'You''ve sent a lot of reports today. Try again tomorrow' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists cap_reports on public.reports;
create trigger cap_reports
  before insert on public.reports
  for each row execute function private.cap_reports();

-- Triggers don't need EXECUTE at fire time, and guard_user_text and
-- cap_reports are security definer, so their calls into the helpers run as
-- the owner. Nobody else calls these.
revoke all on function private.filter_normalise(text) from public, anon, authenticated;
revoke all on function private.filter_pattern(text) from public, anon, authenticated;
revoke all on function private.blocked_text(text) from public, anon, authenticated;
revoke all on function private.is_suspended(uuid) from public, anon, authenticated;
revoke all on function private.guard_user_text() from public, anon, authenticated;
revoke all on function private.cap_reports() from public, anon, authenticated;

commit;
