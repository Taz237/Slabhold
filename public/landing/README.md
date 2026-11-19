# Landing assets

## `media/`

The real media slots for signed-out Home: one real card photo and real
recordings of the app. See `media/README.md` for every slot, its exact file
name and the encoding. An empty slot shows no media. The home Open Graph and
Twitter image (`components/og-frame.tsx`) draws the logo and the headline on
the purple galaxy, plus `media/hero-card.avif` in the slab when it exists.

## `kitchen-table-card.webp`

A team member's own card photo, used with their OK, on the sample kitchen-table pickup
(Jake's post) on onboarding intro screen 4. The landing page does not use it. A raw card in a
top-loader on a stand: LaBaron Philon, Origins Memorabilia patch, 06/10,
Panini NIL. It's a real card, so it shows the Panini NIL and Nike marks, and
no team or league logos.

300×420 (5:7) WebP, quality 85, about 19 KB, metadata stripped, added as
supplied. Keep it a plain lazy `<img>` with `width`/`height`: no optimizer,
no next/image, no AVIF, no re-encoding.

## `avatars/`

Eight fictional, AI-generated demo personas and `personas.md` (handles,
names, bios), added unchanged from the design team's zip. Only the onboarding
intro uses them, always labelled as sample accounts and never linked to a
profile. The landing page shows none of them: real cards and real pulls only.

## Rules for anything in this folder

- No real users by name. The hero slab, the collection grid and Quick Comp
  can show real public card photos from a team account, but never its name,
  handle or avatar. The one exception is `media/pulls.json`: approved public
  pulls, shown with their handle.
- No team, league or NFL logos, in captures, card photos, avatars or art.
- No generated pictures of the app, and no demo data on the landing page:
  real recordings of the current app only.
- No "free" in text drawn inside an image.

## PR screenshots

PR screenshots never go in this folder, so they are never served.
