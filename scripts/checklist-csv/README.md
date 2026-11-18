# Checklists for the PR #273 checklist store (2024 and later, plus hockey)

## Format
Each set has one CSV in the "maker CSV" shape that `scripts/import-checklist.ts` reads (`sectionsFromMakerCsv`), because the file name ends in `.csv`:

```
CARD SET,CARD NUMBER,ATHLETE,TEAM,RC,FIRST BOWMAN
Base,103,Labaron Philon,Alabama Crimson Tide,,
Chrome Prospects,BCP-22,JJ Wetherholt,St. Louis Cardinals,,1st
```

- **CARD SET** becomes the section name (Base, Base Rookies, Chrome Prospects, Base Young Guns, and so on), using the page's own headings.
- **RC** and **FIRST BOWMAN** come from the page's own "RC" and "1st" tags. Rows in a "Base Rookies" or "Base Young Guns" section are also marked RC. The importer ignores these two columns today, but the data is there if the store ever adds them.
- Each `*.parallels.json` file is one `ProductRecord` in the same shape as `lib/cards/data/topps-parallels.json` and `panini-parallels.json`, with `subset` set to the section name and `serialRun` set to the run or null. It's marked `official: false` because it comes from a hobby site, not the maker. These files are optional extras.

## Tested
I ran the real importer from the PR #273 head on every CSV in a throwaway local worktree that has since been removed. Nothing was pushed. All 24 CSV files imported, and none were skipped. These spot lookups returned the right player: 2025-26 Prizm #103 (Labaron Philon), 2024 Prizm FB #329 (Drake Maye), 2025-26 Upper Deck #205 (Ivan Demidov), 2025 Bowman BCP-22 (JJ Wetherholt), 2025 Topps Chrome #221 (Max Muncy, Athletics), and 2025-26 Topps Chrome #251 (Cooper Flagg).

## Gaps and caveats
- **Duplicate numbers on Panini pages.** Panini inserts and autographs reuse plain numbers. For example, 2025-26 Prizm #24 is Sion James in Base, but 12 other cards in inserts and autographs also carry #24. The resolver should prefer the Base or Base Rookies sections, or require the OCR name or sold titles to agree. Otherwise those lookups will stay open.
- **Rows dropped on purpose.** I left out two-player cards, plus checklist, league leaders, and combo cards. The importer also drops one-word names (for example "Ichiro"), mascots, and team cards.
- **2025-26 Prizm Basketball** has no RC tags on the page, so its RC column is blank.
- **No separate 2025-26 Bowman U Chrome Basketball product.** The college cards are inside 2025-26 Bowman Basketball (BCP- prospects), and that page was imported as product "Bowman", Basketball, 2025-26.
- **Upper Deck hockey** is split into Series 1 and Series 2 files that share one product, "Upper Deck". Import the Series 2 file with `--add`.
- **2026 Topps** covers Series 1 only. Import Series 2 with `--add` once a page exists.
