# Checklist sources

All pages were fetched on **2026-11-13** (Fri, America/New_York) with curl, then saved as text in `raw/`. The rows were parsed only from lines on the page shaped `<card #> <player> - <team>`, and nothing was typed in by hand.

The 2025 Topps Chrome Football, Select, Optic and Mosaic rows (2026-11-16) the Chrome Update Sapphire, Resurgence and Bowman U Best rows (2026-11-17), and the 2024-2025 Topps, Topps Update, Chrome Update, Bowman Draft, Donruss, Optic, Select and Mosaic rows (also 2026-11-17, parallels "0 (not read; see below)": those pages' parallel lists didn't parse, and no parallel list was loaded from them) were read with the page converter (`scripts/checklist-insider-import.ts`), which writes the CSV and `.parallels.json` straight from the page.

| File | Sport | Year | Product (`--product`) | CSV rows | Base rows | Parallels | Source URL |
|---|---|---|---|---|---|---|---|
| 2025-26-basketball-panini-prizm.csv | Basketball | 2025-26 | Panini Prizm | 722 | 200 (Base) | 203 | https://www.checklistinsider.com/2025-26-panini-prizm-basketball |
| 2025-football-panini-prizm.csv | Football | 2025 | Panini Prizm | 1021 | 400 (Base) | 160 | https://www.checklistinsider.com/2025-panini-prizm-football |
| 2025-baseball-topps-chrome.csv | Baseball | 2025 | Topps Chrome | 1026 | 300 (Base) | 173 | https://www.checklistinsider.com/2025-topps-chrome-baseball |
| 2025-baseball-bowman.csv | Baseball | 2025 | Bowman | 903 | 100 (Base Paper) | 230 | https://www.checklistinsider.com/2025-bowman-baseball |
| 2025-baseball-bowman-chrome.csv | Baseball | 2025 | Bowman Chrome | 726 | 100 (Base Chrome) | 299 | https://www.checklistinsider.com/2025-bowman-chrome-baseball |
| 2025-baseball-bowman-draft.csv | Baseball | 2025 | Bowman Draft | 746 | 200 (Base) | 152 | https://www.checklistinsider.com/2025-bowman-draft-baseball |
| 2025-football-bowman-u-chrome.csv | Football | 2025 | Bowman U Chrome | 684 | 200 (Base Chrome Prospects) | 99 | https://www.checklistinsider.com/2025-bowman-university-chrome-football |
| 2024-football-bowman-u-chrome.csv | Football | 2024 | Bowman U Chrome | 626 | 200 (Base) | 73 | https://www.checklistinsider.com/2024-bowman-university-chrome-football |
| 2024-25-basketball-bowman-u-chrome.csv | Basketball | 2024-25 | Bowman U Chrome | 520 | 100 (Base Prospects) | 82 | https://www.checklistinsider.com/2024-25-bowman-university-chrome-basketball |
| 2024-football-panini-prizm.csv | Football | 2024 | Panini Prizm | 890 | 300 (Base) | 230 | https://www.checklistinsider.com/2024-panini-prizm-football |
| 2024-25-basketball-panini-prizm.csv | Basketball | 2024-25 | Panini Prizm | 928 | 300 (Base) | 198 | https://www.checklistinsider.com/2024-25-panini-prizm-basketball |
| 2024-baseball-topps-chrome.csv | Baseball | 2024 | Topps Chrome | 922 | 300 (Base) | 168 | https://www.checklistinsider.com/2024-topps-chrome-baseball |
| 2024-baseball-bowman.csv | Baseball | 2024 | Bowman | 925 | 100 (Base Paper) | 171 | https://www.checklistinsider.com/2024-bowman-baseball |
| 2024-baseball-bowman-chrome.csv | Baseball | 2024 | Bowman Chrome | 670 | 100 (Base) | 126 | https://www.checklistinsider.com/2024-bowman-chrome-baseball |
| 2024-25-hockey-upper-deck-series-1.csv | Hockey | 2024-25 | Upper Deck | 810 | 198 (Base) | 71 | https://www.checklistinsider.com/2024-25-upper-deck-series-1-hockey |
| 2024-25-hockey-upper-deck-series-2.csv | Hockey | 2024-25 | Upper Deck | 879 | 198 (Base) | 73 | https://www.checklistinsider.com/2024-25-upper-deck-series-2-hockey |
| 2025-26-hockey-upper-deck-series-1.csv | Hockey | 2025-26 | Upper Deck | 888 | 198 (Base) | 63 | https://www.checklistinsider.com/2025-26-upper-deck-series-1-hockey |
| 2025-26-hockey-upper-deck-series-2.csv | Hockey | 2025-26 | Upper Deck | 979 | 198 (Base) | 66 | https://www.checklistinsider.com/2025-26-upper-deck-series-2-hockey |
| 2025-baseball-topps-chrome-update.csv | Baseball | 2025 | Topps Chrome Update | 1104 | 200 (Base) | 149 | https://www.checklistinsider.com/2025-topps-chrome-update-series-baseball |
| 2025-baseball-topps-chrome-sapphire.csv | Baseball | 2025 | Topps Chrome Sapphire | 372 | 300 (Base Sapphire) | 26 | https://www.checklistinsider.com/2025-topps-chrome-sapphire-baseball |
| 2025-baseball-bowman-chrome-sapphire.csv | Baseball | 2025 | Bowman Chrome Sapphire | 263 | 100 (Base Sapphire) | 29 | https://www.checklistinsider.com/2025-bowman-chrome-sapphire-baseball |
| 2025-26-basketball-bowman.csv | Basketball | 2025-26 | Bowman | 1493 | 200 (Base) | 357 | https://www.checklistinsider.com/2025-26-bowman-basketball |
| 2025-26-basketball-topps-chrome.csv | Basketball | 2025-26 | Topps Chrome | 1208 | 299 (Base) | 529 | https://www.checklistinsider.com/2025-26-topps-chrome-basketball |
| 2025-football-topps-chrome.csv | Football | 2025 | Topps Chrome | 1570 | 300 (Base) + 100 (Base Rookies) | 417 | https://www.checklistinsider.com/2025-topps-chrome-football |
| 2025-football-panini-select.csv | Football | 2025 | Panini Select | 1497 | 500 (Base Concourse to Field Level) | 323 | https://www.checklistinsider.com/2025-panini-select-football |
| 2025-football-donruss-optic.csv | Football | 2025 | Donruss Optic | 1101 | 200 (Base) + 100 (Base Rated Rookie) | 188 | https://www.checklistinsider.com/2025-donruss-optic-football |
| 2025-football-panini-mosaic.csv | Football | 2025 | Panini Mosaic | 1074 | 250 (Base) + 100 (Base Rookies) | 0 (page layout not read; Panini's list is used) | https://www.checklistinsider.com/2025-panini-mosaic-football |
| 2025-26-basketball-panini-select.csv | Basketball | 2025-26 | Panini Select | 1242 | 400 (Base Concourse to Mezzanine Level) | 410 | https://www.checklistinsider.com/2025-26-panini-select-basketball |
| 2025-baseball-topps-chrome-update-sapphire.csv | Baseball | 2025 | Topps Chrome Update Sapphire | 287 | 200 (Base Sapphire) | 20 | https://www.checklistinsider.com/2025-topps-chrome-update-sapphire-baseball |
| 2025-football-topps-resurgence.csv | Football | 2025 | Topps Resurgence | 748 | 100 (Base) + 100 (Base Rookies) | 230 | https://www.checklistinsider.com/2025-topps-resurgence-football |
| 2025-football-bowman-u-best.csv | Football | 2025 | Bowman U Best | 541 | 100 (Base) | 89 | https://www.checklistinsider.com/2025-bowman-university-best-football |
| 2025-26-basketball-bowman-u-best.csv | Basketball | 2025-26 | Bowman U Best | 617 | 100 (Base) | 89 | https://www.checklistinsider.com/2025-26-bowman-university-best-basketball |
| 2026-baseball-topps-series-1.csv | Baseball | 2026 | Topps | 1301 | 330 (Base) | 252 | https://www.checklistinsider.com/2026-topps-series-1-baseball |

| 2024-baseball-topps-series-1.csv | Baseball | 2024 | Topps | 2452 | 350 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-topps-series-1-baseball |
| 2024-baseball-topps-series-2.csv | Baseball | 2024 | Topps | 2082 | 350 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-topps-series-2-baseball |
| 2025-baseball-topps-series-1.csv | Baseball | 2025 | Topps | 2486 | 350 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2025-topps-series-1-baseball |
| 2025-baseball-topps-series-2.csv | Baseball | 2025 | Topps | 2443 | 350 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2025-topps-series-2-baseball |
| 2024-baseball-topps-update.csv | Baseball | 2024 | Topps Update | 2054 | 350 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-topps-update-series-baseball |
| 2025-baseball-topps-update.csv | Baseball | 2025 | Topps Update | 2002 | 350 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2025-topps-update-series-baseball |
| 2024-baseball-topps-chrome-update.csv | Baseball | 2024 | Topps Chrome Update | 1170 | 200 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-topps-chrome-update-series-baseball |
| 2024-baseball-bowman-draft.csv | Baseball | 2024 | Bowman Draft | 757 | 200 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-bowman-draft-baseball |
| 2024-25-basketball-donruss-optic.csv | Basketball | 2024-25 | Donruss Optic | 1086 | 250 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-25-donruss-optic-basketball |
| 2024-25-basketball-panini-donruss.csv | Basketball | 2024-25 | Panini Donruss | 970 | 200 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-25-donruss-basketball |
| 2024-25-basketball-panini-select.csv | Basketball | 2024-25 | Panini Select | 1162 | 0 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-25-panini-select-basketball |
| 2024-25-basketball-panini-mosaic.csv | Basketball | 2024-25 | Panini Mosaic | 1355 | 300 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-25-panini-mosaic-basketball |
| 2024-25-basketball-topps-chrome.csv | Basketball | 2024-25 | Topps Chrome | 948 | 200 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-25-topps-chrome-basketball |
| 2024-football-donruss-optic.csv | Football | 2024 | Donruss Optic | 1040 | 200 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-donruss-optic-football |
| 2024-football-panini-donruss.csv | Football | 2024 | Panini Donruss | 2007 | 300 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-donruss-football |
| 2024-football-panini-select.csv | Football | 2024 | Panini Select | 1488 | 0 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-panini-select-football |
| 2024-football-panini-mosaic.csv | Football | 2024 | Panini Mosaic | 1104 | 250 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2024-panini-mosaic-football |
| 2025-football-panini-donruss.csv | Football | 2025 | Panini Donruss | 2088 | 300 (Base) | 0 (not read; see below) | https://www.checklistinsider.com/2025-donruss-football |
| 2025-26-basketball-panini-donruss.csv | Basketball | 2025-26 | Panini Donruss | 1432 | 200 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2025-26-donruss-basketball |
| 2026-baseball-topps-series-2.csv | Baseball | 2026 | Topps | 3136 | 350 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-topps-series-2-baseball |

## Cross-check
For 2025-26 Panini Prizm Basketball, all 200 Base rows match https://www.diamondcardsonline.com/blog/2025-26-panini-prizm-basketball-cards-checklist/ (fetched 2026-11-13): 200 agree, 0 differ.

## Not reachable from the box (2026-11-13)
- Beckett (beckett.com/news): HTTP 403.
- Panini official checklist page (paniniamerica.net/checklist.html): HTTP 403.
- Cardboard Connection, 2024/2025 Prizm Football pages: HTTP 404 at the expected URLs.
