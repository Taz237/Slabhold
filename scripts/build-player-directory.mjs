/**
 * Refresh lib/players/directory.json from public roster pages.
 *
 *   node scripts/build-player-directory.mjs
 *
 * Active NBA, WNBA, NFL, MLB, and NHL players come from ESPN's public site API:
 *   https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams
 *   https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams/{id}/roster
 * Everyone on the published roster is kept (active, day-to-day, injured, practice squad).
 * Well-known retired stars collectors chase are appended from RETIRED below when
 * that normalized name is not already on a roster for the same sport.
 * Stored fields are name, sport, and team only. No logos, headshots, or ids.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "lib", "players", "directory.json");

const LEAGUES = [
  { sport: "Basketball", path: "basketball/nba" },
  { sport: "Basketball", path: "basketball/wnba" },
  { sport: "Football", path: "football/nfl" },
  { sport: "Baseball", path: "baseball/mlb" },
  { sport: "Hockey", path: "hockey/nhl" },
];

/** Card-shop names that drop off active rosters. Sport matches the collect chips. */
const RETIRED = [
  ["Michael Jordan", "Basketball"],
  ["Kobe Bryant", "Basketball"],
  ["Magic Johnson", "Basketball"],
  ["Larry Bird", "Basketball"],
  ["Shaquille O'Neal", "Basketball"],
  ["Tim Duncan", "Basketball"],
  ["Kareem Abdul-Jabbar", "Basketball"],
  ["Hakeem Olajuwon", "Basketball"],
  ["Allen Iverson", "Basketball"],
  ["Dirk Nowitzki", "Basketball"],
  ["Kevin Garnett", "Basketball"],
  ["Dwyane Wade", "Basketball"],
  ["Carmelo Anthony", "Basketball"],
  ["Vince Carter", "Basketball"],
  ["Tracy McGrady", "Basketball"],
  ["Yao Ming", "Basketball"],
  ["Bill Russell", "Basketball"],
  ["Wilt Chamberlain", "Basketball"],
  ["Julius Erving", "Basketball"],
  ["Scottie Pippen", "Basketball"],
  ["Charles Barkley", "Basketball"],
  ["Karl Malone", "Basketball"],
  ["John Stockton", "Basketball"],
  ["Reggie Miller", "Basketball"],
  ["Ray Allen", "Basketball"],
  ["Paul Pierce", "Basketball"],
  ["Steve Nash", "Basketball"],
  ["Jason Kidd", "Basketball"],
  ["Dennis Rodman", "Basketball"],
  ["David Robinson", "Basketball"],
  ["Patrick Ewing", "Basketball"],
  ["Isiah Thomas", "Basketball"],
  ["Oscar Robertson", "Basketball"],
  ["Jerry West", "Basketball"],
  ["Pete Maravich", "Basketball"],
  ["Dominique Wilkins", "Basketball"],
  ["Clyde Drexler", "Basketball"],
  ["Chris Webber", "Basketball"],
  ["Gary Payton", "Basketball"],
  ["Grant Hill", "Basketball"],
  ["Anfernee Hardaway", "Basketball"],
  ["Manu Ginobili", "Basketball"],
  ["Tony Parker", "Basketball"],
  ["Pau Gasol", "Basketball"],
  ["Dwight Howard", "Basketball"],
  ["Blake Griffin", "Basketball"],
  ["Chris Bosh", "Basketball"],
  ["Amar'e Stoudemire", "Basketball"],
  ["Derrick Rose", "Basketball"],
  ["Lisa Leslie", "Basketball"],
  ["Sheryl Swoopes", "Basketball"],
  ["Candace Parker", "Basketball"],
  ["Diana Taurasi", "Basketball"],
  ["Sue Bird", "Basketball"],
  ["Maya Moore", "Basketball"],
  ["Tamika Catchings", "Basketball"],
  ["Cynthia Cooper", "Basketball"],
  ["Sylvia Fowles", "Basketball"],
  ["Elena Delle Donne", "Basketball"],
  ["Lauren Jackson", "Basketball"],
  ["Cheryl Miller", "Basketball"],
  ["Tom Brady", "Football"],
  ["Jerry Rice", "Football"],
  ["Joe Montana", "Football"],
  ["Peyton Manning", "Football"],
  ["Brett Favre", "Football"],
  ["Drew Brees", "Football"],
  ["Aaron Rodgers", "Football"],
  ["Dan Marino", "Football"],
  ["John Elway", "Football"],
  ["Steve Young", "Football"],
  ["Troy Aikman", "Football"],
  ["Joe Namath", "Football"],
  ["Johnny Unitas", "Football"],
  ["Kurt Warner", "Football"],
  ["Roger Staubach", "Football"],
  ["Eli Manning", "Football"],
  ["Ben Roethlisberger", "Football"],
  ["Andrew Luck", "Football"],
  ["Walter Payton", "Football"],
  ["Barry Sanders", "Football"],
  ["Emmitt Smith", "Football"],
  ["Marshall Faulk", "Football"],
  ["LaDainian Tomlinson", "Football"],
  ["Adrian Peterson", "Football"],
  ["Jim Brown", "Football"],
  ["Eric Dickerson", "Football"],
  ["Earl Campbell", "Football"],
  ["Bo Jackson", "Football"],
  ["Randy Moss", "Football"],
  ["Terrell Owens", "Football"],
  ["Calvin Johnson", "Football"],
  ["Larry Fitzgerald", "Football"],
  ["Marvin Harrison", "Football"],
  ["Cris Carter", "Football"],
  ["Michael Irvin", "Football"],
  ["Julio Jones", "Football"],
  ["Antonio Brown", "Football"],
  ["Deion Sanders", "Football"],
  ["Lawrence Taylor", "Football"],
  ["Reggie White", "Football"],
  ["Ray Lewis", "Football"],
  ["Brian Urlacher", "Football"],
  ["Dick Butkus", "Football"],
  ["Junior Seau", "Football"],
  ["Ed Reed", "Football"],
  ["Troy Polamalu", "Football"],
  ["Ronnie Lott", "Football"],
  ["Charles Woodson", "Football"],
  ["Champ Bailey", "Football"],
  ["Darrelle Revis", "Football"],
  ["Aaron Donald", "Football"],
  ["J.J. Watt", "Football"],
  ["Rob Gronkowski", "Football"],
  ["Tony Gonzalez", "Football"],
  ["Antonio Gates", "Football"],
  ["Jason Witten", "Football"],
  ["Jonathan Ogden", "Football"],
  ["Joe Thomas", "Football"],
  ["Anthony Munoz", "Football"],
  ["Babe Ruth", "Baseball"],
  ["Mickey Mantle", "Baseball"],
  ["Ken Griffey Jr.", "Baseball"],
  ["Willie Mays", "Baseball"],
  ["Hank Aaron", "Baseball"],
  ["Ted Williams", "Baseball"],
  ["Jackie Robinson", "Baseball"],
  ["Lou Gehrig", "Baseball"],
  ["Joe DiMaggio", "Baseball"],
  ["Ty Cobb", "Baseball"],
  ["Roberto Clemente", "Baseball"],
  ["Honus Wagner", "Baseball"],
  ["Sandy Koufax", "Baseball"],
  ["Nolan Ryan", "Baseball"],
  ["Tom Seaver", "Baseball"],
  ["Bob Gibson", "Baseball"],
  ["Greg Maddux", "Baseball"],
  ["Randy Johnson", "Baseball"],
  ["Pedro Martinez", "Baseball"],
  ["Roger Clemens", "Baseball"],
  ["Derek Jeter", "Baseball"],
  ["Mariano Rivera", "Baseball"],
  ["Cal Ripken Jr.", "Baseball"],
  ["Tony Gwynn", "Baseball"],
  ["Mike Schmidt", "Baseball"],
  ["George Brett", "Baseball"],
  ["Rickey Henderson", "Baseball"],
  ["Ozzie Smith", "Baseball"],
  ["Johnny Bench", "Baseball"],
  ["Yogi Berra", "Baseball"],
  ["Chipper Jones", "Baseball"],
  ["Frank Thomas", "Baseball"],
  ["Vladimir Guerrero", "Baseball"],
  ["David Ortiz", "Baseball"],
  ["Albert Pujols", "Baseball"],
  ["Ichiro Suzuki", "Baseball"],
  ["Barry Bonds", "Baseball"],
  ["Alex Rodriguez", "Baseball"],
  ["Mike Piazza", "Baseball"],
  ["Ivan Rodriguez", "Baseball"],
  ["Carl Yastrzemski", "Baseball"],
  ["Reggie Jackson", "Baseball"],
  ["Ernie Banks", "Baseball"],
  ["Stan Musial", "Baseball"],
  ["Josh Gibson", "Baseball"],
  ["Satchel Paige", "Baseball"],
  ["Miguel Cabrera", "Baseball"],
  ["Buster Posey", "Baseball"],
  ["Yadier Molina", "Baseball"],
  ["Roy Halladay", "Baseball"],
  ["Trevor Hoffman", "Baseball"],
  ["Wayne Gretzky", "Hockey"],
  ["Mario Lemieux", "Hockey"],
  ["Bobby Orr", "Hockey"],
  ["Gordie Howe", "Hockey"],
  ["Maurice Richard", "Hockey"],
  ["Jean Beliveau", "Hockey"],
  ["Guy Lafleur", "Hockey"],
  ["Bobby Hull", "Hockey"],
  ["Mark Messier", "Hockey"],
  ["Steve Yzerman", "Hockey"],
  ["Joe Sakic", "Hockey"],
  ["Peter Forsberg", "Hockey"],
  ["Jaromir Jagr", "Hockey"],
  ["Teemu Selanne", "Hockey"],
  ["Pavel Bure", "Hockey"],
  ["Eric Lindros", "Hockey"],
  ["Nicklas Lidstrom", "Hockey"],
  ["Ray Bourque", "Hockey"],
  ["Paul Coffey", "Hockey"],
  ["Patrick Roy", "Hockey"],
  ["Martin Brodeur", "Hockey"],
  ["Dominik Hasek", "Hockey"],
  ["Ken Dryden", "Hockey"],
  ["Brett Hull", "Hockey"],
  ["Mike Modano", "Hockey"],
  ["Sergei Fedorov", "Hockey"],
  ["Paul Kariya", "Hockey"],
  ["Henrik Lundqvist", "Hockey"],
  ["Sidney Crosby", "Hockey"],
  ["Alexander Ovechkin", "Hockey"],
];

function normName(value) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function cleanName(value) {
  return value.replace(/\s+/g, " ").trim();
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "slabhold-player-directory",
        },
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`${response.status} ${url}`);
      } else if (!response.ok) {
        throw new Error(`${response.status} ${url}`);
      } else {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  throw lastError;
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function athletesOf(roster) {
  const groups = Array.isArray(roster?.athletes) ? roster.athletes : [];
  const people = [];
  for (const group of groups) {
    const list = Array.isArray(group?.items) ? group.items : [group];
    for (const athlete of list) {
      const name = cleanName(athlete?.displayName || athlete?.fullName || "");
      if (!name || !/\p{L}/u.test(name)) continue;
      people.push(name);
    }
  }
  return people;
}

async function rosterPlayers(league) {
  const teamsUrl = `https://site.api.espn.com/apis/site/v2/sports/${league.path}/teams?limit=50`;
  const payload = await fetchJson(teamsUrl);
  const teams = (payload?.sports?.[0]?.leagues?.[0]?.teams ?? [])
    .map((entry) => entry?.team)
    .filter((team) => team?.id && team?.displayName);
  const rows = await mapPool(teams, 8, async (team) => {
    const roster = await fetchJson(
      `https://site.api.espn.com/apis/site/v2/sports/${league.path}/teams/${team.id}/roster`,
    );
    return athletesOf(roster).map((name) => ({
      name,
      sport: league.sport,
      team: cleanName(team.displayName),
    }));
  });
  return rows.flat();
}

function assertSafe(players) {
  const blob = JSON.stringify(players);
  if (/https?:|headshot|logo/i.test(blob)) {
    throw new Error("directory contains a url or image field");
  }
  if (players.some((player) => /pok[eé]mon|\btcg\b|yu-?gi-?oh/i.test(`${player.sport} ${player.name}`))) {
    throw new Error("directory contains a Pokémon or TCG row");
  }
}

const seen = new Set();
const players = [];

function add(row) {
  const name = cleanName(row.name);
  const sport = cleanName(row.sport);
  const norm = normName(name);
  if (!name || !sport || !norm) return;
  const key = `${sport.toLowerCase()}:${norm}`;
  if (seen.has(key)) return;
  seen.add(key);
  const next = { name, sport };
  const team = cleanName(row.team || "");
  if (team) next.team = team;
  players.push(next);
}

for (const league of LEAGUES) {
  const rows = await rosterPlayers(league);
  if (rows.length < 50) throw new Error(`${league.path} returned ${rows.length} players`);
  for (const row of rows) add(row);
  console.log(`${league.path}: ${rows.length}`);
}

for (const [name, sport] of RETIRED) add({ name, sport });

players.sort((a, b) => a.sport.localeCompare(b.sport) || a.name.localeCompare(b.name));
assertSafe(players);
writeFileSync(outFile, `${JSON.stringify(players, null, 2)}\n`);
console.log(`wrote ${players.length} players to ${outFile}`);
