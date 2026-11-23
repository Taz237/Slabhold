# Landing assets

## `hero-card.jpg`

The landing hero's card photo: a real card from a team member's collection,
used with their OK. 2025 Panini Mosaic Jaxson Dart, Orange, 091/199, in a
one-touch. 774x1200 JPEG, no filters. If the file is missing the hero shows
no photo.

## `app-store-badge.svg`

Apple's official "Download on the App Store" badge (US English, black), saved
unchanged from developer.apple.com. Don't recolor, redraw or crop it.

## `screens/`

The real iPhone screenshot slots for signed-out Home. See
`screens/README.md` for every slot and its exact file name. An empty slot
shows nothing. The home Open Graph and Twitter image
(`components/og-frame.tsx`) draws the logo and the headline on a solid dark
purple field.

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

- Real things only. The landing timeline shows real public posts with
  their handle, read on the server. Nothing here stands in for a person.
- No team, league or NFL logos added to captures, avatars or art. A real
  card photo shows whatever is printed on the card.
- No generated pictures of the app, and no demo data on the landing page:
  real screenshots of the current app only.
- No "free" in text drawn inside an image.

## PR screenshots

PR screenshots never go in this folder, so they are never served.
