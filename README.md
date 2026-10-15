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
- `/cards/[id]` — paid vs sold, profit, mock eBay sold listings
- `/cards/[id]/edit` — edit or delete

## Supabase

The app reads these variables from `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` — project URL (`https://<project-ref>.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the project's publishable anon key

1. Copy `.env.example` to `.env.local` and paste both values in full.
2. Run `supabase/schema.sql` in the Supabase SQL editor. That creates `profiles`, `posts`, `follows`, and `cards`, plus Storage buckets for avatars, cover photos, post images, and card photos.
3. Restart `npm run dev`.

Sign up and log in then use Supabase Auth. Profile photos and cover photos upload to Storage, and the profile row stores those URLs. Posts are written to `posts`. The Timeline **Following** tab shows posts from you and people you follow.
