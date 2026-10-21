# Ladderlite

A mobile-first sports card portfolio and flipping tracker. Log what you paid, mark estimated or actual sale prices, and see profit in green and red.

Accounts, profiles, posts, follows, and the collection are stored in Supabase when the environment variables below are set. Until then, data stays in this browser.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Pages

- `/` — portfolio dashboard, search, filters
- `/cards/new` — add a card, camera/upload, mock comps
- `/cards/[id]` — paid vs sold, profit, cleaned sold comps (Trawl)
- `/cards/[id]/edit` — edit or delete

## Supabase

The app reads these variables from `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` — project URL (`https://<project-ref>.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the project's publishable anon key
- `TRAWL_API_KEY` — Trawl API key for live sold listings ([console](https://trawl.dev/console/keys)); server-only
- `COMPS_SOURCE` — `trawl` | `sample` | `off` (defaults to `sample` when unset)
- `SUPABASE_SERVICE_ROLE_KEY` — required for `sold_comps_cache` writes under RLS

1. Copy `.env.example` to `.env.local` and paste the values in full.
2. Run `supabase/schema.sql` once on a new empty database, then apply `supabase/migrations` in order. Never re-run `supabase/schema.sql` on an existing database.
3. Restart `npm run dev`.

Sign up and log in then use Supabase Auth. Profile photos and cover photos upload to Storage, and the profile row stores those URLs. Posts are written to `posts`. Reposts are written to `reposts`. The Timeline **Following** tab shows posts and reposts from you and people you follow.

### Sold comps (Trawl)

Card analytics (`/cards/[id]`) loads cleaned sold listings from Trawl (`details=1`), matched on grader/grade, with median and middle-50% range. Results are cached per card in `sold_comps_cache` (6h TTL). Set `COMPS_SOURCE=sample` or `off` (or omit it) to show the sample-data banner without calling Trawl.

### Daily value refresh

`/api/cron/refresh-card-values` is scheduled in `vercel.json`. Daily at 09:00 UTC; up to N cards per run, oldest-checked first; every card is re-checked at least every ceil(total/N) days. N is `TRAWL_CRON_BUDGET` (default 25, hard max 100).

`card_values.matched_at` is the last check, not only a successful price change. It moves when the price is kept, when there are no matches, and when a Trawl error leaves the old value in place. The cron uses that global budget only. Interactive comps and card refresh still use the per-user limit of 5 Trawl lookups an hour.
