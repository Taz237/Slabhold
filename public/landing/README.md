# Landing assets

## `2.png`: the home share image backdrop

`components/og-frame.tsx` draws `2.png` inside the phone frame of the home
Open Graph and Twitter image (`/opengraph-image`, `/twitter-image`). The
signed-out home page itself doesn't show it: its chapters are live app
components with sample data.

How it was captured (Nov 2026):

- **Screen:** Quick Comp (`/comp`) with a result, scrolled to the median,
  the middle-half range, the sales chart, the stats, the "Sample prices, not
  real sales" line and the first sold sales.
- **Data:** a made-up card, "Sample Rookie", 2023 Prizm, Raw, entered with
  "Can't find it? Enter player and year". `COMPS_SOURCE=sample` with
  `NEXT_PUBLIC_QUICK_COMP=1`, so the prices are sample sales (the photo above
  this frame is the neutral `public/quick-comp/sample-card.svg`). No Trawl
  call.
- **Account:** a local demo account (no Supabase) in a production build.
  `/comp` needs a signed-in Supabase user, so the capture build stubbed the
  server's user id. The stub was never committed.
- **Size:** 390×823 CSS px at 2.2×, dark theme, saved as an 860×1815 PNG:
  the same shape as the phone frame (252×532), so nothing is cropped.

## `kitchen-table-card.webp`

A team member's own card photo, used with their OK, on the sample kitchen-table pickup
(Jake's post) in the landing timeline and on intro screen 4. A raw card in a
top-loader on a stand: LaBaron Philon, Origins Memorabilia patch, 06/10,
Panini NIL. It's a real card, so it shows the Panini NIL and Nike marks, and
no team or league logos.

300×420 (5:7) WebP, quality 85, about 19 KB, metadata stripped, added as
supplied. Keep it a plain lazy `<img>` with `width`/`height`: no optimizer,
no next/image, no AVIF, no re-encoding.

## `avatars/`

Eight fictional, AI-generated demo personas and `personas.md` (handles,
names, bios), added unchanged from the design team's zip. The landing timeline
and the onboarding intro use them, always labelled as sample accounts and
never linked to a profile.

## Rules for anything in this folder

- No real users by name. The hero slabs, Quick Comp and the timeline pickup
  can show real public card photos from a team account, but never its name,
  handle or avatar.
- No team, league or NFL logos, in captures, card photos, avatars or art.
- No generated pictures of the app: real captures of the current app with
  demo data, or the live components themselves.
- No "free" in text drawn inside an image.
