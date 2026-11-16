# Scanner and Quick Comp audit

Written Nov 16, 2026. Goal: name the exact card (player, year, set, card #, parallel, print run, grade) every time, or show the closest matches and let the collector pick. Open beats wrong.

This PR ships fix C (Quick Comp version picker and stricter sold matching). The rest is the ranked plan in section 7.

## Short version

- **The scanner reads text only.** Apple Vision on the phone reads the words on the card or the slab label. Nothing looks at the picture itself, so an unnumbered parallel that prints no word (Refractor, X-Fractor, Silver) looks the same as Base on a raw card.
- **Slabs depend on one small label line.** If the variety line ("X-FRACTOR") reads, we get it right. If it doesn't, the slab is saved as **Base, marked sure**, with only a "Base" chip to pick. This is the Jaxson Dart miss.
- **Quick Comp had no way to pick a parallel**, and its Base filter didn't know most Chrome parallel words. X-Fractor, Sepia, Aqua, Raywave, Superfractor and more were priced as Base. Fixed here.
- **Checklist data is thin where the misses are.** We have nothing for Topps Chrome Football, and no parallel list for college/NIL Prizm.
- The bake-off stays at **0 wrong** before and after.

## 1. The pipeline, end to end

| Step | What happens | Where |
| --- | --- | --- |
| Capture | Native iOS camera. Tap to take, never on its own. A raw card with no card # on the front asks for the back. Slabs never ask for the back. No web reader. | `ios-app/ios/App/App/CardScannerViewController.swift` |
| Reading | Apple Vision text on the phone. Also: straightening, a bigger re-read of the label strip, serial re-reads, the cert barcode, and the average color of the border (raw cards only). | `CardTextReader.swift` |
| Slab or raw | A tall narrow rectangle is a slab. The label is parsed for grader, grade, cert, year, set, card #, player, serial and "variety" (the leftover words). | `lib/scan/session.ts`, `lib/scan/slab-label.ts` |
| Identify | The printed text wins. The checklist and sold titles only fill fields that are still open. Top 3 candidates are kept. | `lib/scan/match.ts` (`rankScanMatches`) |
| Checklist lookup | 400 bundled checklist files, one per product and year. Parallel lists come from two JSON files, else a short per-set family list. | `lib/cards/data/`, `lib/cards/checklist-load.ts`, `lib/cards/product-data.ts`, `lib/cards/parallels.ts` |
| Parallel | Slab: the label's variety words matched to the set's list. Raw: an insert name, the only parallel at the read print run, a printed color word, then the majority of sold titles (numbered, auto or subset cards only). | `lib/scan/match.ts` (`pickParallel`) |
| Live solds | After the first answer, sold titles re-rank and can name a parallel only when it is still open. | `lib/scan/live-solds.ts` |
| Confirm | Top match, a strip of parallel chips with color dots, up to 2 "Or one of these". | `components/scan/confirm-sheet.tsx` |
| Quick Comp | One sold search per card, version and grade. Titles are filtered by player, year, set, card #, parallel, print run and grade, then price outliers are dropped. | `lib/quick-comp/lookup.ts`, `lib/comps/match.ts` |

There is no image matching, no cert lookup and no paid vision call anywhere in the code. The scanner flag (`NEXT_PUBLIC_SCANNER`) stays on.

## 2. Bake-off results and what each open is

| Set | Before | After |
| --- | --- | --- |
| Bake-off, all fixtures | 1020 right, 96 open, **0 wrong** | same |
| Bake-off, with the checklist | 1045 right, 71 open, **0 wrong** | same |
| Bake-off, with live solds | 161 right, 1 open, **0 wrong** | same |
| Hard cards, the scan alone | 410 right, 40 open, **0 wrong** (75 cards) | 416 right, 40 open, **0 wrong** (76 cards) |
| Hard cards, with sold titles | 416 right, 34 open, **0 wrong** (75 cards) | 422 right, 34 open, **0 wrong** (76 cards) |

The scanner's own results don't move in this PR: the change is in Quick Comp's sold matching. The extra card is the Dart slab (hc-076).

Why the opens are open (hard cards, with sold titles, 34 fields):

| Field | Open | Step that stops | Why |
| --- | --- | --- | --- |
| Parallel | 19 | Parallel detection | An unnumbered parallel that prints no word (Silver, X-Fractor, Sepia, Snakeskin, Tiger Stripe, Holo Foil, image variations). Text can't see it, and we don't let sold titles flip an unnumbered card. Or a numbered one where two parallels share the run (Orange Pulsar and Purple Pulsar are both /175). |
| Print run | 7 | Reading | The serial stamp didn't read (foil, glare), so there is no run to match. |
| Set | 5 | Checklist | 2025-26 Bowman U Best (4 cards) and Topps Resurgence (1): the card prints a logo, not the set name, and we have no checklist to name it. |
| Card # | 2 | Reading | Insert codes (SS-18, C-43) that didn't read off the back. |
| Year | 1 | Reading | Topps Resurgence prints only a © year. |

The real misses:

- **Jaxson Dart 2025 Topps Chrome #306 X-Fractor PSA 10, shown as "#306 Base".** Two separate failures.
  1. *Scanner.* When the label's variety line reads, we get X-Fractor (hc-076, right). When that line is missed, the slab becomes Base, marked sure. A base PSA label prints no variety line, so text alone can't tell "no line" from "line not read". Fix B.
  2. *Quick Comp.* Base PSA 10 kept X-Fractor sales, because "X-Fractor", "Xfractor" and "X Fractor" were not in the parallel word list. The photo is picked from the kept sales, so it was an X-Fractor slab. **Fixed in this PR.**
- **LaBaron Philon 2025-26 Prizm #103 Orange Pulsar /175** (hc-001). Raw scan: right on everything, parallel open until sold titles name it (Orange Pulsar and Purple Pulsar share /175). Found while auditing: as a **slab** whose label reads "ORANGE PULSAR PRIZM" with the year read as 2025, we answer "Orange", marked sure, because the list we fall back to has Orange but no Orange Pulsar. That is a wrong answer waiting to happen. Fix A.

## 3. How we tell parallels apart today

| Signal | Used? | Notes |
| --- | --- | --- |
| Slab label variety line | Yes | Works for full words. No abbreviation map ("REF.", "GLD REF", "SLV"). "XFRACTOR" as one word isn't matched to the list. A partial match is marked sure ("Orange Pulsar" becomes "Orange"). No words read means Base, sure. |
| Serial number (/175) | Yes | Names the parallel only when exactly one parallel in the checklist has that run for that card. |
| Border color | Barely | An average of the border, raw cards only, used only to break a tie between sold-title colors. Never on slabs. |
| Checklist parallel list | Yes | Only for products we have. Most Topps rows have no print runs loaded. |
| Sold titles | Yes, limited | Can name a parallel for numbered, auto or subset cards. Never flips an unnumbered card, and never on a slab. |
| The picture (refractor shine, pattern) | No | Nothing looks at the image. |

## 4. Checklists: what's missing

Checklists are bundled files (400). Parallels are in `topps-parallels.json` (10 products) and `panini-parallels.json` (33 products), each row a name and a print run.

| Line | 2023 | 2024 | 2025 | 2026 |
| --- | --- | --- | --- | --- |
| Topps Chrome Baseball | cards + runs | cards, names only | cards, names only | missing |
| **Topps Chrome Football** | missing | missing | **missing** | missing |
| Topps Chrome Basketball | missing | names only | cards, names only | missing |
| Topps flagship | cards | missing | Update names only | Series 1 cards |
| Bowman / Bowman Chrome | cards | cards (+runs for Bowman) | cards, names only | missing |
| Bowman U Chrome (NIL) | cards | cards | cards (football) | missing |
| Prizm Football | cards | cards + runs | cards + runs | missing |
| Prizm Basketball | runs only | cards + runs | cards + runs | missing |
| **Prizm Draft Picks / Prizm NIL** | cards, no parallels | missing | **missing** | missing |
| Select, Donruss Optic | runs, no cards | runs, no cards | runs (football), no cards | missing |
| Mosaic, Donruss | football cards + runs | runs, no cards | runs (football), no cards | missing |
| Upper Deck Hockey | missing | cards | cards | missing |
| Finest, Topps Now, Cosmic Chrome, Stadium Club | Finest cards only | missing | missing | missing |

Biggest gaps:

1. **Topps Chrome Football has nothing**, so the Dart card leans on a generic Chrome list.
2. **Print runs for most Topps and Bowman parallels aren't loaded.** 24 files in `scripts/checklist-csv/*.parallels.json` already have them (2025 Topps Chrome Baseball: 164 of 173 numbered) but the app doesn't read them. No new data needed, just loading.
3. **College/NIL Prizm has no parallel list**, so a Philon slab falls back to the wrong list.
4. Nothing marks which unnumbered parallels look like Base. An empty print run means both "unnumbered" and "we don't know".

## 5. Comps: every way sales got mixed

A sold listing is matched by its title: player, year, set, card #, then a parallel word check, a print run check and a grade check.

Ways a **Base comp pulled a parallel sale** (before this PR):

| # | Leak | Status |
| --- | --- | --- |
| 1 | "X-Fractor", "Xfractor", "X Fractor" weren't parallel words | Fixed |
| 2 | Chrome words missing from the list: Prism, Sepia, Aqua, Yellow, Teal, Bronze, Magenta, Fuchsia, Atomic, Speckle, Raywave, Lava, Mini Diamond, Geometric, Negative, Superfractor, Logofractor, Sapphire | Fixed |
| 3 | Panini words missing: Fast Break, Reactive, Stained Glass, Shock, Elephant, Tri-Color, Genesis | Fixed |
| 4 | Quick Comp had no version picker, so a typed card was always Base | Fixed |
| 5 | A parallel the seller didn't name (an X-Fractor listed as just "#306 PSA 10") | Can't be fixed from titles. The outlier filter catches some. See option 3 in section 7. |
| 6 | A parallel word we still don't know (new products each year) | Open. Fix E loads each set's real list into the filter. |

Ways a **parallel comp lost or mixed sales**:

| # | Problem | Status |
| --- | --- | --- |
| 7 | "#306 X-Fractor" was read as a "306 x" lot and thrown out, so an X-Fractor card lost most of its real sales | Fixed |
| 8 | Refractor kept "Prism Refractor" sales | Fixed |
| 9 | "Gold" didn't keep "Gold Refractor" titles, and "Gold Refractor" didn't keep "Gold" | Fixed |
| 10 | A Red card kept a base title that only said "Red Sox"; a Green card kept "Green Bay" | Fixed |
| 11 | Base dropped every "Green Bay", "Red Sox", "White Sox", "Blue Jays", "Red Wings", "Blue Jackets" title (fewer comps, not wrong ones) | Fixed |
| 12 | Quick Comp never sent a print run, so a numbered pick (/175) matched nothing | Fixed |

Grades:

| # | Case | Status |
| --- | --- | --- |
| 13 | PSA 10 keeps only sales whose grader and grade both match. Raw drops anything with a grader, "graded", "slab" or "Gem Mint". | Already right |
| 14 | A graded sale whose title and details both leave the grade out is dropped (fewer comps) | Fine: open beats wrong |
| 15 | Half grades and qualifiers (PSA 9 OC) are matched as their own grade | Already right |
| 16 | A seller's wrong title (says PSA 10, slab is a 9) | Can't be fixed from titles |

## 6. Card Ladder Pro and CollX, from public info

We couldn't test either app here. This is from their store pages and reviews, so treat it as claims.

| | Card Ladder Pro | CollX | Slabhold today |
| --- | --- | --- | --- |
| Exact parallel selection | Sales are filed under one exact card and parallel, so you pick the parallel and see only its sales | Picture match, then you fix the variation by hand. Reviews say parallels are the weak spot. | Scanner: label words, print run, sold titles. Quick Comp: **version picker, new in this PR.** |
| Cert lookup | Add a slab by cert number (PSA, SGC, CGC listed on its store page) | Not found | Cert is read off the barcode but never looked up |
| Population data | Yes, in Pro | Not found | None |
| Sales filtering | All-time sales across marketplaces, by grade | Values with the sales not shown (a common complaint) | Recent sold prices via Trawl, 90 days, shown sale by sale, filtered by version and grade |
| Price | $19.99/month or $199.99/year | Pro $10/month | No paywall |

What they do that we don't: a card database where every parallel is its own record, cert lookup, population counts, and (CollX) matching on the picture. What we do that they don't: show every sale behind the number, and leave a field open when we aren't sure.

## 7. Ranked plan

Ranked by how many real scans each fixes against the work it takes.

| Rank | Fix | Fixes | Effort | Needs |
| --- | --- | --- | --- | --- |
| 1 | **C. Quick Comp version picker and stricter sold matching** | Every Base comp that mixed in a parallel; every parallel comp | Small | **This PR.** Web only |
| 2 | **B. Never silently Base.** When a slab or raw card is in a set with look-alike unnumbered parallels and nothing named the parallel, show "Which version?" with the 3 to 5 closest (Base, Refractor, X-Fractor…) and a sold photo for each, in place of a sure Base | The Dart scan, and most of the 19 open parallels become one tap | Medium | Web only. A product call: a clean base slab would take one more tap. |
| 3 | **A. Slab label hardening.** Abbreviations (REF, GLD, SLV, XFRACTOR), no "sure" on a partial match (Orange Pulsar is not Orange), variety words that got swallowed by the player line | Slabs with short or unusual variety lines; the Philon slab case | Small to medium | Web only |
| 4 | **E. Load the print runs we already have** (24 files) and use each set's real parallel list in the sold filter | Numbered Topps and Bowman parallels named from the serial; closes leak 6 | Small | Web only. No new data |
| 5 | **D. Hard-cards script.** One command to add a miss, plus the Dart "variety line missed" and Philon slab fixtures (they need B and A to pass) | Keeps every reported miss in the bake-off | Small | Web only |
| 6 | **F. Missing checklists**: Topps Chrome Football 2024-25, Prizm NIL 2025-26, Select, Optic, Mosaic 2024-25 | Card # and player lookups for those sets | Medium, per set | Public checklists, no cost |
| 7 | **G. PSA cert lookup** | Every PSA slab exact, including the parallel, whatever the label read | Small | See options below. Needs Donnie's OK |
| 8 | **H. A look at the picture** for raw unnumbered parallels | The raw cards text can't settle | Large | Paid. Needs Donnie's OK |

### Options that cost money or need an account (not built, for Donnie to decide)

1. **PSA cert lookup (PSA Public API).** PSA's own docs say an account gets 100 lookups a day at no charge. More than that is a paid plan and PSA doesn't publish the price (you email them). A cert lookup returns the exact card and variety PSA graded, so it would settle every PSA slab. It needs a PSA account and a token kept as a server secret. The older `docs/scanner-plan.md` called this "paid only"; PSA's docs now say otherwise. Recommended first, cached per cert so a slab is only ever looked up once.
2. **A vision model on unsettled raw cards only** (from `docs/scanner-plan.md`): about $0.0005 to $0.001 per scan on the small model, so $50 covers roughly 55,000 to 100,000 scans. It must pick from the set's real parallel list or answer "not sure". Only worth it after fixes A, B and E, when we can see what's still open.
3. **More Trawl usage.** The version picker makes one sold lookup per version a collector opens (same cost as changing the grade: 2 credits on a miss, shared cache for 6 hours, inside the existing 10 a day cap). No new kind of call. Raising the caps or searching more pages would cost more and is not proposed.

No SQL in this PR. Fixes A to F need none. A cert cache for G would need one small table: that would come as one unapplied migration file under "SQL for QA review" in its own PR.
