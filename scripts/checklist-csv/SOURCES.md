# Checklist sources

All pages were fetched on **2026-11-13** (Fri, America/New_York) with curl, then saved as text in `raw/`. The rows were parsed only from lines on the page shaped `<card #> <player> - <team>`, and nothing was typed in by hand.

The 2025 Topps Chrome Football, Select, Optic and Mosaic rows (2026-11-16) the Chrome Update Sapphire, Resurgence and Bowman U Best rows (2026-11-17), and the 2024-2025 Topps, Topps Update, Chrome Update, Bowman Draft, Donruss, Optic, Select and Mosaic rows (also 2026-11-17, parallels "0 (not read; see below)": those pages' parallel lists didn't parse, and no parallel list was loaded from them) were read with the page converter (`scripts/checklist-insider-import.ts`), which writes the CSV and `.parallels.json` straight from the page.

The 62 rows for 2023-2026 sets read on **2026-11-17** (listed after the 2026 Topps Series 2 row) were read the same way: each page was saved first and converted from the saved file. Only the card checklists were loaded. Their `.parallels.json` files were not kept, and no parallel list was read from them.

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
| 2023-24-basketball-panini-prizm.csv | Basketball | 2023-24 | Panini Prizm | 922 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2023-24-panini-prizm-basketball |
| 2023-24-basketball-donruss-optic.csv | Basketball | 2023-24 | Donruss Optic | 973 | 200 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2023-24-donruss-optic-basketball |
| 2023-24-basketball-panini-select.csv | Basketball | 2023-24 | Panini Select | 1168 | 100 (Base Concourse) | 0 (not loaded) | https://www.checklistinsider.com/2023-24-panini-select-basketball |
| 2023-24-basketball-panini-mosaic.csv | Basketball | 2023-24 | Panini Mosaic | 1393 | 200 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2023-24-panini-mosaic-basketball |
| 2023-24-basketball-topps-chrome.csv | Basketball | 2023-24 | Topps Chrome | 836 | 190 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2023-24-topps-chrome-basketball |
| 2023-24-basketball-bowman-u-best.csv | Basketball | 2023-24 | Bowman U Best | 465 | 100 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2023-24-bowman-university-best-basketball |
| 2023-24-basketball-topps-finest.csv | Basketball | 2023-24 | Topps Finest | 640 | 100 (Base Common) | 0 (not loaded) | https://www.checklistinsider.com/2023-24-topps-finest-basketball |
| 2024-25-basketball-hoops.csv | Basketball | 2024-25 | Hoops | 1252 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2024-25-nba-hoops-basketball |
| 2024-25-basketball-bowman-u-best.csv | Basketball | 2024-25 | Bowman U Best | 518 | 100 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2024-25-bowman-university-best-basketball |
| 2024-25-basketball-topps-finest.csv | Basketball | 2024-25 | Topps Finest | 734 | 100 (Base Common) | 0 (not loaded) | https://www.checklistinsider.com/2024-25-topps-finest-basketball |
| 2024-25-basketball-prizm-draft-picks.csv | Basketball | 2024-25 | Prizm Draft Picks | 921 | 100 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2024-25-panini-prizm-draft-picks-basketball |
| 2025-26-basketball-topps.csv | Basketball | 2025-26 | Topps | 2145 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2025-26-topps-basketball |
| 2025-26-basketball-hoops.csv | Basketball | 2025-26 | Hoops | 1039 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2025-26-topps-nba-hoops-basketball |
| 2025-26-basketball-topps-chrome-update.csv | Basketball | 2025-26 | Topps Chrome Update | 1259 | 200 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2025-26-topps-chrome-update-series-basketball |
| 2025-26-basketball-topps-finest.csv | Basketball | 2025-26 | Topps Finest | 764 | 100 (Base Common) | 0 (not loaded) | https://www.checklistinsider.com/2025-26-topps-finest-basketball |
| 2026-27-basketball-topps.csv | Basketball | 2026-27 | Topps | 2651 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-27-topps-flagship-basketball |
| 2026-27-basketball-hoops.csv | Basketball | 2026-27 | Hoops | 1114 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-27-topps-nba-hoops-basketball |
| 2023-football-donruss-optic.csv | Football | 2023 | Donruss Optic | 1045 | 200 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2023-donruss-optic-football |
| 2023-football-panini-select.csv | Football | 2023 | Panini Select | 1401 | 100 (Base Concourse) | 0 (not loaded) | https://www.checklistinsider.com/2023-panini-select-football |
| 2023-football-panini-contenders.csv | Football | 2023 | Panini Contenders | 1119 | 100 (Base Season Ticket (Hobby)) | 0 (not loaded) | https://www.checklistinsider.com/2023-panini-contenders-football |
| 2024-football-panini-contenders.csv | Football | 2024 | Panini Contenders | 1002 | 100 (Base Season Ticket (Hobby)) | 0 (not loaded) | https://www.checklistinsider.com/2024-panini-contenders-football |
| 2024-football-score.csv | Football | 2024 | Score | 1064 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2024-score-football |
| 2025-football-score.csv | Football | 2025 | Score | 1162 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2025-score-football |
| 2024-football-topps-chrome.csv | Football | 2024 | Topps Chrome | 969 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2024-topps-chrome-football |
| 2024-football-topps-resurgence.csv | Football | 2024 | Topps Resurgence | 781 | 100 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2024-topps-resurgence-football |
| 2024-football-bowman-u-best.csv | Football | 2024 | Bowman U Best | 492 | 100 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2024-bowman-university-best-football |
| 2024-football-prizm-draft-picks.csv | Football | 2024 | Prizm Draft Picks | 1069 | 200 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2024-panini-prizm-draft-picks-football |
| 2025-football-prizm-draft-picks.csv | Football | 2025 | Prizm Draft Picks | 1024 | 200 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2025-panini-prizm-draft-picks-football |
| 2024-football-topps-finest.csv | Football | 2024 | Topps Finest | 838 | 100 (Base Common) | 0 (not loaded) | https://www.checklistinsider.com/2024-topps-finest-football |
| 2025-football-topps-finest.csv | Football | 2025 | Topps Finest | 788 | 100 (Base Common) | 0 (not loaded) | https://www.checklistinsider.com/2025-topps-finest-football |
| 2026-football-topps.csv | Football | 2026 | Topps | 3704 | 390 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-topps-flagship-football |
| 2026-football-topps-chrome.csv | Football | 2026 | Topps Chrome | 1584 | 400 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-topps-chrome-football |
| 2026-football-bowman.csv | Football | 2026 | Bowman | 2122 | 100 (Base Paper NFL) | 0 (not loaded) | https://www.checklistinsider.com/2026-bowman-football |
| 2026-football-panini-donruss.csv | Football | 2026 | Panini Donruss | 1572 | 199 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-donruss-football |
| 2026-football-bowman-u-best.csv | Football | 2026 | Bowman U Best | 676 | 100 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-bowman-university-best-football |
| 2026-football-topps-heritage.csv | Football | 2026 | Topps Heritage | 1531 | 397 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-topps-heritage-football |
| 2024-baseball-topps-heritage.csv | Baseball | 2024 | Topps Heritage | 2240 | 100 (Base Short Prints) | 0 (not loaded) | https://www.checklistinsider.com/2024-topps-heritage-baseball |
| 2025-baseball-topps-heritage.csv | Baseball | 2025 | Topps Heritage | 1578 | 500 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2025-topps-heritage-baseball |
| 2026-baseball-topps-heritage.csv | Baseball | 2026 | Topps Heritage | 1421 | 376 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-topps-heritage-baseball |
| 2024-baseball-topps-finest.csv | Baseball | 2024 | Topps Finest | 688 | 100 (Base Common) | 0 (not loaded) | https://www.checklistinsider.com/2024-topps-finest-baseball |
| 2025-baseball-topps-finest.csv | Baseball | 2025 | Topps Finest | 804 | 100 (Base Common) | 0 (not loaded) | https://www.checklistinsider.com/2025-topps-finest-baseball |
| 2026-baseball-topps-finest.csv | Baseball | 2026 | Topps Finest | 1042 | 100 (Base Common) | 0 (not loaded) | https://www.checklistinsider.com/2026-topps-finest-baseball |
| 2024-baseball-bowman-s-best.csv | Baseball | 2024 | Bowman's Best | 496 | 70 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2024-bowmans-best-baseball |
| 2025-baseball-bowman-s-best.csv | Baseball | 2025 | Bowman's Best | 593 | 100 (Base / Top Prospect) | 0 (not loaded) | https://www.checklistinsider.com/2025-bowmans-best-baseball |
| 2026-baseball-bowman.csv | Baseball | 2026 | Bowman | 1178 | 100 (Base Paper) | 0 (not loaded) | https://www.checklistinsider.com/2026-bowman-baseball |
| 2026-baseball-bowman-chrome.csv | Baseball | 2026 | Bowman Chrome | 1197 | 100 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-bowman-chrome-baseball |
| 2026-baseball-topps-chrome.csv | Baseball | 2026 | Topps Chrome | 1339 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-topps-chrome-baseball |
| 2026-baseball-topps-chrome-update.csv | Baseball | 2026 | Topps Chrome Update | 1594 | 200 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-topps-chrome-update-series-baseball |
| 2026-baseball-topps-update.csv | Baseball | 2026 | Topps Update | 3300 | 334 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-topps-update-series-baseball |
| 2024-baseball-panini-donruss.csv | Baseball | 2024 | Panini Donruss | 894 | 200 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2024-donruss-baseball |
| 2025-baseball-panini-donruss.csv | Baseball | 2025 | Panini Donruss | 1166 | 200 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2025-donruss-baseball |
| 2026-baseball-panini-donruss.csv | Baseball | 2026 | Panini Donruss | 1200 | 100 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-donruss-baseball |
| 2024-baseball-panini-prizm.csv | Baseball | 2024 | Panini Prizm | 598 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2024-panini-prizm-baseball |
| 2025-baseball-panini-prizm.csv | Baseball | 2025 | Panini Prizm | 600 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2025-panini-prizm-baseball |
| 2026-baseball-panini-prizm.csv | Baseball | 2026 | Panini Prizm | 694 | 300 (Base) | 0 (not loaded) | https://www.checklistinsider.com/2026-panini-prizm-baseball |
| 2024-baseball-panini-select.csv | Baseball | 2024 | Panini Select | 795 | 100 (Base Concourse) | 0 (not loaded) | https://www.checklistinsider.com/2024-panini-select-baseball |
| 2025-baseball-panini-select.csv | Baseball | 2025 | Panini Select | 796 | 100 (Base Concourse) | 0 (not loaded) | https://www.checklistinsider.com/2025-panini-select-baseball |
| 2024-baseball-topps-chrome-sapphire.csv | Baseball | 2024 | Topps Chrome Sapphire | 787 | 700 (Base Complete Set) | 0 (not loaded) | https://www.checklistinsider.com/2024-topps-chrome-sapphire-baseball |
| 2024-baseball-bowman-chrome-sapphire.csv | Baseball | 2024 | Bowman Chrome Sapphire | 284 | 100 (Base Sapphire) | 0 (not loaded) | https://www.checklistinsider.com/2024-bowman-chrome-sapphire-baseball |
| 2026-baseball-topps-chrome-sapphire.csv | Baseball | 2026 | Topps Chrome Sapphire | 402 | 300 (Base Sapphire) | 0 (not loaded) | https://www.checklistinsider.com/2026-topps-chrome-sapphire-baseball |
| 2026-baseball-bowman-chrome-sapphire.csv | Baseball | 2026 | Bowman Chrome Sapphire | 270 | 100 (Base Sapphire) | 0 (not loaded) | https://www.checklistinsider.com/2026-bowman-chrome-sapphire-baseball |
| 2024-baseball-topps-chrome-update-sapphire.csv | Baseball | 2024 | Topps Chrome Update Sapphire | 403 | 350 (Base Sapphire) | 0 (not loaded) | https://www.checklistinsider.com/2024-topps-chrome-update-sapphire-baseball |

## Cross-check
For 2025-26 Panini Prizm Basketball, all 200 Base rows match https://www.diamondcardsonline.com/blog/2025-26-panini-prizm-basketball-cards-checklist/ (fetched 2026-11-13): 200 agree, 0 differ.

## Not reachable from the box (2026-11-13)
- Beckett (beckett.com/news): HTTP 403.
- Panini official checklist page (paniniamerica.net/checklist.html): HTTP 403.
- Cardboard Connection, 2024/2025 Prizm Football pages: HTTP 404 at the expected URLs.
