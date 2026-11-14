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

85 products, 94,812 cards, read 2026-11-14:

| Sport | Product | Years |
| --- | --- | --- |
| Baseball | Bowman | 2019, 2020, 2021, 2022, 2023 |
| Baseball | Bowman Chrome | 2019, 2020, 2021, 2022 |
| Baseball | Bowman Draft | 2019, 2020, 2021, 2022, 2023 |
| Baseball | Topps | 2019, 2020, 2021, 2022, 2023 |
| Baseball | Topps Chrome | 2019, 2020, 2021, 2022, 2023 |
| Baseball | Topps Finest | 2019, 2021, 2022, 2023 |
| Baseball | Topps Update | 2019, 2020, 2021, 2022, 2023 |
| Basketball | Bowman U Chrome | 2023-24 |
| Basketball | Donruss Optic | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Panini Donruss | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Panini Mosaic | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Panini Prizm | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Panini Select | 2019-20, 2020-21, 2021-22, 2022-23 |
| Basketball | Prizm Draft Picks | 2019-20, 2020-21, 2021-22, 2022-23, 2023-24 |
| Football | Bowman U Chrome | 2023 |
| Football | Donruss Optic | 2019, 2020, 2021, 2022 |
| Football | Panini Donruss | 2019, 2020, 2021, 2022, 2023 |
| Football | Panini Mosaic | 2020, 2021, 2022, 2023 |
| Football | Panini Prizm | 2019, 2020, 2021, 2022, 2023 |
| Football | Panini Select | 2019, 2020, 2021, 2022 |
| Football | Prizm Draft Picks | 2019, 2020, 2021 |

Read from Cardboard Connection's product pages, the same source as the 2024 Bowman parallels
above. Those pages carry a full player checklist for products through 2023. Their 2024 and later
pages are reviews with no player list, so those years are not in the store yet: they need the
makers' own files. Panini's CSV download reads as it comes. A Topps checklist reads the same way
once it is saved as a CSV with player, team and card number columns. Until a product is in the store, the scanner falls back to the sold titles for that year,
set and card # (below).

Also not in the store, because no page with a player list was found for them: hockey (none of
these product lines had one), Topps Chrome basketball and football, Bowman U before 2023, the
2023 Select and Optic football sets, and the 2023-24 NBA sets other than Prizm Draft Picks.

Left out on purpose, so a row is always one player on one card: cards with two or more players,
team cards, league leaders, checklists and empty slots.

## How the scanner uses it

Only once the card's own year, set and card # are read. Then, in order:

1. A name the card printed is accepted when the checklist's player at that number agrees with it
   (accents, case, Jr. and a small OCR slip aside), even when our player list doesn't have them.
2. With no name read at all, the checklist names the player only when every section of the
   product puts the same player on that number, and the year was printed on the card (a © year
   alone can be the year after).
3. Otherwise the sold titles for that year, set and card # can name the player, when a clear
   majority of them agree.

When no source agrees, the player stays open. A slab is always read off its label.
