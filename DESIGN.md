---
version: alpha
name: Slabhold
description: Visual identity for Slabhold, the sports-card timeline, collection and scanner at slabhold.app. Tokens below are taken from the live site CSS (24 Nov 2026) and from Taz237/Slabhold on main (app/globals.css, app/landing.css, public/logo.svg). Anything not found there is marked assumed.
colors:
  primary: "#7C3AED"
  primary-deep: "#5B21B6"
  accent: "#A78BFA"
  violet-300: "#C4B5FD"
  violet-500: "#8855F4"
  violet-700: "#6D28D9"
  violet-800: "#5D0EC0"
  violet-950: "#4C1D95"
  landing-bg: "#07050D"
  landing-bg-raised: "#0E0A1A"
  app-bg-dark: "#09090B"
  app-bg-light: "#F4F4F5"
  ink-dark: "#F4F4F5"
  ink-light: "#18181B"
  ink-muted-on-dark: "rgba(244, 244, 245, 0.68)"
  white: "#FFFFFF"
  black: "#09090B"
  line-on-dark: "#A78BFA22"
  line-strong-on-dark: "#A78BFA55"
typography:
  h1:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: -0.02em
  h1-desktop:
    fontFamily: Geist
    fontSize: 80px
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: -0.02em
  h2:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.14
    letterSpacing: -0.01em
  h2-desktop:
    fontFamily: Geist
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.14
    letterSpacing: -0.01em
  body:
    fontFamily: Geist
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: Geist
    fontSize: 17px
    fontWeight: 600
  count:
    fontFamily: "Geist Mono"
    fontSize: 13px
    fontWeight: 500
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  2xl: 16px
  3xl: 24px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
motion:
  hover:
    duration: 150ms
    timingFunction: ease-out
  menu-row:
    duration: 320ms
    delay: 40ms
    timingFunction: cubic-bezier(0.22, 1, 0.36, 1)
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    height: 48px
    padding: 20px
  button-open:
    backgroundColor: "{colors.landing-bg-raised}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: 48px
    padding: 20px
  end-card:
    backgroundColor: "{colors.landing-bg}"
    textColor: "{colors.white}"
  app-store-badge:
    height: 48px
    width: 144px
---

## Overview

Slabhold is a sports-card app built by collectors, for collectors. The look is dark, purple, and quiet: a nearly-black field, one brand purple, and off-white type in Geist. It should feel like a well-lit card on a table, not like a neon dashboard and not like a generic social app.

The product differentiator is Home: a timeline that looks like X, except every post is a card. Show that feed when you need to explain the app. Do not show or mention competitors. Do not invent app UI; use real screens from the current app.

The canonical mark is the purple tile icon in `public/logo.svg`: a rounded purple square, a white slab, and a deep-purple star and label. Use that same mark on the site, in the app, and on social. Do not recolor, stretch, rotate, outline, or add a glow or drop shadow to the icon, and do not rebuild the wordmark in another typeface.

## Colors

Purple is the only accent family. Never teal, never a hue between 160° and 200°, and never a mint or cyan highlight.

- **Primary (#7C3AED):** Logo tile, primary buttons, and every `violet-600` class. `app/globals.css` pins `--color-violet-600` to this exact value so it matches `public/logo.svg`.
- **Deep purple (#5B21B6):** The star and the small label on the logo slab. Also the middle stop of the in-app 160° gradient `#6D28D9 → #5B21B6 → #4C1D95`.
- **Accent (#A78BFA):** Landing accent, muted type accents, and dark-theme highlight text. This is `--color-violet-400`.
- **Landing field (#07050D / #0E0A1A):** Signed-out Home. `--bg-0` is the page, `--bg-1` is raised surfaces (feed, screens, cards).
- **App chrome (#09090B / #F4F4F5 / #18181B):** Dark-theme `--background` is zinc-950. Light-theme `--background` is zinc-100. Light-theme text is zinc-900. Dark-theme text is zinc-100.
- **Lines on dark:** `#A78BFA22` default, `#A78BFA55` strong, from `app/landing.css`.
- **Muted ink on dark:** `rgba(244, 244, 245, 0.68)` (`--ink-2`).

The rest of the violet ramp in live CSS, for states and washes only: 300 `#C4B5FD`, 500 `#8855F4`, 700 `#6D28D9`, 800 `#5D0EC0`. Other in-app purples that appear in special stages: collection-hero `#2A1260`, reveal-stage `#33235E` / `#1A1131`.

**Assumed / not on the live site:** recent Video Studio reels used `#0B0614` as the typographic stage and end-card field. That hex is not in the live CSS. New work should prefer landing `#07050D`. An older brand-kit glow `#7C5CFF` was not present in the 24 Nov 2026 CSS and should not be reintroduced.

## Typography

The site and app use **Geist** for UI and headlines and **Geist Mono** for small counts, serial-style labels, and uppercase tags. Both faces are declared as `--font-geist-sans` / `--font-geist-mono` and ship under the SIL Open Font License 1.1.

Landing type, from `app/landing.css`:

- Hero: 48px / 80px desktop, weight 600, line-height 1.04, letter-spacing `-0.02em`.
- Section titles: 28px / 36px desktop, weight 600, line-height 1.14, letter-spacing `-0.01em`.
- Body and sublines: 17px / 20px desktop, line-height 1.5, muted ink.
- Posts: 15px, weight 600 on the name.
- Counts: Geist Mono 13px, tabular numbers, accent color.

Sentence case. At most one accent phrase per headline, set in `#A78BFA`. Tailwind `tracking-tight` is `-0.025em`.

**Assumed, from `brand/BRAND.md`, not the live CSS:** marketing graphics sometimes tighten headlines to `-0.035em` and use weights 700 or 800. Fine for designed social frames; do not change product UI away from the landing/app values above.

## Layout

The spacing unit is Tailwind's `--spacing: 0.25rem` (4px). Landing uses 8, 12, 16, 24, 32, 40, 48, 64, 72 and 88. Content maxes at 1200px. Phone-first layout is 390px wide.

Chrome: the sticky app header row is a fixed 52px (`3.25rem`) plus the iOS safe-area inset. Landing nav is 56px on small screens and 64px on desktop. Controls have a 44px minimum hit area (painted size may be smaller; `.hit-44` expands the target). Text fields stay at least 44px tall, and 16px on small screens so iOS does not zoom on focus.

Logo clear space, from `brand/BRAND.md`: keep at least 25% of the icon's width empty on every side. Minimum icon size is 24px on screen (16px only as a favicon). In a lockup, the gap between icon and wordmark is about 18% of icon height.

## Elevation & Depth

The product is mostly flat color, not heavy shadow. Landing is "solid dark and purple only." Raised surfaces use `--bg-1` (`#0E0A1A`) and a thin accent line, not a drop shadow.

App chrome uses glass tokens in the compiled CSS (light theme): tint `#FAFAFADB`, drop `0 12px 32px -12px #18181B47`. If the reader has Reduce Transparency on, or the browser cannot blur, glass becomes a solid `--background` and scrims become `rgb(9 9 11 / 0.9)`. Stay on the zinc/purple palette when a solid fallback is needed.

Do not add galaxy, starfield, or nebula backgrounds. A soft, barely-there purple glow behind an end-card icon is acceptable only if it stays on-brand (`#7C3AED` at low opacity) and is not a sky full of stars.

## Shapes

Radius tokens from the live Tailwind theme:

- sm 4px, md 6px, lg 8px, xl 12px, 2xl 16px, 3xl 24px.

How the site uses them: logo tile `rx="8"` on a 32px viewBox (25% corner); buttons, login, and the App Store badge link are 8px; card photos are 12px; the landing feed is 16px; phone-screen frames are 24px; avatars are a full circle. The white slab inside the icon uses `rx="2.25"` on that 32px canvas; do not change it.

## Motion & Micro-interaction

On the marketing landing, motion is minimal: "flat and still." The only authored motion is a 150ms ease-out color or border change on hover. Screen recordings hold as stills when `prefers-reduced-motion: reduce`.

In the app, the side-menu rows fade and slide 10px with a 320ms `cubic-bezier(0.22, 1, 0.36, 1)` ease, staggered 22ms plus a 40ms start delay, and they do not animate when reduced motion is on.

Reels (Video Studio) may be more athletic than the website, but they still have to feel like Slabhold:

- Hook is on screen within 0.5s.
- Beats last about 1.5–2.5s; readable, not sluggish.
- Designed purple stage with type in clean space. Do not lay captions over a raw screen recording as if it were a tutorial.
- No pill captions, no floating phone mockups, no galaxy or starfield.
- A seamless loop is preferred. Land the last frame on the first when you can.
- The collectors line is spoken or written once, in the closer, not mid-reel.

## Voice & Content Strategy

Write as the team: "the team at Slabhold," "we." Do not name the founder in posts, replies, or graphics. Hobby-native, short, and plain. Lead with the collector moment.

The closer, when a reel or film needs one: **Slabhold. Built by collectors, for collectors. Now available on the App Store.** On-screen tagline casing matches the landing footer: "Built by collectors, for collectors."

Banned in marketing copy: **best**, **AI**, **free**, **number one**, **flip**, **Quick Comp**. "Flip it over" (as in turning a card) is allowed. Do not say "next upgrade." Do not say "eBay" about our sold data; say it is via Trawl. Do not invent user counts, testimonials, or sale prices. Do not promote on-hold features.

## Components

- **Primary button** — purple `#7C3AED`, off-white label, 48px tall, 8px radius, 16px / 500 or 16px / 500–600 type. In the iOS app, "Open Slabhold" takes this purple treatment.
- **Secondary / Open on web** — 48px, 8px radius, 1px `#A78BFA55` border, hover border `#A78BFA` and fill `#0E0A1A`.
- **App Store badge** — Apple's official US English "Download on the App Store" artwork at `public/landing/app-store-badge.svg`, used unchanged. Do not recolor, redraw, or crop it. Nav height 40px; main-action height 48px (3:1). The words "Download on the App Store" appear only as that artwork's accessible name, not as restyled text.
- **Logo** — `public/logo.svg`. Tile `#7C3AED`, slab `#FFFFFF`, star and label `#5B21B6`.
- **End card** (reels and films) — dark purple field (`#07050D`; see the assumed `#0B0614` note under Colors). Icon centered. Wordmark "Slabhold" in white Geist. Tagline "built by collectors for collectors" / "Built by collectors, for collectors." URL `slabhold.app` in `#A78BFA`. Apple's official badge, unchanged, under the URL. Trademark line, small and muted: "Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc." Do not add team logos. Do not hold a static end card so long that it feels like a dead close; animate the stack so the closer can play, then loop or settle.

Phone frames in marketing are plain bezels around a real current-app capture. Never draw fake app UI.

## Do's and Don'ts

**Do**

- Use the purple palette and Geist / Geist Mono.
- Show the X-like Home timeline as the way to explain the app.
- Put a hook on a designed purple stage within 0.5s, then move in 1.5–2.5s beats.
- Use real screens, real cards, and the official Apple badge.
- Keep the collectors line for the close.
- Honor reduced motion and the 44px hit-area rule in product UI.

**Don't**

- Use teal, mint, or any hue from 160° to 200°.
- Use galaxy, starfield, or nebula backgrounds.
- Use pill-shaped captions or floating phone mockups.
- Repeat "built by collectors for collectors" mid-reel.
- Show or bash competitors.
- Recolor the logo, invent UI, or edit Apple's badge.
- Use the banned words listed under Voice.
- Mention Quick Comp.
- Use old app footage, or show the founder's face or voice.
