# Where the parallel lists come from

Each product row in `panini-parallels.json` and `topps-parallels.json` names its own source in its
`source` field. `official: true` means the maker's own checklist or odds sheet.

## Rows from a hobby checklist page

| Product | Source | Read |
| --- | --- | --- |
| 2024 Bowman Baseball (base, Paper Prospects BP-, Chrome Prospects BCP-) | Cardboard Connection: https://www.cardboardconnection.com/2024-bowman-baseball-cards | 2026-11-13 |

Notes on 2024 Bowman:

- Only parallels the page lists with a print run (or as unnumbered) are in the file. The page says
  hobby-only details were never added, so anything it does not list is left out, not guessed:
  for one, no Orange, Black or Superfractor row for Chrome Prospects.
- Insert refractors and the autograph parallels are not in the file. Their card numbers match no
  row, so the scanner leaves their parallel open.
- Paper rows are for plain numbers and BP- numbers. Chrome rows are for BCP- numbers. A print run
  two rows share (paper /150, chrome /199) stays open with both as choices.

## Print runs filled from the hobby lists

The Topps sheets name the parallels but not their print runs. `scripts/merge-print-runs.ts` fills
the runs from the hobby-checklist lists already in `scripts/checklist-csv/*.parallels.json` (each
names its page). A row filled this way has a `runsFrom` field with that page. Nothing is fetched.

- A run is filled only when the hobby list agrees on exactly one run for that name, in the
  matching base list (never an insert, autograph or variation list). Nothing is overwritten.
- When the lists disagree, or one name would get two runs in two subsets, the run stays unknown.
- The hobby list's numbered parallels the sheet lacks are added, so a run two parallels share
  (Gold and Gold Wave, both /50) stays two choices.
- Rows that already had runs (2023 Topps Chrome, 2024 Bowman) are left as they are, and so are
  rows with no hobby list in the repo (2024-25 Topps Chrome Basketball, 2025 Topps Update).
- Topps products with a hobby list and no list of ours get one, from the hobby list's base subsets
  only, marked `official: false` with the page as `source`: 2024-25 and 2024/2025 Bowman U Chrome,
  2025-26 Bowman Basketball, 2025 Bowman Chrome Sapphire, 2025 Bowman Draft, 2025 Topps Chrome
  Sapphire, 2025 Topps Chrome Update and 2026 Topps.
- 2025 Bowman gets the paper (plain numbers and BP-) and chrome (BCP-) card-number split our 2024
  Bowman list has, so a BP- card's run is read against the paper parallels only.

Run `npx tsx scripts/merge-print-runs.ts --dry-run` to see what it fills, adds and leaves unknown.

# Where the checklists come from (card #, player, team)

`checklists/` holds one file per product and year: every card number, the player on it and the
team. The scanner uses it to look the player up once it has read the year, set and card # off a
card (`lib/scan/player-lookup.ts`). It never guesses: see "How the scanner uses it" below.

`checklists/index.json` is the log. Every file has a row there with its **source** (the page it was
read from, or the maker's file name) and the **day it was read**. Nothing is in the store without
a row.

## Adding a set

Run the import script. Nothing is typed in by hand.

```
npx tsx scripts/import-checklist.ts --sport Football --year 2023 --product "Panini Prizm" \
  --from https://www.cardboardconnection.com/2023-panini-prizm-football-nfl-cards
```

- `--from` is a checklist page (a URL or a saved `.html` file), or the maker's own checklist CSV
  (a `.csv` file: Panini's download from paniniamerica.net/checklist.html works as it comes).
- `--product` is the set name the way Add card spells it ("Panini Prizm", "Bowman Chrome").
- `--add` adds to a file instead of replacing it (Topps Series 2 on top of Series 1: both are "Topps").
- To add many, put a row per product in `scripts/checklist-sources.json` and run
  `npx tsx scripts/import-checklist.ts --all`. Only products not in the store yet are read.
  `--all --refresh` reads every one again.

The script waits between pages, skips a page with no checklist on it, and reports each product as
added, skipped or failed.

## What is in the store today

107 products, 115,310 cards. `index.json` has each one's source and the day it was read.

| Sport | Product | Years |
| --- | --- | --- |
| Baseball | Bowman | 2019, 2020, 2021, 2022, 2023, 2024, 2025 |
| Baseball | Bowman Chrome | 2019, 2020, 2021, 2022, 2024, 2025 |
| Baseball | Bowman Chrome Sapphire | 2025 |
| Baseball | Bowman Draft | 2019, 2020, 2021, 2022, 2023, 2025 |
| Baseball | Topps | 2019, 2020, 2021, 2022, 2023, 2026 |
| Baseball | Topps Chrome | 2019, 2020, 2021, 2022, 2023, 2024, 2025 |
| Baseball | Topps Chrome Sapphire | 2025 |
| Baseball | Topps Chrome Update | 2025 |
| Baseball | Topps Chrome Update Sapphire | 2020, 2021, 2025 |
| Baseball | Topps Finest | 2019, 2021, 2022, 2023 |
| Baseball | Topps Update | 2019, 2020, 2021, 2022, 2023 |
| Basketball | Bowman | 2025-26 |
| Basketball | Bowman U Best | 2025-26 |
| Basketball | Bowman U Chrome | 2023-24, 2024-25 |
| Basketball | Donruss Optic | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Panini Donruss | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Panini Mosaic | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Panini Prizm | 2019-20, 2020-21, 2021-22, 2022-23, 2024-25, 2025-26 |
| Basketball | Panini Select | 2019-20, 2020-21, 2021-22, 2022-23, 2025-26 |
| Basketball | Prizm Draft Picks | 2019-20, 2020-21, 2021-22, 2022-23, 2023-24 |
| Basketball | Topps Chrome | 2025-26 |
| Football | Bowman U Best | 2025 |
| Football | Bowman U Chrome | 2023, 2024, 2025 |
| Football | Donruss Optic | 2019, 2020, 2021, 2022, 2025 |
| Football | Panini Donruss | 2019, 2020, 2021, 2022, 2023 |
| Football | Panini Mosaic | 2020, 2021, 2022, 2023, 2025 |
| Football | Panini Prizm | 2019, 2020, 2021, 2022, 2023, 2024, 2025 |
| Football | Panini Select | 2019, 2020, 2021, 2022, 2025 |
| Football | Topps Chrome | 2025 |
| Football | Topps Resurgence | 2025 |
| Football | Prizm Draft Picks | 2019, 2020, 2021 |
| Hockey | Upper Deck | 2024-25, 2025-26 |

Products through 2023 were read from Cardboard Connection's product pages (2026-11-14), the same
source as the 2024 Bowman parallels above. Its 2024 and later pages are reviews with no player
list.

The 22 products from 2024 on, and Upper Deck hockey, were read from Checklist Insider pages on
2026-11-13 and saved as CSVs in `scripts/checklist-csv/` (one per page, 24 in all: Upper Deck
Series 1 and Series 2 are one product). `scripts/checklist-csv/SOURCES.md` lists each file's
page, sport, year and product. Each was imported from its file, with the page logged as the source:

```
npx tsx scripts/import-checklist.ts --sport Basketball --year 2025-26 --product "Panini Prizm" \
  --from scripts/checklist-csv/2025-26-basketball-panini-prizm.csv \
  --source https://www.checklistinsider.com/2025-26-panini-prizm-basketball --read 2026-11-13
```

- `--source` logs the page a saved file came from, in place of the file's name.
- `--read` logs the day that page was read, in place of today.
- The Series 2 files were imported with `--add`. 2026 Topps is Series 1 only so far.

The `*.parallels.json` files beside the CSVs are that site's parallel lists. The Topps and Bowman
ones feed `topps-parallels.json` through `scripts/merge-print-runs.ts` (above).

### 2025 Topps Chrome Football (read 2026-11-16)

Read from https://www.checklistinsider.com/2025-topps-chrome-football with the page converter, which
writes the same two files the earlier imports kept (`lib/cards/checklist-insider.ts` does the
reading):

```
npx tsx scripts/checklist-insider-import.ts --sport Football --year 2025 --product "Topps Chrome" \
  --manufacturer Topps --title "2025 Topps Chrome Football" \
  --from https://www.checklistinsider.com/2025-topps-chrome-football
npx tsx scripts/import-checklist.ts --sport Football --year 2025 --product "Topps Chrome" \
  --from scripts/checklist-csv/2025-football-topps-chrome.csv \
  --source https://www.checklistinsider.com/2025-topps-chrome-football --read 2026-11-16
npx tsx scripts/merge-print-runs.ts
```

Its base and rookie parallel list is not official. Topps' own odds sheet
(https://cdn.shopify.com/s/files/1/0662/9749/5709/files/2025_Topps_Chrome_Football_Odds.pdf) names
the same parallels with no print runs. The page gives two rookie runs that differ from the
veterans' (Green Wave /100 and Purple Wave /76, against /99 and /75): those two are left unknown.

The page's slips are fixed by `PAGE_CORRECTIONS` in `lib/cards/checklist-insider.ts`, and only those
a person checked: "Kale! Mullings" is Kaleb Mullings (Base Rookies #309 and his two autographs),
"Kurds Rourke" is Kurtis Rourke (#307), "Jandae Barron" is Jahdae Barron (#359), and "JaTMarr
Chase" (a broken apostrophe) is Ja'Marr Chase. The etch list's "Antwane Wells Jr." at #313 is
dropped: Base Rookies #313 is Pat Bryant.

### 2025 Select, Optic and Mosaic Football, 2025-26 Select Basketball (read 2026-11-16)

Card checklists only, read the same way from Checklist Insider:
https://www.checklistinsider.com/2025-panini-select-football,
https://www.checklistinsider.com/2025-donruss-optic-football,
https://www.checklistinsider.com/2025-panini-mosaic-football and
https://www.checklistinsider.com/2025-26-panini-select-basketball. Their parallels come from Panini's
own lists already in `panini-parallels.json`; the page's lists are kept beside the CSVs and not
loaded. 2025-26 Optic and Mosaic Basketball have no page yet (404 on 2026-11-16).

### 2025 Topps Chrome Update Sapphire, 2025 Topps Resurgence, Bowman U Best (read 2026-11-17)

Read the same way from Checklist Insider:
https://www.checklistinsider.com/2025-topps-chrome-update-sapphire-baseball,
https://www.checklistinsider.com/2025-topps-resurgence-football,
https://www.checklistinsider.com/2025-bowman-university-best-football and
https://www.checklistinsider.com/2025-26-bowman-university-best-basketball. No Topps odds sheet with
their parallels was found, so their parallel lists are the pages' own, added to
`topps-parallels.json` by `scripts/merge-print-runs.ts` and marked not official. The page converter
drops the notes the pages put after a team ("RD" for a rookie debut, "/5 (no base)").

The 2025-26 Bowman U Best Basketball page's slips are fixed by `PAGE_CORRECTIONS`: Game Graphs spells
"Tarris Reed JR." (Tarris Reed Jr.) and "Zakiyah Johnson" (ZaKiyah Johnson, as every other section
has her). The Chrome Update Sapphire page lists two #USC45 cards (Tommy Pham and Cal Raleigh), as
Topps printed them; both are kept.

2025-26 Panini Prizm Basketball is the Prizm NIL product (unlicensed: NBA players with no logos,
plus college and high school players). It was already in the store from the same page, with
LaBaron Philon at #103; a fresh read on 2026-11-17 added no new card # and player, so it was left
as it was. There is no Panini Resurgence page (Resurgence is a Topps product).

Until a product is in the store, the scanner falls back to the sold titles for that year, set and
card # (below).

Still not in the store, because no page with a player list was found for them: Bowman U before
2023, the 2023 Select and Optic football sets, the 2023-24 NBA sets other than Prizm Draft Picks,
and hockey before 2024-25.

Left out on purpose, so a row is always one player on one card: cards with two or more players,
team cards, league leaders, checklists and empty slots.

## How the scanner uses it

Only once the card's own year, set and card # are read. Then, in order:

1. A name the card printed is accepted when the checklist's player at that number agrees with it
   (accents, case, Jr. and a small OCR slip aside), even when our player list doesn't have them.
2. With no name read at all, the checklist names the player only when every section of the
   product puts the same player on that number, and the year was printed on the card (a © year
   alone can be the year after).
   Panini inserts and autographs reuse plain numbers (2025-26 Prizm #24 is thirteen cards). When
   sections disagree, the base sections ("Base", "Base Rookies" and the like) are preferred, but
   only when the card doesn't read as an autograph, an insert or a variation and prints none of
   the other sections' names. If more than one player is still possible, the player stays open.
3. Otherwise the sold titles for that year, set and card # can name the player, when a clear
   majority of them agree.

When no source agrees, the player stays open. A slab is always read off its label.
