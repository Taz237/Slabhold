# Where the player list comes from

Two files, names and sport only (the roster file also keeps the team). No photos, logos, links or ids.

## `directory.json` (roster file)

Current NBA, WNBA, NFL, MLB and NHL rosters from ESPN's public site API, plus the hand-kept list of
retired stars and top prospects. Built by `node scripts/build-player-directory.mjs`.

## `directory-more.json` (the wider list)

Retired players, college players, prospects, and pros the roster file misses. Built by
`npx tsx scripts/build-player-directory-more.ts`. The cut and the drop rules are in that script's header.
Pulled 2026-11-13. Every source is an open dataset hosted on GitHub.

| Sport | What | Source | Licence |
| --- | --- | --- | --- |
| Football | NFL players, all time | nflverse `players.csv`: github.com/nflverse/nflverse-data (release `players`) | CC BY 4.0 |
| Football | College rosters, 2026 | sportsdataverse `espn_cfb_rosters`: github.com/sportsdataverse/sportsdataverse-data (release `espn_cfb_rosters`) | MIT |
| Basketball | NBA and WNBA players, all time | nba_api static list: github.com/swar/nba_api (`src/nba_api/stats/library/data.py`) | MIT |
| Basketball | College rosters, men and women, 2026-27 | sportsdataverse `espn_mens_college_basketball_rosters`, `espn_womens_college_basketball_rosters` | MIT |
| Baseball | MLB players and minor leaguers | Chadwick Baseball Bureau register: github.com/chadwickbureau/register | Open Data Commons Attribution 1.0 |
| Hockey | NHL rosters, 2009-10 to 2026-27 | sportsdataverse `nhl_rosters` | MIT |

Attribution: nflverse; SportsDataverse; Swar Patel (nba_api); Chadwick Baseball Bureau.

Not covered, because no open GitHub-hosted source was found: hockey prospects and college hockey,
college baseball, and NHL players whose last season was before 2009-10 (the hand-kept stars in the
roster file aside).

## How the scanner uses the wider list

Only to confirm a name the card printed on a line of its own, exactly. Never a near match, never a
name inside other text, never against the card's own sport, never on a slab label. An unknown name
with no sold title still stays open. See `findPlayers` in `lib/scan/raw-text.ts`, `evidenceFrom` in
`lib/scan/match.ts`, and the player-list set in `lib/scan/bakeoff-fixtures-players.ts`.
