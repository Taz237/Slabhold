# Slabhold promo video (test)

**Brief (9:16, 1080x1920, 30fps, ~21s)**
1. 0-2s hook: big "Your cards. Your crew." punches in with a quick scale and fade.
2. 2-7s: a phone frame slides up showing the Home feed and slowly scrolls (a social app for collectors).
3. 7-12s: card page; the value chart line draws itself, then a "+12%" chip pops in (track comps and value).
4. 12-17s: leaderboard podium; the #1 spot rises with a small glow (compete with other collectors).
5. 17-21s: end card with the "Slabhold" wordmark in plain text and "slabhold.app", holding for 1 second.

## What's here
- `src/Promo.tsx`: the whole video (Remotion, React). `src/Root.tsx` registers the `Promo` composition (1080x1920, 30fps, 630 frames = 21s).
- `public/screens/`: 390px-wide (2x) screenshots taken from the app running locally in local/demo mode (no Supabase): `home.png`, `home-feed-full.png` (feed with fixed chrome hidden, used for the scroll), `card.png`, `collection.png`, `leaderboard.png`.
- `public/fonts/`: Geist and Geist Mono (OFL, from the `geist` npm package), bundled so renders don't need the network.
- `out/slabhold-promo.mp4`: the render. `out/stills/`: check stills at 1s, 5s, 10s, 15s and 20s.

## Real vs mocked
- Home feed, top bar, bottom nav, card hero and the leaderboard header are real screenshots.
- The card value chart and the podium are drawn in Remotion to match the app's styles (podium colors and sizes come from `components/leaderboard-view.tsx`). In local mode the app has no sold comps (it shows "Log in to see sold comps") and the leaderboard can't load, so there was nothing real to capture. The chart values, "+12%" and podium scores are demo numbers; the handles are the app's local seed fixtures.

## Safe zones
All text sits between y=250 and y=1570 (Instagram covers the top 250px and bottom 350px).

## Commands
```
npm install
npm run studio   # preview
npm run render   # writes out/slabhold-promo.mp4 (H.264, yuv420p)
npm run stills   # ffmpeg stills into out/stills/
```
