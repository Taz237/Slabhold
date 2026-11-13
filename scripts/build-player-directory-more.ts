/**
 * Build lib/players/directory-more.json: the wider player list (retired, college,
 * prospects, and pros the roster file misses) for all four sports.
 *
 *   npx tsx scripts/build-player-directory-more.ts [cache-dir]
 *
 * lib/players/directory.json (ESPN rosters plus the hand-kept retired stars, built by
 * build-player-directory.mjs) is left exactly as it is. This file only adds names.
 * Sources, licences and the date pulled are in lib/players/SOURCES.md. Every source
 * is an open dataset hosted on GitHub. Files are downloaded into the cache dir once
 * and only ever parsed as text. Stored: the name, under its sport. No teams, logos,
 * photos, links or ids.
 *
 * What is kept (the cut), per source:
 *   Football    nflverse players: on a roster in 2025 or later; or a QB, RB, WR or TE with
 *               4+ seasons; or a first-round pick; or anyone with 8+ seasons.
 *               ESPN college rosters 2026: QB, RB, WR and TE at the FBS schools the scanner knows.
 *   Basketball  nba_api: every NBA and WNBA player, all time.
 *               ESPN college rosters 2026-27, men and women, at the schools the scanner knows.
 *   Baseball    Chadwick register: 10+ MLB seasons, or in MLB in 2015 or later; and prospects
 *               (pro ball in 2025 or later, no MLB game yet, born 2001 or later).
 *   Hockey      NHL rosters 2009-10 to 2026-27: everyone.
 *
 * What is dropped, so a bigger list can never turn a right or open scan into a wrong one:
 *   1. A name the roster file already has (any sport): that row wins.
 *   2. A name players in two sports share (checked against everyone in the sources, not only
 *      the rows kept): the scanner could not tell which sport the card is.
 *   3. A name the scanner would not read as a name line: readsAsNameLine() in lib/scan/raw-text.ts
 *      (two or three plain words, none a set, color, rookie, team or back-of-card word).
 *   4. A name made only of everyday words a card can print as a title (COMMON_WORDS below).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { INDEXED_DIRECTORY } from "@/lib/players/directory";
import { readsAsNameLine } from "@/lib/scan/raw-text";
import { SCHOOLS } from "@/lib/scan/schools";
import { compactNorm, normInterest } from "@/lib/social/follow-rank";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "lib", "players", "directory-more.json");
const cache = process.argv[2] ?? join(tmpdir(), "slabhold-player-sources");

const SDV = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download";
const NHL_SEASONS = Array.from({ length: 18 }, (_unused, i) => 2010 + i);
const REGISTER_PARTS = [..."0123456789abcdef"];

const FILES: Record<string, string> = {
  "nfl_players.csv": "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv",
  "nba_data.py": "https://raw.githubusercontent.com/swar/nba_api/master/src/nba_api/stats/library/data.py",
  "cfb_2026.csv.gz": `${SDV}/espn_cfb_rosters/cfb_rosters_2026.csv.gz`,
  "mbb_2027.csv": `${SDV}/espn_mens_college_basketball_rosters/rosters_2027.csv`,
  "wbb_2027.csv": `${SDV}/espn_womens_college_basketball_rosters/rosters_2027.csv`,
  ...Object.fromEntries(NHL_SEASONS.map((year) => [`nhl_${year}.csv`, `${SDV}/nhl_rosters/rosters_${year}.csv`])),
  ...Object.fromEntries(
    REGISTER_PARTS.map((part) => [`reg${part}.csv`, `https://raw.githubusercontent.com/chadwickbureau/register/master/data/people-${part}.csv`]),
  ),
};

/** Everyday words a card prints in titles and inserts. A name made only of these is left out. */
const COMMON_WORDS = new Set(
  `ace art ball banks battle bear bell best big bird bishop blaze bolt bond booker boom boss bowl box bright brooks buck bud
  buddy bull bullet bush butler cannon captain carpenter case cash champ champion chance chase chief christmas church city
  class clay cliff club coach cook cool count crown dale dash day dean diamond dream duke dusty earl early east fair faith
  fall fame fast field fielder fields fisher flash flowers foot ford forest fox frank free friday frost game general gift
  glass glory golden grace grand grant gray great grey gunner hall hammer hand hardy head heart hero high hill home hope
  hunter hurricane ice iron irons jack jet jewel joy judge june justice king knight lake lance land lane law legend light
  lightning little long lord love lucky mack magic major marsh marshall mason master may mays miles miller money monday moon
  north page park parks pearl pitcher pope power powers price pride prince pro prime queen quick rain raines rainey ray reign
  rich rider ring rip rivers rock rocket rocky rod rose royal ruby rush rusty sage sandy savage sergeant sharp sharpe ship
  short shot sky slim smart snow sonny south speed spring springs sterling stone storm street strong summer summers sun
  sunday swift tiger top tower treasure trey true van victor victory walker ward warren waters way west will win winn winner
  winter winters wise wolf wood woods young`.split(/\s+/),
);

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift() ?? [];
  return rows.map((cells) => Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ""])));
}

async function load(name: string): Promise<string> {
  const file = join(cache, name);
  if (!existsSync(file)) {
    mkdirSync(cache, { recursive: true });
    const response = await fetch(FILES[name], { headers: { "user-agent": "player-directory-build" } });
    if (!response.ok) throw new Error(`${response.status} ${FILES[name]}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = readFileSync(file);
  return (name.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8");
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const key = (name: string) => compactNorm(normInterest(name));

type Category = "current" | "retired" | "prospect" | "college";
type Candidate = { name: string; sport: string; category: Category };

/** Everyone the sources know, by sport: a name in two sports is left out. */
const everyone = new Map<string, Set<string>>();
const candidates: Candidate[] = [];

function known(name: string, sport: string) {
  const compact = key(name);
  if (!compact) return;
  const sports = everyone.get(compact);
  if (sports) sports.add(sport);
  else everyone.set(compact, new Set([sport]));
}

function keep(name: string, sport: string, category: Category) {
  candidates.push({ name: clean(name), sport, category });
}

async function main() {
  for (const player of INDEXED_DIRECTORY) known(player.name, player.sport);

  // Football: nflverse.
  for (const row of parseCsv(await load("nfl_players.csv"))) {
    const name = clean(row.display_name);
    if (!name) continue;
    known(name, "Football");
    const seasons = Number(row.years_of_experience) || 0;
    const last = Number(row.last_season) || 0;
    if (last >= 2025) keep(name, "Football", "current");
    else if ((["QB", "RB", "WR", "TE"].includes(row.position_group) && seasons >= 4) || row.draft_round === "1" || seasons >= 8) {
      keep(name, "Football", "retired");
    }
  }

  // Basketball: nba_api's bundled lists. Rows look like [76001, "Abdelnaby", "Alaa", "Alaa Abdelnaby", False].
  {
    const source = await load("nba_data.py");
    const line = /^\s*\[\d+, "(?:[^"\\]|\\.)*", "(?:[^"\\]|\\.)*", "((?:[^"\\]|\\.)*)", (True|False)\],?\s*$/;
    let inPlayers = false;
    for (const text of source.split("\n")) {
      if (/^(players|wnba_players) = \[/.test(text)) inPlayers = true;
      else if (/^\w+ = /.test(text)) inPlayers = false;
      if (!inPlayers) continue;
      const match = line.exec(text);
      if (!match) continue;
      const name = clean(match[1].replace(/\\(.)/g, "$1"));
      known(name, "Basketball");
      keep(name, "Basketball", match[2] === "True" ? "current" : "retired");
    }
  }

  // Baseball: the Chadwick register.
  for (const part of REGISTER_PARTS) {
    for (const row of parseCsv(await load(`reg${part}.csv`))) {
      const name = clean([row.name_first, row.name_last, row.name_suffix].filter(Boolean).join(" "));
      if (!row.name_first || !row.name_last) continue;
      const mlbFirst = Number(row.mlb_played_first) || 0;
      const mlbLast = Number(row.mlb_played_last) || 0;
      const proLast = Number(row.pro_played_last) || 0;
      if (!mlbFirst && proLast < 1990) continue;
      known(name, "Baseball");
      if (mlbFirst) {
        if (mlbLast >= 2025) keep(name, "Baseball", "current");
        else if (mlbLast >= 2015 || mlbLast - mlbFirst >= 9) keep(name, "Baseball", "retired");
      } else if (proLast >= 2025 && Number(row.birth_year) >= 2001) keep(name, "Baseball", "prospect");
    }
  }

  // Hockey: NHL rosters.
  {
    const latest = new Map<string, number>();
    for (const year of NHL_SEASONS) {
      for (const row of parseCsv(await load(`nhl_${year}.csv`))) {
        const name = clean(row.full_name);
        if (name) latest.set(name, year);
      }
    }
    for (const [name, year] of latest) {
      known(name, "Hockey");
      keep(name, "Hockey", year >= 2026 ? "current" : "retired");
    }
  }

  // College: ESPN rosters at the schools the scanner reads.
  {
    const schools = new Set<string>(SCHOOLS.map((name) => normInterest(name)));
    const locationOf = new Map<string, string>();
    for (const row of parseCsv(await load("cfb_2026.csv.gz"))) {
      const name = clean(row.full_name);
      if (!name) continue;
      known(name, "Football");
      locationOf.set(normInterest(row.team_display_name), normInterest(row.team_location));
      if (row.division === "fbs" && schools.has(normInterest(row.team_location)) && ["QB", "RB", "WR", "TE"].includes(row.position_abbreviation)) {
        keep(name, "Football", "college");
      }
    }
    /** "Duke Blue Devils" is Duke. The football file names most schools; else the longest school the team name starts with. */
    const schoolOf = (team: string): string => {
      const display = normInterest(team);
      const location = locationOf.get(display);
      if (location !== undefined) return schools.has(location) ? location : "";
      const words = display.split(" ");
      for (let size = Math.min(3, words.length - 1); size >= 1; size -= 1) {
        const head = words.slice(0, size).join(" ");
        if (schools.has(head) && words.length - size <= 2) return head;
      }
      return "";
    };
    for (const file of ["mbb_2027.csv", "wbb_2027.csv"]) {
      for (const row of parseCsv(await load(file))) {
        const name = clean(row.full_name);
        if (!name) continue;
        known(name, "Basketball");
        if (schoolOf(row.team_display_name)) keep(name, "Basketball", "college");
      }
    }
  }

  const coreKeys = new Set(INDEXED_DIRECTORY.map((player) => player.compact));
  const dropped = { inRosterFile: 0, twoSports: 0, notANameLine: 0, commonWords: 0, duplicate: 0 };
  const kept = new Map<string, Candidate>();
  // A pro row beats a college row for the same name; then the first seen.
  const rank: Record<Category, number> = { current: 0, retired: 1, prospect: 2, college: 3 };

  for (const candidate of [...candidates].sort((a, b) => rank[a.category] - rank[b.category])) {
    const compact = key(candidate.name);
    if (!compact || kept.has(compact)) {
      dropped.duplicate += 1;
      continue;
    }
    if (coreKeys.has(compact)) {
      dropped.inRosterFile += 1;
      continue;
    }
    if ((everyone.get(compact)?.size ?? 0) > 1) {
      dropped.twoSports += 1;
      continue;
    }
    if (!readsAsNameLine(candidate.name, INDEXED_DIRECTORY)) {
      dropped.notANameLine += 1;
      continue;
    }
    if (normInterest(candidate.name).split(" ").every((word) => COMMON_WORDS.has(word))) {
      dropped.commonWords += 1;
      continue;
    }
    kept.set(compact, candidate);
  }

  const out: Record<string, string[]> = {};
  const counts: Record<string, Record<string, number>> = {};
  for (const { name, sport, category } of kept.values()) {
    (out[sport] ??= []).push(name);
    (counts[sport] ??= {})[category] = (counts[sport]?.[category] ?? 0) + 1;
  }
  for (const names of Object.values(out)) names.sort((a, b) => a.localeCompare(b, "en"));
  const sorted = Object.fromEntries(Object.keys(out).sort().map((sport) => [sport, out[sport]]));

  const blob = JSON.stringify(sorted);
  if (/https?:|headshot|logo/i.test(blob)) throw new Error("the wider list contains a url or image field");
  if (/pok[eé]mon|\btcg\b|yu-?gi-?oh/i.test(blob)) throw new Error("the wider list contains a Pokémon or TCG row");

  writeFileSync(outFile, `{\n${Object.entries(sorted).map(([sport, names]) => `${JSON.stringify(sport)}:${JSON.stringify(names)}`).join(",\n")}\n}\n`);
  console.log(`kept ${kept.size} of ${candidates.length} candidates`);
  console.log("by sport and category:", JSON.stringify(counts));
  console.log("dropped:", JSON.stringify(dropped));
  console.log(`wrote ${outFile}`);
}

void main();
