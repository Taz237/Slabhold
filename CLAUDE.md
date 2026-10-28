# Slabhold: guide for Claude Code

@AGENTS.md

## What Slabhold is
Slabhold is a social app for sports card collectors. It's live at https://slabhold.app (also https://slabhold.vercel.app). The repo is github.com/Taz237/Slabhold, and the package name is `cardflip`.

The vision has 3 parts:
1. **Track your collection**, with real sold comps, values and trends (price graphs, gain/loss, collection value over time).
2. **A big X-style social feed** for collectors: posts, replies, follows, profiles, a leaderboard and notifications.
3. **Later: direct sales between collectors.** The marketplace is ON HOLD. Don't build or promote it unless asked.

There are no paywalls yet. Ideas for later are a small direct-sale fee, a premium tier, sponsored slots and referrals. Don't build any of them unless asked.

Sports cards only. **No Pokemon or other TCG** anywhere in the product or assets.

## Stack
- **Framework:** Next.js 16.4 (App Router) and React 19.3, with Tailwind CSS v4. Read `AGENTS.md`: this Next.js has breaking changes. Check `node_modules/next/dist/docs/` before using an API you aren't sure of.
- **Backend:** Supabase (Postgres, Auth, Storage, RPCs; migrations in `supabase/migrations/`), hosted on Vercel.
- **Node:** 22 (`.nvmrc`; `engines` is `>=22 <23`).
- **Sold-price data:** comes from Trawl (`lib/comps/`, `lib/value/`). Calls are rate-limited and cost money. Don't add new calls.
- **Commands:**
  - `npm test`: `tsx --test "**/*.test.{ts,tsx}"` (node:test; add a file to add a test).
  - `npm run lint:ci`: ESLint baseline check. It must not go up.
  - `npm run build`: needs no env vars.

## Brand basics
- **Colors:**
  - purple `#7C3AED` (logo and brand graphics), deep purple `#5B21B6`, light purple accent text `#A78BFA`;
  - in-app buttons use Tailwind violet-600;
  - background black `#09090B` (zinc-950), ink `#18181B`, off-white `#F4F4F5`;
  - teal `#34C1AE` sparingly, for small highlights only, never instead of purple.
- **Fonts:** Geist (headlines 700/800 with tight tracking, body 400/500) and Geist Mono (small uppercase tags), loaded in `app/layout.tsx`.
- **Logo:** the purple star tile (`public/logo.svg`, `public/icons/`, `app/apple-icon.png`). Don't recolor, stretch, outline or add glows. Don't rebuild the wordmark in another font.
- **Tone:**
  - hobby-native, short and plain, in sentence case;
  - say "we" or "the team", never the founder's name;
  - no fake numbers, testimonials or user counts.
- **Sold data:** call it "recent sold prices" or "via Trawl", never "eBay data". No eBay logos.
- **On hold, so don't promote:** Grade Reveal, Clubs, the scanner, the marketplace.
- **Retired:** Mail Day. Don't add "mail day" text anywhere. Say "pickups".
- **No team, league or NFL logos** in UI assets or graphics.

## UI bar
- Treat every screen as world-class product design. Think StockX's portfolio, Arena Club's vault and X's feed: visually rich, fast, and addictive to come back to.
- **Design for 390px wide first,** then make sure desktop looks great too.
- **Interaction:**
  - tap targets of at least 44px;
  - smooth, short motion that respects `prefers-reduced-motion`.
- **States:**
  - skeletons instead of spinners or `$0`;
  - designed empty and thin states, never a blank page;
  - no broken-image icons. Use designed placeholders.
- **Images:** sized, lazy, and with no layout shift.
- **Accessibility:** accessible names on every interactive element.

## How we work (standing rules)
1. **Test-first.** Write the failing test, then the code. Every PR passes `npm test`, `npm run lint:ci` and `npm run build`.
2. **One small, focused PR per task, against `main`.** No drive-by refactors.
3. **Never merge your own PR.** The team reviews and squash-merges.
4. **Never run `next upgrade`.**
5. **Never run `supabase db push`, or any Supabase CLI command, against production.** Don't connect to the production database.
6. **SQL only as an unapplied migration file** in `supabase/migrations/`, with a header comment `-- UNAPPLIED. Needs review before running.`, and "CONTAINS SQL, needs review" at the top of the PR description. Never run it.
7. **Never commit keys, tokens, passwords or `.env` values,** and never paste them into PRs, tests or logs.
8. **No new paid APIs or services, or new usage of existing paid ones, without Donnie's OK.** That includes Trawl calls, AI APIs and image services.
9. **Don't touch the real Jaylen Brown card,** and never edit or delete real users' data. Use fixtures in tests.
10. **Never delete the `slabholdapp@gmail.com` or `tazsprints@gmail.com` auth accounts.**
11. **Sports cards only.** No Pokemon/TCG, and no team, league or NFL logos.
12. **When unsure, ask in the PR description** instead of guessing. Keep PR descriptions plain: what changed, screenshots at 390px for UI, the tests added, and "No SQL" or the SQL flag.
