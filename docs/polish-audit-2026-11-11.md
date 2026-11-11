# Slabhold polish audit: 2026-11-11

Read-only audit before the US and Canada marketing campaign. The app is already on the App Store there, so App Review items are framed as "don't break the next update". A new-user spike makes first-run breakage, silent failures and crash visibility the top priorities.

This was a careful reading of the code at `e3b28c6`, not a test on a real iPhone. Line numbers are from that commit. The keyboard items still need a device check.

## The lead's list

| # | Idea | Verdict |
|---|---|---|
| 1 | Crash reporting | **Agree, top priority.** Nothing exists on web or iOS. `app/global-error.tsx:16` and `app/(app)/error.tsx` only log to the browser console. Adding a service like Sentry needs Donnie's OK (rule 8). A free option is a small `/api/client-error` route plus `window.onerror`, logging to Vercel logs, with no new service. |
| 2 | Double photo upload | **Agree, and it's real.** The post gets the card from `result.card` (`card-form.tsx:1039`). That card still holds the local photo, so the post uploads it again (`lib/social/remote.ts:1451`). It wastes storage and slows the post. Users don't see an error. |
| 3 | Failed save shows nothing | **Push back on the scope.** Add card and Edit card already show an error with Retry (`card-form.tsx:1083-1107`). What really fails silently: Mark sold and Move category on the card page (`card-detail.tsx:362, 470`), and Unblock and Unmute (`safety-menu.tsx:178, 191`). |
| 4 | Welcome screen hides an error | **Partly true, and the real bug is worse.** The welcome screen isn't blank. It shows the error and "Your collection starts here" at the same time. The blank screen is elsewhere: see #1 below. |
| 5 | Team badge missing | **True.** It's wired into 11 components but not the leaderboard, value board, player hub, card owners or public card page. Nice to have. |
| 6 | "USD · US eBay sales" note | **Mostly done already.** `sales-chart.tsx:44` shows "Prices in USD from recent US sold listings". Two gaps: the line disappears while a sale is tapped, and the public card page has no USD note. Don't say "eBay" in the note (brand rule). With a US and Canada audience this is a nice to have. |
| 7 | Keyboard on a real iPhone | **Agree, with one addition.** The iOS app's keyboard events are wired in `lib/ui/use-keyboard-inset.ts`. But a gap above the keyboard is likely when iOS scrolls the page itself, so it needs a device check. The bigger issue: the DM thread doesn't use that code at all (`message-thread.tsx:292, 413`), so the keyboard may cover the DM composer. |

## Ranked list

| # | What's wrong | Where | How bad | Size |
|---|---|---|---|---|
| 1 | **Blank black screen with no message or retry.** If the Supabase library fails to load on first launch, nothing ever shows. The error message is hidden while the app loads, and a CSS rule hides the landing page for anyone signed in. A spotty network on first open means a dead app. | `components/social-provider.tsx:603-606`, `components/app-shell.tsx:474, 549-551`, `app/globals.css:1302` | Blocker | M |
| 2 | **No crash or error reporting** (lead's #1). | `app/global-error.tsx`, `app/(app)/error.tsx`, iOS app | Blocker for the campaign | M |
| 3 | **Network failures look like real empty states.** A failed load says "That post is gone.", "No notifications yet", "This collector hasn't replied yet" or "Card not found". The worst case: after a failed collection load, Collection shows "Your collection starts here", so collectors may re-add cards and create duplicates. | `components/dashboard.tsx:412`, `components/post-view.tsx:166`, `components/notifications-view.tsx:62`, `components/profile-view.tsx:224`, `components/card-detail.tsx:251` | Should fix (high) | M |
| 4 | **Green/red for gain and loss**, against the brand rule. It comes from one shared theme file, plus 6 hand-written copies (card tile gain pill, card page, sales chart, Moving today, value board, share images). It will show in every marketing screenshot. | `lib/chart/theme.ts:9-19`, `card-tile.tsx:269`, `card-detail.tsx:957`, `sales-chart.tsx:60`, `moving-today.tsx:269`, `value-board.tsx:29`, `og-frame.tsx:691` | Should fix (high) | M |
| 5 | **Robotic and vendor-named errors.** Users see "Could not reach Supabase.", raw "Load failed" / "Failed to fetch", and "Still loading." forever on sign in. | `social-provider.tsx:597, 605, 633, 1241, 1265`, `lib/save/attempt.ts:22`, `compose-view.tsx:283` | Should fix | S |
| 6 | **Onboarding can vanish or stay black.** Any network error while reading interests skips the whole intro. The intro shows a pure black screen while it loads. If its code fails to load, the whole app falls to the global "Something went wrong" screen. | `components/first-run/first-run-setup.tsx:64, 102-105, 175, 299` | Should fix | S |
| 7 | **Apple sign-in isn't revoked on account delete** (App Store rule 5.1.1(v)). Nothing calls Apple's revoke endpoint. If Apple login is on in production, the next update could be rejected. Needs an Apple key, so it needs a decision. | `lib/account/delete-account.ts` | Blocker if Apple login is on | M |
| 8 | **Account delete can half-fail.** Photos are deleted before database rows, so a failed row delete leaves a live account with broken images. Also, the confirm box needs exactly "DELETE", but iOS may auto-correct it to "Delete" and leave the button disabled with no hint. | `lib/account/delete-account.ts:322-336`, `components/delete-account.tsx:25, 79-85` | Should fix | S–M |
| 9 | **Silent failures** (the real version of the lead's #3): Mark sold, Move category, Unblock and Unmute just flip back with no message. | `card-detail.tsx:362, 470`, `safety-menu.tsx:178, 191` | Should fix | S |
| 10 | **Feed and leaderboard errors have no Retry button.** The feed shows only red text. | `feed-view.tsx:485`, `leaderboard-view.tsx:691` | Should fix | S |
| 11 | **Tap targets under 44px.** Header Notifications and Messages (36px, on every screen), the "More" menu on every post (32px), the clear and close buttons, and the delete dialog buttons. A `hit-44` class already exists for this. | `app-shell.tsx:268, 285`, `tweet.tsx:386`, `post-view.tsx:436`, `search-view.tsx:289`, `compose-view.tsx:798`, `delete-account.tsx:94, 102` | Should fix | S |
| 12 | **Double photo upload** (lead's #2). | `card-form.tsx:1039`, `lib/social/remote.ts:1451` | Should fix | S |
| 13 | **Keyboard** (lead's #7): the DM composer, plus the real-device check of the post composer. | `message-thread.tsx:292, 413`, `lib/ui/use-keyboard-inset.ts` | Should fix | S–M |
| 14 | **Replies load with no limit.** Every reply on a post is fetched again on each live update. A campaign post that blows up gets slow. | `lib/social/realtime-slices.ts:113` | Should fix | M |
| 15 | **The word filter runs only in the app.** A proposed SQL guard was never applied, so a direct API write skips it (App Store rule 1.2). Please confirm what production has. Fixing it means SQL. | `docs/appstore-blockers-1/proposed-safety-guards.sql` | Ask the team | M |
| 16 | **Nice-to-haves**, all small (listed below the table). | | Nice to have | S each |

The nice-to-haves in item 16:

- Team badge on the 5 missing screens (lead's #5): `leaderboard-view`, `value-board`, `player-hub`, `card-people`, public card.
- USD note on public comps, and keep it while a sale is tapped: `public-card-comps.tsx:63`.
- A screen-reader label on comps rows says "Open listing on eBay": `comps-list.tsx:132`.
- 7 `font-bold` uses: `leaderboard-view.tsx:272, 312` and others.
- A broken avatar URL shows an empty circle, not the initials: `avatar.tsx:34`.
- The Edit card loading skeleton is invisible in light mode: `edit-card-page.tsx:11`.
- 3 spinners where we'd use skeletons: `card-search.tsx:199`, `card-photo-field.tsx:80`.
- Check the App Store build's push setting is `production`, not `development`: `App.entitlements`.

## Already fine

- iOS doesn't zoom into inputs (a global 16px rule).
- Safe areas are handled.
- Report, block and mute exist on posts, replies, profiles and DMs.
- Likes and follows roll back when they fail.
- Sign in with Apple sits next to Google.
- The privacy manifest and the camera and photo permission prompts are in place.

## Questions for the team

- "Open to offers" is live on cards, profiles and the player hub. That's close to the on-hold marketplace. Keep it?
- Do we want every image to have a `loading` attribute? About 20 don't.

## Suggested PRs

**PR 1. "We see it when it breaks" (blockers).**
- Items 1, 2 and 6: crash reporting, the cold-start blank screen with a designed error and Retry, and the onboarding fallbacks.
- Needs Donnie's OK on the reporting service, or we use the free Vercel-logs option.

**PR 2. "Never lie, never go silent."**
- Items 3, 5, 8, 9 and 10: honest error states with Retry instead of fake empty states, plain-English error copy, the silent quick edits, and the account delete order and confirm box.
- Keep item 7 (Apple revoke) and item 15 (the SQL filter) out as separate decisions. They need an Apple key and SQL review.

**PR 3. "Feels like X."**
- Items 4, 11, 12, 13, 14 and the nice-to-haves: green/red to violet, tap targets, the double upload, the DM keyboard plus a device check, and paging replies.

PR 3 is fairly broad. To keep to one small PR per task, split the colors into their own PR, since that touches 8 or more files.
