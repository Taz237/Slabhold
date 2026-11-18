# Scanner coverage plan

Written Nov 18, 2026, after three real scans from one collector all came back "not found". Goal: name nearly every sports card a collector scans, vintage to 2026, base, insert, parallel, numbered, auto, patch, raw or slabbed. The rule stays: open beats wrong. When we aren't sure we show choices, and the bake-off stays at 0 wrong.

This builds on `docs/scanner-plan.md` (how we scan and why) and `docs/scanner-audit.md` (the Nov 16 audit). It doesn't repeat them.

## Short version

- **The scanner reads text and looks cards up. It does not match pictures.** So a card is found only when (1) the phone reads the words, (2) our parser understands them, and (3) our data has the card. All three failed cards fell out at step 2 or 3, not at the camera.
- **Our data is deep in a few lines and empty in most.** 494 checklists, 387,314 cards. That is roughly 1 to 2% of the sports cards that exist (see section 3). But most of what's missing is inserts and parallels of products we don't carry at all, and the back of a modern card prints its own year, product and card #. **Reading the back well gets us further than any dataset we could buy.**
- **The biggest single win is cheap:** trust the back's own product line ("2023 PANINI - ILLUSIONS FOOTBALL") even when we've never heard of the product. Shipped in this PR.
- **The honest ceiling for text alone is about 85 to 90% of real scans.** The rest are raw, unnumbered parallels that print no word (Silver vs Base), and fronts with no text at all. Getting to 95% needs either a look at the picture or a learned memory of what collectors confirm. Section 6 lays that out in PR-sized steps, and nothing in it costs money until step 6.

## 1. The pipeline, and where cards fall out

| Step | What happens | Where | How a card falls out here |
| --- | --- | --- | --- |
| 1. Capture | Native iOS camera, tap to take, front then back when the front prints no card #. | `ios-app/ios/App/App/CardScannerViewController.swift` | The back is skipped (one-touch, toploader, in a hurry). Then only the front's words exist. |
| 2. Reading | Apple Vision reads the text on the phone, plus border color and sheen. | `CardTextReader.swift`, `lib/ios/scanner.ts` | Foil, glare, stylised type, text printed sideways (a serial up the edge). |
| 3. Parsing | Lines become a read: player, year, set, card #, serial, auto, rookie, insert, parallel words. | `lib/scan/raw-text.ts`, `lib/scan/slab-label.ts`, `lib/scan/session.ts` | **A set that isn't on our list of 60 names reads as no set.** A bio word reads as an insert. No patch signal existed. |
| 4. Lookup | Catalog search (2 calls), cached sold titles, the checklist for the year and set read, the parallel list. | `lib/scan/match.ts` (`matchScan`), `lib/cards/checklist-load.ts`, `lib/cards/product-data.ts` | No checklist for the product. No parallel list, or one with no print runs. A checklist is only loaded once a year **and** a set are read. |
| 5. Ranking | Candidates are scored, the parallel is picked, anything the back contradicts is dropped. | `lib/scan/match.ts` (`rankScanMatches`, `pickParallel`) | **With only a player read, no candidate is built at all**, so there is nothing to show. |
| 6. Live solds | One capped sold search re-ranks and fills what's open. | `lib/scan/live-solds.ts` | No search runs with nothing to search by. |
| 7. Reveal | The reveal, "Pick your card", the price screen, Add. | `components/scan/*` | **"We couldn't find this one yet" was a dead end:** one button to type the card in by hand. |

Every "not found" is one of four things: nothing read (step 2), read but not understood (step 3), understood but not in our data (step 4), or only a name with nothing to rank (step 5). Until this PR we could not see which, because **misses were not logged anywhere.**

## 2. The three cards from Nov 17

| Card | What the photo prints | Where it fell out | Fix (this PR) |
| --- | --- | --- | --- |
| 1985-86 Topps Mario Lemieux #9, front only | "MARIO LEMIEUX", "C". No year, no set, no card #. The team is a logo. | Step 5. The checklist has him at #9, but nothing was looked up with only a name. | His real cards are offered to pick from, the two 1985-86 #9 cards first. One tap and the scan is read as that card. |
| 2023 Select Mike Evans #389 Field Level 07/25 | Everything, on the back. | Step 3. The bio says "a natural instinct" and that was read as the **Instinct insert**, so the card became an insert it isn't. Then step 5: /25 fits 11 parallels across Select's five tiers. | A bio word is never an insert. Only the card's own tier counts, so /25 is the Field Level Tie-Dye Prizm. |
| 2023 Illusions Sam LaPorta First Impressions #131, RPA 03/10 | Everything, on the back. | Step 3. "Illusions" wasn't on our set list, so "2023 PANINI - ILLUSIONS FOOTBALL" named no set. Step 4: no checklist. | The back's product line names the set. Illusions checklist added. The memorabilia notice is a patch signal. |

One honest limit on the Lemieux: the 1985-86 Topps and the 1985-86 O-Pee-Chee share that exact front. They differ on the back. From the front alone nobody can say which it is, so we show both and the collector taps theirs. A photo of the back settles it without a tap.

## 3. Coverage: what we have against what exists

**Checklists** (`lib/cards/data/checklists/`, 494 files, 387,314 cards):

| Sport | Before 1980 | 1980 to 1993 | 1994 to 2011 | 2012 to 2018 | 2019 to 2026 | Product lines, 2019 on |
| --- | --- | --- | --- | --- | --- | --- |
| Baseball | 33 files | 32 | 27 | 65 | 83 | 16 |
| Football | 19 | 10 | **0** | 17 | 62 | 17 |
| Basketball | 9 | 3 | 2 | 18 | 57 | 14 |
| Hockey | 28 | 18 | 1 | 8 | **2** | **1** (Upper Deck) |
| Soccer | 0 | 0 | 0 | 0 | 0 | **0** |

**Parallel lists:** 58 products, 5,224 parallel rows, 3,529 of them with a print run. Panini lines from the maker's own files, Topps lines from Topps sheets with runs filled from hobby lists.

**Against what exists.** The Trading Card Database's own counts (from search snippets, about two years old, not re-checked on the live site) put baseball, football, basketball and hockey together near 24 million card records, counting every parallel as its own record. Our 387,314 base-and-insert rows plus parallel lists cover roughly 1 to 2% of that by count. By what collectors actually scan it is far better than that sounds, because scans cluster on flagship products and recent years, but we have no measured number yet. The miss log in this PR gives us one.

**The biggest holes, in the order they hurt:**

1. **Every product we don't carry.** Panini alone released more than 30 products a year in basketball and about as many in football (one 2023 count). We carry 14 to 17 lines per sport. Illusions, Phoenix, Absolute, Certified, Zenith, Origins, Obsidian, Spectra, National Treasures, Immaculate, Flawless, Contenders Optic, Donruss Elite, Chronicles and more have nothing. Until this PR their set name didn't even read.
2. **Inserts, autographs and relics.** Checklists carry their sections, but an auto or relic section never named the card. Patch cards had no signal at all.
3. **1994 to 2011, all sports.** 30 files across 18 years. Football has none. This is the junk wax tail, the insert boom and the first chrome and refractor years.
4. **Modern hockey.** Two Upper Deck files since 2019. No O-Pee-Chee, SP Authentic, The Cup, Artifacts, Synergy, MVP.
5. **Soccer.** Nothing.
6. **Vintage fronts.** We have good vintage checklists (hockey 1954 to 1990, baseball 1948 on), but a vintage front prints only a name, and nothing used the checklist without a year and set.
7. **Parallels with no print run loaded, and parallels that print no word.** Unchanged from the audit: text can't tell a raw Silver from a raw Base.

## 4. Every realistic way to get the data and the match

Researched Nov 18, 2026. Most sites blocked direct fetches from our build machine, so prices and terms marked "snippet" come from search results of the named page and **must be re-checked on the live page before we rely on them.**

| # | Way | Coverage | Cost | Terms risk | Effort | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Read the back properly** (product line, card #, © year, serial, tier, auto and relic notices) | Every modern card that prints its product line, whether we carry it or not. About 2000 on for most makers. | $0 | None. It's the collector's own card. | Small | **Do first. Started in this PR.** |
| 2 | **Learn from confirmations.** Save what a collector picks or types for a read; show it first to the next scan that reads the same. | Grows with use. Fills exactly the cards our users own. | $0 | None. Our own users' input, text only. | Small, plus one SQL table | **Do now. Shipped here (SQL unapplied).** |
| 3 | **Maker checklists.** Panini's checklist page (live, searchable by sport, year, brand; our Select and Prizm files came from it). Topps product pages with a "Download checklist" button. Upper Deck: no download page found. | Panini and Topps, recent years, with parallels and print runs. How far back: not verified. | $0 | Low. Published by the maker for collectors. Terms not read. | Medium: one import per product. The import script exists. | **Do next, in bulk.** |
| 4 | **Hobby checklist pages** (Cardboard Connection, Checklist Insider, already used with the source logged per file) | Most products, most years. Parallels and runs on Checklist Insider. | $0 | Low to medium. Open public pages, read one page per product, slowly, source logged. Terms not read; no bulk scraping. | Medium | **Keep using, product by product.** |
| 5 | **Sold titles we already have** (Trawl cache) | Whatever has sold and been looked up. Names set, card #, parallel and run the way sellers write them. | $0 for the cache. New searches cost credits. | Low for what we already do. eBay's API license bars redistributing its data and reportedly bars using it to train models (snippet), so we don't build a catalog out of eBay data. | None (exists) | **Keep as a tie-breaker. No new calls.** |
| 6 | **On-device picture match from confirmed scans.** Apple's image feature print of the cropped front, stored against the card a collector confirmed, matched on the phone. | The cards our users confirm. Solves fronts with no text and look-alike parallels over time. | $0 on the phone. A vector table in Supabase (pgvector, no separate fee). | Low: the collector's own photo, and only a number list is stored. Needs a privacy line. | Large: Swift + SQL. The print's revision must be pinned. | **After 1 to 5. Needs an Xcode build.** |
| 7 | **A small vision model on scans text can't settle**, forced to pick from the set's real parallel list | Raw unnumbered parallels, stylised fronts. | About $0.0005 to $0.001 a scan (from `docs/scanner-plan.md`). | Low. The photo leaves the phone, which needs saying. | Medium | **On hold since Nov 16. Ask Donnie before any spend.** |
| 8 | **Paid identification APIs.** CardSight: 750 calls a month at no charge, $14.95 for 5,000, $199.95 for 100,000 (press releases). Ximilar: about $5 to $6 per 1,000 sports cards (third-party figures). Card Hedger: from $0.01 a call or $49 a month (its API page). | Claims of 2M to 16M cards. Not verified. | $15 to $550 a month at our scale | Medium. We'd depend on them, and their terms weren't readable. | Small to medium | **Not now. Worth one measured trial on our hard-cards set later, with Donnie's OK.** |
| 9 | **SportsCardsPro / PriceCharting API and CSV** | Broad, priced. | Paid subscription (third parties say about $49 a month, not verified). | **High.** Its license is for internal use; showing the data inside an app needs a commercial license and written permission, and data must be purged when the subscription ends (snippet). | n/a | **No, unless we buy a commercial license.** |
| 10 | **Trading Card Database** | The largest: about 36M records in all, about 24M in our four sports. | No API found. | **High.** Its terms bar "data mining, robots, screen scraping" (snippet). | n/a | **No.** |
| 11 | **Beckett** | Very large, priced. | No API or licensing program found. Site blocks automated reads. | High. | n/a | **No.** |
| 12 | **Open datasets** (Hugging Face `GotThatData/sports-cards`, `junkwaxdata/cardlists` on GitHub, a few small image sets) | Small. Nothing near catalog scale. | $0 | Mixed. One says MIT but adds commercial limits. | Small | **Not worth it.** |
| 13 | **PSA cert lookup** | Slabs only. | Decided against on Nov 16 (paid). | n/a | n/a | **No. Not used.** |

**Ranked: 1, 2, 3, 4, 6, then 7 or 8 only if the numbers say we need them.** The first four cost nothing, carry no terms risk worth worrying about, and compound: the back names the card, the checklist confirms it, and a confirmation teaches the next scan.

Why not just buy a database: the two that are big enough either forbid it (TCDB, Beckett) or allow internal use only (SportsCardsPro). And a database doesn't fix reading. All three failed cards were in reach of data we had or could add in a minute.

## 5. What "95% correct" means, and how we'll measure it

We count a scan as correct when the card shown is the right player, year, set and card #, and its parallel is either right or left open with the right one among the choices. A wrong field shown as fact is the only failure that counts double.

Today we measure on fixtures (the bake-off: 1,134 fields at 0 wrong; the hard-cards set: 115 cards at 0 wrong). We have never measured on real scans. From this PR on, every scan that doesn't end on a card with its year, set and card # is logged with what we read, what we searched and why. Once the SQL is applied, `scan_miss_weekly` shows misses by reason, sport, year and set. Until then the same line is in the server log as `[scan-miss]`.

The target, on real scans: **95% end on the right card within one tap, and under 1% show a wrong field.**

## 6. The plan, in PR-sized steps

| # | PR | What it does | Expect | Needs |
| --- | --- | --- | --- | --- |
| 1 | **This PR** | The three cards. The back's product line names the set. Tiers. Patch signal. Never a dead end. Miss log. Saved confirmations. | The three cards right. Every miss visible. | Web only. SQL file to review. |
| 2 | **Any product, from its back.** Printed product names that our list would bend into another set ("DONRUSS ELITE" is not Donruss, "CONTENDERS OPTIC" is not Contenders). Insert and subset titles printed on both sides. Serials printed sideways. Add card accepts the printed set as typed. | Every modern card with a product line names its set, carried or not. The largest single jump. | Web only. Fixtures from the miss log. |
| 3 | **Checklists in bulk, driven by the miss log.** Import the 40 most-missed products from maker files and hobby pages: the Panini lines we lack, modern hockey, 1994 to 2011, soccer. Rebuild the player-cards list. | Card #, player, insert name and print runs for what people actually scan. | Web only. No cost. One page per product, sources logged. |
| 4 | **Confirmations everywhere.** Save what a collector types in "Add it step by step" after a miss, and what they change on the sheet (another row, another parallel). Show a confirmed parallel first in "Which version?". Never auto-picked: two collectors must agree before it leads. | The scanner gets better every day without us. | Web only. Same tables. |
| 5 | **Vintage fronts.** Use what a front does print (position, team name, the year in a © on some fronts) and the checklist's team to narrow the pick list, and ask for the back first when the list is long. | Vintage front-only scans land on 1 to 3 choices. | Web only. |
| 6 | **Picture memory on the phone.** Feature print of each confirmed front; the next scan of that card matches with no text. | Fronts with no text and look-alike parallels, growing with use. | **Xcode build.** SQL (vector table). Privacy line. |
| 7 | **Only if steps 1 to 6 leave us under 95%:** a measured trial of the small vision model or one paid API on the hard-cards set and a week of logged misses. | A number, then a decision. | **Donnie's OK first.** Under $5 for the trial. |

## 7. What this PR does not do

- It doesn't look at the picture. A raw, unnumbered parallel that prints no word still asks "Which version?".
- It saves a confirmation only for a card picked from the closest choices and then added. Typing a card in by hand after a miss isn't saved yet (step 4).
- The LaPorta's /10 parallel has no name: no list we have names it, so the version stays open with the run shown. Naming it needs a parallel list for Illusions (step 3).
- It changes nothing in the iOS app. If the phone doesn't read the sideways "03/10" on the LaPorta, the card is still the right patch auto with the run open.
