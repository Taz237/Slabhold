# Card scanner: plan

Status: final plan (PR 1). No code and no keys in this PR. The PSA cert API is not used because it's paid only.

Goal: point the iPhone camera at a raw card or a graded slab. Slabhold identifies it (player, year, set, card #, parallel, plus grader, grade and cert # for slabs) and opens the guided Add card flow already filled in, so the collector just confirms and saves. It should be better than CollX, Card Ladder and the "card scanner" apps, and as smooth as X's iOS camera.

Budget: **up to $50/month for all paid services.** We use paid AI only where it makes the scanner clearly better.

`CLAUDE.md` still lists the scanner as on hold. The last PR updates it.

---

## 1. How the competitors scan

A caveat on sources: most head-to-head accuracy numbers come from blogs run by competing scanner apps (Cards AI, PreGrade). We quote them as "claimed" and plan to measure our own scanner on our own fixtures (section 6).

### CollX
- **How it scans:** image matching ("visual search") against a database CollX says has 20M+ cards, built on deep-learning image recognition. "Scan+" is an enhanced scan mode, marketed at about 95% detection (we couldn't verify that number).
- **Praise:** fast, good on modern base cards, big catalog, easy cataloging.
- **Complaints:**
  - **Wrong parallels.** One comparison claims CollX gets the base card right but misses the parallel about 35% of the time, for example calling a Silver Prizm just "Prizm" (about 65% parallel accuracy, competitor-sourced).
  - Wrong player, year or reprint (one App Store review: a 1959 Topps Mays read as a 1994 reprint). A Trustpilot reviewer says it still gets cards wrong "50% of the time".
  - Opaque values that run high (claimed about 22% above sold prices), with the sales behind them not shown.
  - **Paywall:** Pro is $10/month or $100/year, and Gold is $24.99/month for unlimited Scan+.

### Card Ladder
- **How it scans:** a "take a pic" photo search that leads into sales data. Scanning is a side feature; Card Ladder's real strength is comps and indexes.
- **Praise:** sales data, collection tracking, the app keeps improving.
- **Complaints:**
  - **Slabs scan badly.** A reviewer says that with a slab you "pretty much have to scan just the name and grade otherwise you get really bad results."
  - Photo search "misses a lot of sales", "works maybe 50% of the time", and in one recent version the scan didn't work at all.
  - **Paywall:** Pro is $19.99/month or $199.99/year.

### "Card Scanner Pro" and similar apps
We couldn't find one app by that exact name. The App Store has many look-alikes ("Sports Card Value Scanner Pro", "CardsPro", "Card Scanner Sports Cards", CardX, Cardstock). Please confirm if you meant a specific one. The pattern across them:
- **How they scan:** generic AI image identification with an estimated price.
- **Praise:** "fast", faster than typing a search.
- **Complaints:**
  - **Hard paywalls after 1–8 scans** ("only scan 8 cards before being asked to subscribe", "$20 every month").
  - Wildly wrong values (one user: "$712 vs under $180").
  - Misreading the year (a 2025 card read as 2023) and missing variations.

### Ludex and Card Dealer Pro (for reference)
- **Ludex:** widely called the parallel leader (claimed about 85% parallel accuracy, competitor-sourced). Some users say it "throws out random parallels". Premium is about $19.99/month.
- **Card Dealer Pro:** a dealer tool for bulk scanning (desktop scanner or phone photos) with AI matching against about 20M card records, plus cert lookup for slabs. It charges per card in "AI credits": $9 for 500, $19 for 1,100 or $59 for 5,000 a month, so **about 1.2–1.8¢ per card**. A reviewer says phone photos needed more fixes than the scanner did.

### What this tells us
1. **Parallels are the open problem.** Even the leaders miss on roughly 15–35% of parallels, and wrong guesses shown as fact are what make users angry.
2. **Slabs are badly served** by photo-match scanners, even though the label prints everything in text.
3. **Paywalls and scan caps** are the biggest source of resentment in this category.
4. **Unexplained values** erode trust. We already show recent sold prices via Trawl, so we start ahead on this.
5. We can't beat CollX's 20M-image database on raw image matching at launch, so we shouldn't try. We win with text, checklists and AI that has to pick from real options.

---

## 2. Our options compared

| | A. On-device text reading | B. Image matching vs our catalog | C. Paid vision AI step |
| --- | --- | --- | --- |
| What it is | Apple Vision on the phone: edge detection, auto-capture, crop, OCR | An embedding of the photo compared to reference card images | Send the cropped photo + OCR text to a vision model and get structured JSON back |
| Slabs | **Excellent.** The label has year, set, player, #, variety, grade and cert in clean type | Weak: the slab case and label dominate the image | Excellent, but not needed when the label reads cleanly |
| Raw card identity | Fair. The name is usually readable, but year, set and # are mostly on the back | Good **if** we had reference images | **Best.** Recognizes set designs and logos without text |
| Parallels | Text clues only ("/99", insert names, slab label) | Poor. Parallels share a design and differ by color, so they embed close together | Good when **constrained to the set's real parallel list** |
| Speed | About 0.2–0.4 s OCR, plus about 0.2–0.4 s catalog match | About 0.1 s on device, plus a vector lookup | About 1.5–3 s (upload + model) |
| Cost per scan | $0 | On device $0. Hosted embeddings about $0.00003–0.00012/image (Voyage, Titan, Gemini Embedding) | Haiku 5.5 about **$0.0005–0.001**; Sonnet 5.5 about $0.012–0.026 (math below) |
| Privacy | Photo stays on the phone | On device: stays on the phone | The photo goes to the model provider (no training on API data by default). We keep no copy. |
| Blocker | Needs a new iOS build | **We have no reference images.** `card_catalog` is text only. Licensed card images don't exist for us, and scraping listing photos would mean new Trawl usage plus image rights. Also needs SQL (vector table). | Needs a key and caps |

### Paid AI pricing (list prices, Nov 2026)

| Model | Input / 1M tokens | Output / 1M tokens |
| --- | --- | --- |
| Claude Haiku 5.5 | $0.10 | $0.50 |
| Claude Sonnet 5.5 | $2.00 | $10.00 |
| Claude Opus 5.5 | $4.00 | $20.00 |
| Gemini 2.5 Flash-Lite (for comparison) | $0.10 | not checked |
| Gemini 3.1 / 3.5 Flash-Lite (for comparison) | $0.25 / $0.30 | not checked |

We only checked Gemini's input prices on Google's pricing page. Haiku 5.5 is the cheapest of these per input token and keeps us on one provider with one key and one spend limit.

**Tokens per scan.** Claude counts an image at roughly width × height / 750 tokens. We crop and send each side at ≤ 1024 × 1434 px, which is about 1,950 tokens per side. We'll confirm with the token-counting endpoint during the eval.
- Input: front only is about 1,950 image + about 1,200 prompt, OCR text and checklist ≈ **3,200 tokens**. Front and back is ≈ **5,200 tokens**.
- Output: a small JSON answer with thinking off, capped by `max_tokens`. Typical about 300 tokens, **hard ceiling 800** (Haiku) or 1,200 (Sonnet).

| Per call | Typical (front, 300 out) | Worst case (front+back, max out) | Scans $50 covers (typical / worst) |
| --- | --- | --- | --- |
| Haiku 5.5 | $0.00032 + $0.00015 = **$0.0005** | $0.00052 + $0.0004 = **$0.0009** | **~100,000 / ~55,000** |
| Sonnet 5.5 | $0.0064 + $0.003 = **$0.009** | $0.0104 + $0.012 = **$0.022** | ~5,500 / ~2,250 |
| Opus 5.5 | about $0.018 | about $0.045 | ~2,750 / ~1,100 |

For comparison, Card Dealer Pro charges dealers 1.2–1.8¢ per card. Our Haiku step costs about 0.05–0.09¢.

---

## 3. Recommendation: the combo that beats them

**On-device reading first, catalog and checklist match second, and Haiku 5.5 only when the phone can't settle it. Sonnet 5.5 runs only when the collector taps "Look closer". Image matching waits until after launch.**

Flow for one scan:
1. **On the phone (no cost, about 0.5 s):** edge detection, auto-capture, straightened crop, OCR. We also sample border and background color and check for refractor shimmer, using the existing `parallel-swatch` color names as the vocabulary.
2. **Slab?** We parse the label (grader, grade, qualifier, cert, year, set, player, #, variety), check it against the catalog and checklists, and go to the confirm sheet. **No paid call, no limit, under 1 s.**
3. **Raw card, and the phone settled it?** That means the player, year, set and # all agree with one catalog row, and the parallel is pinned by text (for example "/99" matching only one parallel in the checklist). Confirm sheet, **no paid call**.
4. **Raw card, not settled?** We call **Haiku 5.5** with the cropped front (and back if taken), the OCR lines, the top catalog candidates and **that set's real parallel list** from our checklists (`lib/cards/data/*-parallels.json`, `lib/cards/parallels.ts`). The model has to pick from those lists or answer "not sure", and it returns JSON. The catalog stays in charge: a card # or parallel the checklist doesn't have is never shown as the top pick.
5. **"Look closer" (the collector's choice):** on the confirm sheet, if the parallel is still "Not sure" or the matches look wrong, one tap re-runs the step on **Sonnet 5.5** with both sides. Limited per day (section 5).

We expect about 30–50% of raw scans to be settled on the phone and the rest to need Haiku. That's an estimate, and the eval will measure it.

**Phase 2, after launch (not in the $50 math):** learn from confirmed scans. When a collector confirms a scan, the phone stores an on-device Apple feature print against that catalog row, so the next scan of the same card can be matched with no paid call. This needs a vector table (SQL, separate reviewed step) and only uses photos the owner has made public. It gets better as the community grows, and parallels still come from steps 3–5.

**Fixture eval before choosing models for good:** we run Haiku 5.5 and Sonnet 5.5 on about 100 of the team's own card photos (not the real Jaylen Brown card). That costs under $3, inside the $50 month. If Haiku's parallel picks are within 5 points of Sonnet's, Haiku stays the default. If they aren't, we raise the share of "Look closer" or move to Sonnet with tighter caps.

### Three things we'd do better
1. **Parallels that are right or honestly "not sure".** CollX and Ludex guess from the picture. We:
   - read the serial ("/99"),
   - offer only parallels that exist for that set and year,
   - make the AI pick from that list,
   - show color swatches when the collector has to choose.

   A wrong guess shown as fact is the #1 complaint, and we never do that.
2. **Slabs in one shot, fast, with no paid call.** We read the whole label: grader, grade, qualifier (OC, MK), cert, card and variety. No "scan just the name and grade" workaround like Card Ladder's, and no paid call.
3. **No scan paywall, and honest values.** Scan as many cards as you want, with no 8-scan trap. Every value is recent sold prices via Trawl with the sales shown, so the inflated "$712 vs $180" numbers can't happen.

Also better on feel: auto-capture with no shutter tap needed, slabs to the confirm sheet in under 1 s, and raw cards showing the player instantly while the AI fills in set and parallel.

---

## 3.1 If our accuracy doesn't clearly beat them: win around the scan

CollX has a 20M-image database and years of training, so on raw-card accuracy we may only match them. The launch eval (section 7, PR 11) tells us. If we only match, we still win on **what happens after the scan**: the scanner just needs to be "right or a 1-tap fix", and the rest of the flow carries us.

Our bar for "clearly beats" is the eval's top-1 raw-card accuracy (identity + parallel) beating the best competitor's claimed figure by at least 5 points. The competitor figures are only claims, so we treat this bar as rough. Whatever the result, we track **camera open → card saved** time and the **fix rate** (how often the collector changes our top pick), and aim to keep improving both.

### Ranked by impact vs effort

| Rank | Idea | Impact | Effort | Why | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | **No paywall on scanning** | High | ~None | The #1 complaint about every scanner app. We have no paywalls. Our real limit is the AI budget, and a capped scan still works (pick the parallel). | **Launch.** The `/scan` copy says "Scan as many cards as you want." |
| 2 | **Top-3 confirm sheet with 1-tap parallel picking** | High | Low (already PR 6) | It turns a wrong guess into one tap, so a miss costs less here than at CollX. A swatch strip of the set's real parallels with our pick preselected, plus serial # entry when the parallel is numbered. | **Launch.** Strengthen PR 6. |
| 3 | **One-tap scan to collection** | High | Low–med | "Yes, add it" saves straight away with the collector's remembered visibility choice (existing `visibility-choice`). "Edit details" opens Review for anyone who wants it. Paid price stays optional, as today. Target: camera open → saved in **under 5 s** for a slab. | **Launch.** New PR. |
| 4 | **Social payoff after the scan** | High (nobody else has a feed) | Low | All of it exists already: the card-added panel, "Also post to my feed", and owners and hunters per card (`lib/cards/owners.ts`, `/api/cards/people`). After a scan save we show "Post your pull" plus "**4 collectors own this · 2 are hunting it**", so the scan leads straight into the social app. | **Launch.** New PR. |
| 5 | **Instant value after the scan** | High in principle, medium today | Low (cached values only) | We can't add Trawl calls. We **can** show a value instantly when that card identity already has a cached value or comps result (recent sold prices, last sales, trend arrow), using the existing caches with no new Trawl call. When nothing's cached, the card prices on save the way it does now, under the existing Trawl limits, and the panel shows a skeleton and then the value. Decided: no new Trawl calls per scan. | **Launch, cached-only (decided).** New PR. |
| 6 | **Learning from fixes** | Medium at launch, grows with use | Medium + **SQL** | When a collector picks match #2 or #3, changes the parallel, or taps "None of these" and then finds the card, we store **only text**: the normalized OCR tokens, our pick and their pick. No photos and no user IDs in the matcher table. The matcher boosts those mappings for everyone, for example "OCR 'PRIZM SILVER' on a 2018 Prizm front → Silver". Repeat fixes for the same card fold into one row. It needs a table, so a separate reviewed migration. Later it feeds Phase 2 image matching. | **First post-launch item.** SQL PR first. |
| 7 | **Batch scanning a stack** | High for big collectors, low for most | High (native continuous mode, a queue, a review screen) | The camera stays open: card in, auto-capture, swap card, repeat. Each scan lands in a "Stack" review list where the collector confirms all at once and fixes the few marked "check this". It reuses the same pipeline. AI calls still count against the per-user daily cap. Scans past the cap are kept and marked "Pick parallel" rather than blocked. | **Post-launch.** Needs a second iOS build. |

Rough priority: 1 and 2 cost almost nothing and fix the category's biggest complaints. 3 and 4 make Slabhold feel faster and more rewarding than any scanner, because the scan ends in your collection and your feed, not a price screen. 5 is strong but limited by the no-new-Trawl-calls rule. 6 and 7 are worth doing, but only once launch data shows where people fix and how many cards they add at once.

### What we measure (analytics, counts only)
- Camera open → saved time
- Fix rate by kind (identity, parallel, number)
- Share of scans posted to the feed
- Scans per session (this tells us whether batch scanning is worth building)

---

## 4. Exact UX

Design for 390 px first. The camera is native full-bleed on iOS. The confirm sheet is our web UI. Tap targets are ≥ 44 px, motion respects reduced-motion, there are no spinners (skeletons instead) and no broken images (designed placeholders instead).

### Entry points
- **iOS:** "Scan a card" sits first in the create menu and at the top of Add card's search door. `/scan` opens the native scanner.
- **Web, and iOS builds without the plugin:** photo pick or the web camera. With AI on, the web path also gets steps 4–5 from a photo (no live reading). With AI off or capped, it goes to the search door with the photo attached. There are no dead buttons: the web checks for the plugin, the same way `nativeShareFilesAvailable()` does.

### Camera screen (native)
```
┌───────────────────────────────┐
│ ✕                       ⚡︎    │  close (44px) · torch
│     ┌───────────────────┐     │
│     │                   │     │  card guide 2.5:3.5
│     │                   │     │  (slab: 3.1:5.3, label band marked)
│     └───────────────────┘     │
│      Fit the card in the frame│  one-line hint
│   [ Card | Slab ]             │  auto-switches from shape
│  🖼          ◯          Aa    │  library · shutter · type it instead
└───────────────────────────────┘
```
- Black (#09090B), live preview, the area outside the guide dimmed.
- Off-white corner brackets turn brand purple (#7C3AED) and snap to the card edges when we lock on. No glow and no pulsing.
- Hints, one at a time: "Fit the card in the frame", "Hold still", "Move a little closer", "Too much glare, tilt it a bit", "Got it".
- The camera opens in under 300 ms. The session is prewarmed while Add card is open and torn down when it closes.

### Auto-capture
Capture fires when all of these hold for about 400 ms:
- A card- or slab-shaped rectangle (±8%) fills ≥ 55% of the guide.
- The corners stay steady (less than 2% movement).
- It's sharp enough (Laplacian variance) and has no heavy glare (highlight clipping).
- There's a little readable text.

On capture: a light haptic, a single shutter flash (a cut with reduced motion), and the crop shrinks down as the confirm sheet rises. With no lock after 6 s, the hint says "Tap the button to take it yourself".

**Back of card (raw only, optional):** if the front leaves the card # open, the camera asks "Flip it over for the card #" and offers "Skip".

### "Is this your card?" confirm sheet
```
┌───────────────────────────────┐
│ Is this your card?            │
│ ┌─────┐ Luka Dončić           │  shows on-device result first
│ │crop │ 2018 Panini Prizm #280│  set/# rows skeleton until AI returns
│ └─────┘ ● Silver   [PSA 10]   │  parallel swatch · grade chip
│         Cert ••••5678         │  slabs only, masked
│ [   Yes, that's it   ]        │
│ Or one of these               │
│  ▢ 2018 Panini Prizm #280 Base│
│  ▢ 2018 Donruss Optic #177    │
│ Look closer · None of these · Retake │
└───────────────────────────────┘
```
- **Updates in place:** the player and anything the phone read appear first. Rows still waiting on the AI show skeletons with "Checking the set and parallel" for about 1.5–3 s. Nothing jumps around.
- **Parallel row:**
  - If we're sure, it shows one swatch chip.
  - If we're not, it shows "Pick parallel" with the 3–6 likeliest swatches from that set's checklist plus "Something else". It never shows a guess as fact.
- **Yes, that's it:** goes to `/cards/new`, filled in, on the Review step (or the first uncertain step), with the photo attached. Save works as it does today.
- **Look closer:** one Sonnet pass on both sides (asks for the back if we don't have it). After the daily limit, the label reads "Pick it yourself" and opens the parallel step.
- **None of these:** the guided flow with only the fields we're sure of filled in, and the search door pre-typed.
- **No match:** "We couldn't find this one yet", with "Add it step by step" (photo kept) and "Retake".
- **No value shown on this sheet.** Values come after save, as today, so the sheet makes no new Trawl calls.

### Other states (for /unslop)
Permission denied ("Camera's off for Slabhold": Open Settings, Choose a photo, Type it instead) · plugin missing on an older build · offline (the phone-only result still works) · AI unavailable or capped ("Pick the parallel below", same sheet, no error wall) · daily "Look closer" limit reached · photo library pick (same pipeline on a still photo).

---

## 5. Hard spend cap and per-user limits ($50/month, never over)

Five layers. Any one of them alone stops the spend.

1. **Provider console spend limit: $50/month** on a dedicated Anthropic workspace, used only for the scanner. Calls fail there before any bill goes past $50. This is the hard backstop.
2. **App-side monthly ledger: $40/month** (leaving $10 of headroom under the console limit for the eval and rounding).
   - Every AI call records its **actual** cost from `response.usage` in micro-dollars, in an `anon_rate_limits` row (subject `global:scan_ai`, bucket `usd_micro_month`, window = start of the month). No SQL; the consume helper gains an "add N" variant.
   - Before each call we **reserve the worst-case cost** ($0.0009 for Haiku, $0.022 for Sonnet) and fail closed if the ledger would go past $40.
3. **App-side daily ledger: $2.00/day** (same mechanism, daily window), so one busy day or a bug can't use up the month. That's about 2,200 worst-case Haiku scans a day.
4. **Per user (signed in only; guests never trigger AI):**

   | Limit | Value | Behavior |
   | --- | --- | --- |
   | AI-assisted raw scans (Haiku) | **30/day**, 8 per 10 min | fails closed → on-device result + "Pick parallel" |
   | "Look closer" (Sonnet) | **3/day** | fails closed → "Pick it yourself" |
   | Slab and phone-settled scans | unlimited | no paid call |

   Worst case for one user per day: 30 × $0.0009 + 3 × $0.022 = **$0.093**. The global daily cap still wins.
5. **Kill switches:** `SCAN_AI_ENABLED` (server, default off) and `NEXT_PUBLIC_SCANNER` (whole feature).

Per-request ceilings:
- Images ≤ 1024 px long side and ≤ 400 KB (413 otherwise), at most 2 per call.
- `max_tokens` 800 (Haiku) or 1,200 (Sonnet).
- Thinking off.
- A 15 s timeout.
- No retries on the paid call, so a failure falls back to the phone-only result.
- One in-flight AI call per user.
- Retake cancels any pending call.

**Do the limits fit the budget?** Example month with 1,500 active scanners, each adding 25 raw cards, 60% needing Haiku, and 5% tapping Look closer:

| Calls | Cost |
| --- | --- |
| 22,500 Haiku × $0.0009 | $20.25 |
| 1,125 Sonnet × $0.022 | $24.75 |
| **Total** | **$45** |

That's over the $40 app-side ledger, so the ledger would shut off AI before month end. If the eval shows Haiku alone is good enough, we lower Look closer to 1/day. Either way **we can't spend more than $40 in the app, or $50 at the provider.**

When a cap trips, we show "Pick the parallel below" in the same sheet, with no error wall and no paywall.

Other services: Vercel function time and bandwidth for the AI route stay within the current plan (one short call, about 300 KB per AI scan). No Trawl calls in the scan flow. No new paid services beyond the one AI key.

---

## 6. What changes

### Web
| File | Change |
| --- | --- |
| `lib/scan/slab-label.ts` (+ test) | New. Parses PSA, BGS, SGC and CGC label OCR into grader, grade, qualifier, cert, year, set, player, # and variety. |
| `lib/scan/raw-text.ts` (+ test) | New. Pulls player (directory, OCR-tolerant), year, #, serial run, RC and set words from OCR lines. |
| `lib/scan/match.ts` (+ test) | New. `search_cards` queries + checklist parallels + ranking, top 3 with per-field confidence, and a "settled on the phone" check. |
| `lib/scan/ai-prompt.ts` (+ test) | New. Builds the constrained request (candidates + parallel list) and validates the JSON answer against the checklist. |
| `lib/scan/spend.ts` (+ test) | New. Monthly and daily ledgers, worst-case reservation, per-user buckets. |
| `lib/comps/rate-limit.ts`, `rate-limit-loop.ts` | Add the "consume N" variant and the scan buckets. Paid buckets fail closed. |
| `app/api/scan/identify/route.ts` (+ test) | New. Signed-in only, caps checked, Haiku or Sonnet call, catalog verification. Stores nothing. |
| `lib/capture.ts` | `saveScanMatch` / `takeScanMatch`, so grade and cert never go in the URL. |
| `components/card-form.tsx`, `lib/cards/new-card-draft.ts`, `lib/cards/add-flow.ts` | Fill the draft from a scan match and pick the start step. |
| `components/scan/confirm-sheet.tsx` (+ test) | New. "Is this your card?" with progressive fill and the parallel swatch picker. |
| `components/scan-view.tsx`, `app/(app)/scan/page.tsx` | Scan hub (native scanner or web path). |
| `components/card-photo-field.tsx` | Remove the fake "Sample match, not a real scan" state. |
| `lib/ios/native.ts` | `scanCard()`, `recognizePhoto()`, `scannerAvailable()`. |
| `lib/analytics.ts` | `scan_captured`, `scan_settled_on_device`, `scan_ai_used`, `scan_pick_rank`, `scan_look_closer`, `scan_capped`. Counts only. |
| `app/(app)/privacy/page.tsx` | Scanner line: read on the phone; raw-card photos may go to our AI provider to identify the card, and we keep no copy. |

New dependency: `@anthropic-ai/sdk` (server only, PR 11). Nothing else.

### iOS
- `ios-app/ios/App/App/SlabholdScanner.swift` is new: AVFoundation + Vision (rectangles, OCR), auto-capture gate, perspective crop and color sampling. Apple frameworks only.
- `SlabholdNativePlugin.swift` gains `scanCard`, `recognize` and `scannerAvailable`.
- `Info.plist` gets new camera copy: "Slabhold uses the camera to photograph and identify cards you add to your collection."
- **A new iOS build is needed.** Web PRs can merge first because they check for the plugin.

### SQL
- **None for launch.** Ledgers and limits reuse `anon_rate_limits` and `comps_rate_limits`, and `cards.cert_number` already exists.
- **Phase 2 only (image matching from confirmed scans):** a vector table for feature prints. It would be its own migration file with `-- UNAPPLIED. Needs review before running.` in a separate "CONTAINS SQL, needs review" PR, and we never run it.

---

## 7. PR breakdown

Every PR is test-first and passes `npm test`, `lint:ci` and `build`. UI PRs go through /unslop with 390 px screenshots. PRs 2–10 add no keys and no paid calls.

| # | PR | Type |
| --- | --- | --- |
| 1 | This plan | docs |
| 2 | Slab label parser + fixtures | web |
| 3 | Raw card text parser + fixtures | web |
| 4 | Matcher + checklist parallels + "settled on the phone" check | web |
| 5 | Scan match handoff + Add card prefill (grade and cert via sessionStorage) | web |
| 6 | Confirm sheet + all states + **1-tap parallel swatch strip and serial # entry**, behind `NEXT_PUBLIC_SCANNER`, with a fixture dev mode | web, UI |
| 7 | **One-tap "Yes, add it"**: save straight from the confirm sheet with the remembered visibility, plus "Edit details" | web, UI |
| 8 | **Post-scan payoff**: "Post your pull", owners and hunters count, cached value with recent sales and trend arrow (no new Trawl calls) | web, UI |
| 9 | `/scan` hub + web path + "Scan as many cards as you want." copy; remove the fake "Sample match" state | web, UI |
| 10 | Native scanner plugin + Info.plist copy | **iOS build** |
| 11 | *(Needs the key + your OK)* Spend ledgers, caps, kill switch + `/api/scan/identify` (Haiku) + the 100-photo eval, which **sets the accuracy bar result** | web |
| 12 | "Look closer" (Sonnet) + its daily limit | web, UI |
| 13 | Wire the native scanner into `/scan` and Add card, add analytics (save time, fix rate, posts, scans per session), update the privacy page | web |
| 14 | `CLAUDE.md`: take the scanner off hold | docs |
| post-launch 1 | **Learning from fixes**: unapplied migration for the fix-mapping table (text only, no photos), its own "CONTAINS SQL, needs review" PR | SQL |
| post-launch 2 | Learning from fixes: record fixes + matcher boost | web |
| post-launch 3 | **Batch scanning**: continuous capture + "Stack" review list | **iOS build 2** + web |
| later | Phase 2: image matching from confirmed scans (separate SQL PR) | SQL + web + iOS |

The scanner launches with slabs and phone-settled raw cards working even if PR 11 isn't approved. AI makes raw cards and parallels clearly better. PRs 6–9 make us win even where our accuracy only matches theirs.

---

## 8. Keys and accounts (none added yet)

| For | What's needed | Monthly cost |
| --- | --- | --- |
| On-device scanner | Nothing new. The existing Apple developer account ships the build. | $0 |
| AI step | **One Anthropic API key** (`ANTHROPIC_API_KEY` in Vercel env, server only) in its own workspace with a **$50/month spend limit** set in the console. | ≤ $50, held to $40 in the app |
| PSA cert API | **Not used** (paid only). The cert # comes from the label text. | $0 |
| Image embeddings | Not used. Phase 2 uses Apple's on-device feature prints. | $0 |

## Decisions
Decided:
- **Building starts with PR 2.** PR 1 is this plan.
- **Instant value is cached-only at launch.** No new Trawl calls per scan.
- **After launch, learning from fixes comes first,** then batch scanning.
- **Scan copy** says "Scan as many cards as you want." Scan copy has no pricing words.

Still open:
1. Approve the AI step (PRs 11–12): one Anthropic key, $50 console limit, $40 app ledger, 30 AI scans and 3 "Look closer" per user per day?
2. Did "Card Scanner Pro" mean a specific app? If so, we'll add it to section 1.
3. Is the optional back-of-card step OK?

---

## Sources
- CollX: [App Store](https://apps.apple.com/us/app/collx-sports-card-scanner/id1581164444?see-all=reviews), [Trustpilot](https://www.trustpilot.com/review/www.collx.com), [CollX Gold](https://collx.app/collx-gold), [TechCrunch](https://techcrunch.com/2025/03/07/collx-raises-10m-to-grow-its-card-collection-marketplace), [Cards AI review (competitor)](https://www.cardsaiapp.com/blog/collx-review), [CollX vs Ludex (competitor)](https://www.cardsaiapp.com/blog/collx-vs-ludex), [Postunreel review](https://postunreel.com/blog/collx-review-2026), [PreGrade guide](https://pregradecards.com/blog/scan-sports-cards-for-value-2026)
- Card Ladder: [pricing](https://www.cardladder.com/pricing), [Google Play](https://play.google.com/store/apps/details?id=com.ladderstudios.cardladder&hl=en_US), [App Store](https://apps.apple.com/us/app/card-ladder/id1541535971), [MWM listing and reviews](https://mwm.ai/apps/card-ladder/1541535971), [HobbyCardIndex](https://hobbycardindex.com/blog/best-sports-card-scanner-app)
- Scanner apps: [Cardstock](https://mwm.ai/apps/cardstock-sports-card-scanner/1508888618), [CardX reviews](https://apps.apple.com/us/app/cardx-sports-card-scanner/id6752771264?see-all=reviews&platform=iphone), [Sports Card Value Scanner Pro](https://apps.apple.com/us/app/sports-card-value-scanner-pro/id6746327993), [JustUseApp reviews](https://justuseapp.com/en/app/6760181919/sports-card-scanner-spoly/reviews)
- Ludex and Card Dealer Pro: [Ludex review (competitor)](https://www.cardsaiapp.com/blog/ludex-review), [JustUseApp Ludex](https://justuseapp.com/en/app/1616691213/ludex-scan-sports-cards-tcg/reviews), [Card Dealer Pro review](https://www.rorzcards.com/card-dealer-pro-review/), [CardLuma vs Card Dealer Pro](https://www.cardluma.com/cardluma_vs_carddealerpro.html)
- Pricing: Claude list prices (Anthropic, Nov 2026); [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing); [Voyage pricing](https://docs.voyageai.com/docs/pricing); [embedding price roundup](https://devtoollab.com/blog/best-embedding-models-apis)
- Apple Vision feature prints: [developer forum](https://developer.apple.com/forums/thread/732876), [overview](https://blakecrosley.com/blog/vision-framework-built-in)
