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
| Baseball | Topps Finest | 2019, 2021, 2022, 2023 |
| Baseball | Topps Update | 2019, 2020, 2021, 2022, 2023 |
| Basketball | Bowman | 2025-26 |
| Basketball | Bowman U Chrome | 2023-24, 2024-25 |
| Basketball | Donruss Optic | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Panini Donruss | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Panini Mosaic | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Panini Prizm | 2019-20, 2020-21, 2021-22, 2022-23, 2024-25, 2025-26 |
| Basketball | Panini Select | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Prizm Draft Picks | 2019-20, 2020-21, 2021-22, 2022-23, 2023-24 |
| Basketball | Topps Chrome | 2025-26 |
| Football | Bowman U Chrome | 2023, 2024, 2025 |
| Football | Donruss Optic | 2019, 2020, 2021, 2022 |
| Football | Panini Donruss | 2019, 2020, 2021, 2022, 2023 |
| Football | Panini Mosaic | 2020, 2021, 2022, 2023 |
| Football | Panini Prizm | 2019, 2020, 2021, 2022, 2023, 2024, 2025 |
| Football | Panini Select | 2019, 2020, 2021, 2022 |
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

The `*.parallels.json` files beside the CSVs are that site's parallel lists. They are kept there
for later and are not loaded by the app: the parallel files above are still the only ones used.

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
