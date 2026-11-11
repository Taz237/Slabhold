# Card scanner: plan

Status: plan only, no code. Needs Donnie's decisions (see "Decisions we need" at the end).

Goal: point the iPhone camera at a raw card or a graded slab. Slabhold reads it, then opens the guided Add card flow already filled in, so the collector checks it and taps save. For raw cards we fill player, year, set, card # and parallel. For slabs we also fill grader, grade and cert #. It should feel as quick as X's iOS camera: opens instantly, captures on its own, no waiting on a spinner.

Note: `CLAUDE.md` lists the scanner as on hold. This plan assumes Donnie is lifting that. The last PR updates `CLAUDE.md`.

---

## 0. What we already have

We don't have to start from zero.

| Piece | Where | What it gives us |
| --- | --- | --- |
| `/scan` page | `app/(app)/scan/page.tsx`, `components/scan-view.tsx` | Take or pick a photo, then hand it to Add card. It doesn't read the card. |
| Photo handoff | `lib/capture.ts` (`saveScan` / `takeScan`, sessionStorage) | Gets the photo into `/cards/new` without uploading it. |
| Add card prefill | `app/(app)/cards/new/page.tsx` | Already takes `pick, player, year, set, num, parallel, sport, rookie`. It doesn't take grader, grade or cert yet. |
| Guided flow | `lib/cards/add-flow.ts`, `components/add-card/*` | Steps from player to review. A prefilled draft can open straight on Review. |
| Catalog search | `card_catalog` + `search_cards` RPC, `lib/catalog/search-remote.ts` | Ranked catalog matches from a text query. Free, with a 1s timeout. |
| Player directory | `lib/players/directory.json` (5,455 players) | Fuzzy player-name matching on the device, already loaded for Add card. |
| Parallels and sets | `lib/cards/data/*-parallels.json`, `lib/card-options.ts`, `lib/cards/parallels.ts` | Checklists for parallel names and serial runs. |
| Grade parsing | `lib/cards/grading-company.ts`, `lib/card-options.ts` (`parseGrade`) | Normalizes PSA, BGS, SGC and CGC grades and qualifiers. |
| iOS shell | `ios-app/` (Capacitor 8, loads https://slabhold.app) | Our own Swift plugin `SlabholdNative` (`SlabholdNativePlugin.swift`). `@capacitor/camera` 8.2.6 is installed. `NSCameraUsageDescription` is already set. |
| Rate limits | `lib/comps/rate-limit.ts`, `comps_rate_limits` / `anon_rate_limits` tables | Rate limits by user or subject, with per-bucket fail-closed. New buckets need no SQL. |
| Fake scan state | `components/card-photo-field.tsx` ("Sample match, not a real scan") | A placeholder that this work replaces. |

---

## 1. Approaches compared

All three approaches end the same way: they match what was read against our catalog (`search_cards` + player directory + parallels data) and rank the top 3. **No approach is allowed to invent a card the catalog and checklists don't support.** If a reader guesses a card #, the catalog has to agree before we show it as the top pick.

### A. On-device text reading (Apple Vision, in our Swift plugin) + catalog matching

How it works: a native full-screen camera, AVFoundation plus Vision, runs on the phone:
- `VNDetectRectanglesRequest` finds the card or slab edges live.
- When the frame is steady and sharp, it auto-captures, straightens the crop and runs `VNRecognizeTextRequest` (accurate mode).

The plugin sends back only the text lines with their positions, plus the cropped photo. Our web code parses the lines (slab label parser, raw card parser), queries `search_cards`, and ranks the top 3.

- **Accuracy (targets, measured on fixtures before launch):**
  - Slabs are very good. PSA, BGS, SGC and CGC labels print year, set, player, card #, variety, grade and cert in clean type. Target: the right card first ≥ 90% of the time, and grade + cert right ≥ 97%.
  - Raw cards are fair on the front alone. The player name is usually readable, but year, set and card # mostly sit on the back, and the set is often only a logo. Target: right player ≥ 90%, exact card in the top 3 ≥ 65% from the front only, ≥ 85% after an optional "show the back" capture.
  - Parallels are the weak spot. A parallel is a color or finish, and OCR can't see color. We fill it only when text says it (slab label, "/99" serial, insert name). Otherwise the confirm sheet asks.
- **Speed:** live rectangle detection is roughly 30 fps on the phone. OCR after capture takes about 150–350 ms on iPhone 12 or newer. Matching (one or two `search_cards` calls) takes about 150–400 ms. **About 0.5–0.8 s from capture to the confirm sheet.**
- **Cost per scan:** $0. Vision is part of iOS. `search_cards` is an RPC we already run. No Trawl calls.
- **Privacy:** the best of the three. The photo never leaves the phone unless the collector saves the card, which is today's upload. Only the recognized text goes to our catalog search, and we don't store it.
- **Catches:**
  - It needs a new iOS build (Swift code).
  - Web and older builds have no live reader. Safari has no text-detection API, and Tesseract.js is several MB and weak on card fonts.
  - It's only as good as the catalog's coverage.

### B. Vision model API from a Vercel route (e.g. Claude Haiku 5.5 or Sonnet 5.5)

How it works: the phone or browser sends a downscaled card photo (≤ 1024 px long side, JPEG, about 150–300 KB) to `POST /api/scan/identify`. The route asks the model for structured JSON (player, year, set, #, parallel, grader, grade, cert), then runs the same catalog matching.

- **Accuracy:** the best on raw cards. It recognizes set designs, logos and parallel colors with no text to read, so it can often name the set and parallel from the front alone. The risk is a confidently made-up card # or print run, which is why the catalog check stays in charge. On slabs it's about equal to A.
- **Speed:** about 1.5–4 s per scan (upload + model). That's slower than A, and it shows as a skeleton on the confirm sheet.
- **Cost per scan** (list prices as of Nov 2026; image ≈ width × height / 750 tokens, so about 1,400–1,900 tokens for a card, plus about 600 prompt and 300–500 output):
  - Haiku 5.5 ($0.10 in / $0.50 out per 1M tokens) is about **$0.0005 per scan**, so 10,000 scans is about $5.
  - Sonnet 5.5 ($2 in / $10 out per 1M) is about **$0.01 per scan**, so 10,000 scans is about $100.
  - Vercel function time is small (one short call per scan).
- **Privacy:** the photo goes to a third party. The provider doesn't train on API data by default, but we'd still update `/privacy`, keep no copy on our side, and only allow it for signed-in users.
- **Catches:** it's a new paid service (needs Donnie's OK and a key), adds per-scan latency, and needs hard caps (section 4).

### C. Cert # lookup for slabs (PSA Public API)

How it works: read the cert # from the slab (with A or B), then ask PSA's cert API for the card. It returns year, brand, subject, card #, variety and grade.

- **Accuracy:** about 100% for PSA slabs with a readable cert, because it's PSA's own record. BGS, SGC and CGC have no public cert API we can use (only lookup web pages, and we won't scrape them). For those, the label text from A is what we get.
- **Speed:** about 300–800 ms extra, server to PSA.
- **Cost per scan:** $0 on PSA's free tier, but that tier has a daily call cap. We'd confirm the current number and the terms when the account is created.
- **Privacy:** only the cert # is sent to PSA. Cert numbers are already private in our schema (left out of `public_cards`), so we keep them private here too.
- **Catches:** PSA only. It needs a PSA account and API token, and it adds to A rather than replacing it.

### Side by side

| | A. On-device + catalog | B. Vision model API | C. PSA cert lookup |
| --- | --- | --- | --- |
| Slab accuracy | High | High | Highest (PSA only) |
| Raw card accuracy | Fair (better with back) | Best | n/a |
| Parallel detection | Text clues only | Good (sees color) | From PSA record |
| Capture to matches | ~0.5–0.8 s | ~1.5–4 s | +0.3–0.8 s |
| Cost per scan | $0 | ~$0.0005–$0.01 | $0 (free tier quota) |
| Photo leaves phone | No | Yes | No (cert # only) |
| New iOS build | Yes | No | No |
| Keys needed | None | Model API key | PSA token |
| Works on web | Photo + manual only | Yes | Yes |

### Recommendation

**Build A, with catalog matching, now.** It's free, private and the fastest, and it covers the case it's best at, slabs. Raw cards get a clear confirm sheet and a quick "show the back" step.

Then, only if Donnie approves:
1. **Add C** as a free upgrade for PSA slabs, behind the caps in section 4.
2. **Add B as a fallback, not the default.** It only runs when A's best match is low-confidence (mostly raw cards with no readable text), behind a feature flag, the per-user caps and a monthly spend limit. Start with Haiku 5.5. Move to a bigger model only if fixtures show Haiku misses parallels.

The flow, screens and prefill are the same with or without B and C. They plug in as one more "identify" source.

---

## 2. Exact UX

Design for 390 px first. The camera is full-bleed native on iOS. The confirm sheet is our web UI, so it looks the same on web and iOS. Tap targets are ≥ 44 px. Motion respects `prefers-reduced-motion` (native: `UIAccessibility.isReduceMotionEnabled`).

### Entry points
- **iOS:** "Scan a card" is the first choice in the create menu and at the top of Add card's search door ("What's on the card?"). `/scan` opens the native scanner directly.
- **Web, and iOS builds without the plugin:** the same buttons open today's photo picker, then go to the search door with the photo attached (section 2.7). No dead buttons: the web checks `pluginAvailable('SlabholdScanner')`, the same pattern as `nativeShareFilesAvailable()`.

### 2.1 Camera screen (native)

```
┌───────────────────────────────┐
│ ✕                       ⚡︎    │  close (44px) · torch toggle
│                               │
│     ┌───────────────────┐     │
│     │                   │     │  card-shaped guide, 2.5:3.5
│     │                   │     │  (slab mode: 3.1:5.3, label zone marked)
│     │                   │     │
│     │                   │     │
│     └───────────────────┘     │
│      Fit the card in the frame│  one-line hint
│                               │
│   [ Card | Slab ]             │  segmented, auto-switches
│  🖼          ◯          Aa    │  library · shutter · type it instead
└───────────────────────────────┘
```

- Black background (#09090B), live preview, everything outside the guide dimmed to about 60%.
- The guide is four rounded corner brackets in off-white. When we lock onto a card they turn brand purple (#7C3AED) and snap to the detected edges. No glow and no pulsing.
- Card / Slab toggle: we pick automatically from the detected shape (a slab is taller and has a label band) and flip the toggle to show it. Tapping it forces a mode and changes the guide shape.
- Hint line (sentence case, one at a time):
  - "Fit the card in the frame"
  - "Hold still"
  - "Move a little closer"
  - "Too much glare, tilt it a bit"
  - "Got it"
- The shutter is always there for manual capture. Torch defaults to off, and we offer it after about 2 s of low light.
- The camera opens in under 300 ms. The session is prewarmed when the Add card sheet opens, then torn down when it closes, so it doesn't drain the battery.

### 2.2 Auto-capture

Capture fires when all of these hold for about 400 ms (about 12 frames):
1. A rectangle with the card or slab aspect ratio (±8%) fills ≥ 55% of the guide.
2. The corners move less than 2% of the frame width between frames.
3. Sharpness (Laplacian variance on a downscaled luma frame) is above the threshold.
4. Highlight clipping is below the glare threshold.
5. A quick fast-mode OCR pass sees at least a few characters, so we don't capture a blank back or a sleeve's glare.

On capture: a light haptic (`ImpactStyle.Light`), the shutter flashes once (just a cut with reduced motion), and the straightened crop shrinks into the bottom of the screen as the confirm sheet rises. With no lock after 6 s, the hint becomes "Tap the button to take it yourself".

**Raw cards, back of card (optional):** if the front gives a player but several possible card numbers, the camera stays open and asks "Flip it over for the card #" with a "Skip" button. The back capture works the same way. We never ask for slabs.

### 2.3 "Is this your card?" confirm sheet (web UI)

The bottom sheet rises over the captured photo. Skeleton rows show while matching. No spinners and no $0.

```
┌───────────────────────────────┐
│ ▔▔▔                           │
│ Is this your card?            │
│ ┌─────┐ Luka Dončić           │  top match, large
│ │photo│ 2018 Panini Prizm #280│
│ │crop │ [Silver] [PSA 10]     │  parallel swatch chip, grade chip
│ └─────┘ Cert ••••5678         │  slabs only, masked
│ [   Yes, that's it   ]        │  primary violet-600
│ ─────────────────────────────  │
│ Or one of these               │
│  ▢ 2018 Panini Prizm #280 Base│  two compact rows
│  ▢ 2018 Donruss Optic #177    │
│ None of these · Retake        │
└───────────────────────────────┘
```

- **Top match:**
  - Our cropped photo, not a stock image. If the crop fails, we show the designed card placeholder (`card-slab-art`), never a broken image.
  - Fields we're unsure of show "Not sure" in muted text, never a guess shown as fact. If only the parallel is uncertain, the chip reads "Pick parallel" and we jump to that step.
- **Yes, that's it:** opens `/cards/new` with the draft filled and lands on **Review** (or on the first uncertain step, such as parallel or serial #). The photo is attached. Save works as it does today.
- **Rows 2 and 3:** tapping one makes it the top match. We show at most 3 rows. With only 1 or 2 matches, there's no empty filler.
- **None of these:** goes to the guided flow. It fills only what we're sure of (usually the player, and the grade on slabs) and attaches the photo. The search door is pre-typed with the best text we read.
- **Retake:** back to the camera, same mode.
- **No matches at all:** the sheet says "We couldn't find this one yet" and offers "Add it step by step" (guided flow with the photo) and "Retake". There's no dead end.
- We don't show a value here. A value would mean a Trawl call, and we're not adding any. If the card already has a cached value in our catalog cache we may show it later, but not in v1.

### 2.4 Manual fallback, available everywhere
- The "Aa Type it instead" button on the camera screen goes to the search door.
- If the camera permission is denied, we show a designed state: "Camera's off for Slabhold" with "Open Settings", "Choose a photo" and "Type it instead".
- If the plugin errors or times out (more than 3 s on OCR), we fall back to the confirm sheet's "No matches" state with the photo kept.

### 2.5 Photo library pick
- iOS: the library button uses the existing `pickPhoto('library')`. The new plugin method `recognize({ image })` runs the same straighten, crop and OCR on the still photo. Same confirm sheet after that.
- Web: library pick or the web camera (`<input capture>`) goes to the photo + search door (2.7). Once B is approved, web photos can use B too.

### 2.6 States checklist (for /unslop)
Matching skeleton · top-3 · 1 match · no match · uncertain parallel · slab with cert · PSA cert-verified badge ("Checked with PSA", only with C) · permission denied · plugin missing (old build) · offline ("You're offline. Add it step by step and we'll keep the photo.") · rate-limited ("Too many scans for now. Add it step by step.").

### 2.7 Web path
Web can't do live OCR. `/scan` keeps today's photo step, then goes straight to the search door with the photo attached, under the line "Scanning works in the iPhone app". There's no fake "match", so we remove the current "Sample match, not a real scan" state.

---

## 3. What changes

### New and changed files (web)
| File | Change |
| --- | --- |
| `lib/scan/slab-label.ts` (+ test) | New. Parses OCR lines from PSA, BGS, SGC and CGC labels into grader, grade, qualifier, cert, year, set, player, # and variety. Pure, with fixtures. |
| `lib/scan/raw-text.ts` (+ test) | New. Pulls out the player (via directory, OCR-tolerant: 0/O, 1/I, accents), year (`©2023`, `2023-24`), card # (`#`, `No.`), serial (`12/99`), RC/rookie, and set and brand words from `SETS`. |
| `lib/scan/match.ts` (+ test) | New. Builds `search_cards` queries, scores candidates (player, year, set, #, parallel, serial run against checklists) and returns the top 3 with per-field confidence. |
| `lib/scan/types.ts` | New. `ScanRead` (lines, boxes, side, kind), `ScanMatch`. |
| `lib/capture.ts` (+ test) | Add `saveScanMatch` / `takeScanMatch` (sessionStorage). **Grade and cert go through here, not the URL**, so the cert # never lands in URLs, logs or analytics. |
| `components/card-form.tsx`, `lib/cards/new-card-draft.ts`, `lib/cards/add-flow.ts` | Read a scan match into the draft (grader, grade, qualifier, cert included) and pick the start step (Review or the first uncertain step). |
| `components/scan/confirm-sheet.tsx` (+ test) | New. The "Is this your card?" sheet. |
| `components/scan-view.tsx`, `app/(app)/scan/page.tsx` | Rework into the scan hub: native scanner when available, the web path otherwise. |
| `components/card-photo-field.tsx` | Remove the fake "Sample match" state. |
| `lib/ios/native.ts`, `lib/ios/native-helpers.ts` | `scanCard()`, `recognizePhoto()`, `scannerAvailable()` wrappers for the new plugin methods. |
| `lib/scan/flag.ts` | `NEXT_PUBLIC_SCANNER === "1"`, the same pattern as `lib/quick-comp/flag.ts`. |
| `lib/analytics.ts` | Events: `scan_opened`, `scan_captured` (auto or manual), `scan_matched` (rank picked: 1, 2, 3 or none), `scan_fallback`. Counts only, no text and no images. |
| `app/(app)/privacy/page.tsx` | One line on the scanner: on-device reading. If B or C is approved, also what's sent and to whom. |

Only if B or C is approved:
- `app/api/scan/identify/route.ts` (B)
- `app/api/scan/cert/route.ts` (C)
- `lib/scan/vision.ts`, `lib/scan/psa.ts`
- New rate-limit buckets in `lib/comps/rate-limit.ts`

### iOS (`ios-app/`)
| File | Change |
| --- | --- |
| `ios-app/ios/App/App/SlabholdScanner.swift` | New. A full-screen `UIViewController` with AVCaptureSession, rectangle detection, the steadiness, sharpness and glare gate, `AVCapturePhotoOutput`, `CIPerspectiveCorrection` crop and `VNRecognizeTextRequest`. Draws the guide natively. |
| `ios-app/ios/App/App/SlabholdNativePlugin.swift` | Add `scanCard({ mode })` → `{ lines, boxes, kind, side, image (JPEG base64, 1280px) }`, `recognize({ image })` for library photos, and `scannerAvailable`. |
| `ios-app/ios/App/App/Info.plist` | Reword `NSCameraUsageDescription`: "Slabhold uses the camera to photograph and identify cards you add to your collection." |
| `ios-app/ios/App/App/PrivacyInfo.xcprivacy` | Check it. Vision and AVFoundation need no new required-reason entries, but we confirm at build time. |

- **New iOS build: yes.** The Swift plugin code has to ship through TestFlight and the App Store. Web PRs can merge before it, because they detect the plugin and fall back.
- **New dependencies: none.**
  - Web: no new npm packages.
  - iOS: Apple frameworks only (AVFoundation, Vision, CoreImage). No new Capacitor plugin, CocoaPods or SPM packages.
  - `@capacitor/camera` stays for library picks.
  - We considered VisionKit's `DataScannerViewController` (iOS 16+), which has nice live text highlighting. But it doesn't give us our own guide, auto-capture rules or crop, so we use AVFoundation + Vision directly.

### SQL
**Not needed for the recommended path (A).**
- `cards.cert_number` and the grade columns already exist.
- Rate limits reuse `comps_rate_limits` and `anon_rate_limits` with new bucket names.
- Accuracy metrics go through existing analytics.

**Separate optional step, only with C**: a small cert-lookup cache, so the same cert isn't looked up at PSA twice. It would be one new migration file with the header `-- UNAPPLIED. Needs review before running.`, in its own PR marked "CONTAINS SQL, needs review", and never run by us. Rough shape: `scan_cert_cache(grader text, cert_hash text, payload jsonb, fetched_at timestamptz, primary key (grader, cert_hash))`, RLS on with no client policies (service role only), and rows pruned after 30 days. We skip it unless PSA's daily cap turns out to be tight.

---

## 4. Rate limits and cost caps

**Path A costs nothing per scan, but we still cap it:**
- Live frames are processed on the phone only. Nothing is sent while the camera is open.
- Each capture makes at most 2 `search_cards` calls (front, plus back if taken), each one already capped at a 1 s timeout and 20 rows.
- The client allows one in-flight match at a time, and a retake cancels the earlier one.
- No Trawl calls anywhere in the scan flow. The confirm sheet shows no values, and saving the card prices it the way Add card does today, under the existing Trawl limits.

**If C (PSA) is approved:**
- Bucket `scan_cert`: 20 lookups per user per day. It **fails closed**, like `quick_comp_day`.
- Global daily cap: counter `global:scan_cert` in `anon_rate_limits` (subject is text, so no SQL), set below PSA's free daily quota (for example 80% of it). Once it's reached we skip C quietly and use the label text.
- We only call it when a cert # was read cleanly (it passes the PSA cert-number format check) and only for signed-in users.

**If B (vision model) is approved:**
- Signed-in only. Guests never trigger a paid call.
- It only runs as a fallback when A's best match confidence is low. It never runs for slabs whose label read cleanly.
- Per user: `scan_identify` 10 per 10 minutes and `scan_identify_day` 30 per day, both **fail closed**.
- Global: counter `global:scan_identify` per day (for example 2,000, which is about $1 a day on Haiku 5.5). When it's hit, B switches off until midnight UTC, and scans fall back to A plus the confirm sheet.
- Request size: the image is ≤ 1024 px and ≤ 400 KB, otherwise a 413 response. `max_tokens` is small (JSON only). The route's `maxDuration` is 15 s.
- Backstop: a **monthly spend limit on the provider's console** (for example $25), so a bug in our counters can't run up a bill.
- Kill switches: `SCAN_VISION_ENABLED` and `SCAN_CERT_ENABLED` server env flags, default off. `NEXT_PUBLIC_SCANNER` hides the whole feature.
- No storage: we keep no images or model output. Analytics records only which rank was picked.

---

## 5. PR breakdown

Small PRs against `main`, web-only first. Every PR is test-first and passes `npm test`, `npm run lint:ci` and `npm run build`. UI PRs go through `/unslop` and include 390 px screenshots. None of PRs 1–9 adds a paid call, key or SQL.

| # | PR | Web / iOS | Notes |
| --- | --- | --- | --- |
| 1 | This plan (`docs/scanner-plan.md`) | docs | No SQL. |
| 2 | Slab label parser + fixtures (PSA, BGS, SGC, CGC label text, hand-written, no real users' data) | web | Pure lib. |
| 3 | Raw card text parser (player, year, #, serial, RC, set words) + fixtures | web | Pure lib, uses the directory and `SETS`. |
| 4 | Matcher: `search_cards` queries + ranking + per-field confidence, top 3 | web | Fixture catalog in tests. |
| 5 | Scan match handoff + Add card prefill (grader, grade, qualifier, cert via sessionStorage; start on Review or the first uncertain step) | web | Testable without a camera. |
| 6 | "Is this your card?" confirm sheet + all states (2.6), behind `NEXT_PUBLIC_SCANNER` | web, UI | Includes a dev-only fixture mode so we can review it on web. |
| 7 | `/scan` hub + web path; remove the fake "Sample match" state; entry points in the create menu and search door | web, UI | Old iOS builds fall back here. |
| 8 | Native scanner: `SlabholdScanner.swift`, plugin methods `scanCard`, `recognize`, `scannerAvailable`; Info.plist copy | **iOS build** | TestFlight first. Web wrappers in `lib/ios/native.ts` with the plugin check. |
| 9 | Wire the native scanner into `/scan` and Add card; back-of-card step; analytics events; privacy page line | web | Flag on for TestFlight testers, then everyone. |
| 10 | *(Optional, needs OK + PSA token)* PSA cert check route + `scan_cert` caps + "Checked with PSA" badge | web | No SQL unless 10b. |
| 10b | *(Optional)* `scan_cert_cache` migration, unapplied | SQL | "CONTAINS SQL, needs review". Separate PR. |
| 11 | *(Optional, needs OK + API key)* Vision model fallback route + caps + kill switch | web | Haiku 5.5 first, with a fixture eval before it's turned on. |
| 12 | `CLAUDE.md`: take the scanner off the on-hold list | docs | When we launch it. |

**Accuracy gate before launch:** a fixture set of about 60 OCR dumps (30 slabs across the 4 graders, 30 raw cards front and back) from the team's own cards, not the real Jaylen Brown card and no user data. It runs in `npm test` so we can track the targets in section 1A. We launch when slabs hit the target and raw cards reach the top-3 target with the back step.

---

## 6. Keys and accounts (none added yet)

| For | What's needed | Cost | Needed for |
| --- | --- | --- | --- |
| A (recommended) | Nothing new. The existing Apple developer account ships the new build. | $0 | PRs 2–9 |
| C, PSA cert check | A PSA account + Public API access token (would be `PSA_API_TOKEN` in Vercel env). Confirm the free-tier daily limit and that app use is allowed. | Free tier | PR 10 |
| B, vision fallback | An Anthropic API key (would be `ANTHROPIC_API_KEY` in Vercel env), in its own workspace with a monthly spend limit set. | ~$0.0005 per fallback scan on Haiku 5.5 | PR 11 |
| BGS, SGC, CGC cert check | No public API we can use. We won't scrape. We use label text instead. | n/a | n/a |

## Decisions we need

1. OK to lift the scanner off the on-hold list and build A (PRs 2–9)?
2. Should we set up a PSA API account for cert checks (C)?
3. Should we allow a paid vision fallback for raw cards (B)? If so, what monthly spend limit (we suggest $25) and global daily cap?
4. Is the optional back-of-card step OK for raw cards, or should it be front-only and lean on the confirm sheet?
