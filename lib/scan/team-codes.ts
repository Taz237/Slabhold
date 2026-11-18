/**
 * The short team codes cards and scoreboards print beside a name: UTA, MEM, KC, TB. One code can be
 * a team in more than one sport (ATL is the Hawks, the Falcons and the Braves), so each maps to every
 * team it names. Used only to take a code off a nameplate ("DARRYN PETERSON UTA"): a code is never
 * part of a person's name, and it says which sport the card is.
 */
export type CodedTeam = { name: string; sport: "Basketball" | "Football" | "Baseball" | "Hockey" };

const NBA = "ATL Atlanta Hawks|BOS Boston Celtics|BKN Brooklyn Nets|BRK Brooklyn Nets|CHA Charlotte Hornets|CHI Chicago Bulls|CLE Cleveland Cavaliers|DAL Dallas Mavericks|DEN Denver Nuggets|DET Detroit Pistons|GSW Golden State Warriors|GS Golden State Warriors|HOU Houston Rockets|IND Indiana Pacers|LAC Los Angeles Clippers|LAL Los Angeles Lakers|MEM Memphis Grizzlies|MIA Miami Heat|MIL Milwaukee Bucks|MIN Minnesota Timberwolves|NOP New Orleans Pelicans|NO New Orleans Pelicans|NYK New York Knicks|NY New York Knicks|OKC Oklahoma City Thunder|ORL Orlando Magic|PHI Philadelphia 76ers|PHX Phoenix Suns|PHO Phoenix Suns|POR Portland Trail Blazers|SAC Sacramento Kings|SAS San Antonio Spurs|SA San Antonio Spurs|TOR Toronto Raptors|UTA Utah Jazz|WAS Washington Wizards|WSH Washington Wizards";
const NFL = "ARI Arizona Cardinals|ATL Atlanta Falcons|BAL Baltimore Ravens|BUF Buffalo Bills|CAR Carolina Panthers|CHI Chicago Bears|CIN Cincinnati Bengals|CLE Cleveland Browns|DAL Dallas Cowboys|DEN Denver Broncos|DET Detroit Lions|GB Green Bay Packers|HOU Houston Texans|IND Indianapolis Colts|JAX Jacksonville Jaguars|JAC Jacksonville Jaguars|KC Kansas City Chiefs|LV Las Vegas Raiders|LAC Los Angeles Chargers|LAR Los Angeles Rams|MIA Miami Dolphins|MIN Minnesota Vikings|NE New England Patriots|NO New Orleans Saints|NYG New York Giants|NYJ New York Jets|PHI Philadelphia Eagles|PIT Pittsburgh Steelers|SF San Francisco 49ers|SEA Seattle Seahawks|TB Tampa Bay Buccaneers|TEN Tennessee Titans|WAS Washington Commanders|WSH Washington Commanders";
const MLB = "ARI Arizona Diamondbacks|AZ Arizona Diamondbacks|ATL Atlanta Braves|BAL Baltimore Orioles|BOS Boston Red Sox|CHC Chicago Cubs|CWS Chicago White Sox|CHW Chicago White Sox|CIN Cincinnati Reds|CLE Cleveland Guardians|COL Colorado Rockies|DET Detroit Tigers|HOU Houston Astros|KC Kansas City Royals|KCR Kansas City Royals|LAA Los Angeles Angels|LAD Los Angeles Dodgers|MIA Miami Marlins|MIL Milwaukee Brewers|MIN Minnesota Twins|NYM New York Mets|NYY New York Yankees|ATH Athletics|OAK Athletics|PHI Philadelphia Phillies|PIT Pittsburgh Pirates|SD San Diego Padres|SDP San Diego Padres|SF San Francisco Giants|SFG San Francisco Giants|SEA Seattle Mariners|STL St. Louis Cardinals|TB Tampa Bay Rays|TBR Tampa Bay Rays|TEX Texas Rangers|TOR Toronto Blue Jays|WSH Washington Nationals|WAS Washington Nationals";
const NHL = "ANA Anaheim Ducks|BOS Boston Bruins|BUF Buffalo Sabres|CGY Calgary Flames|CAR Carolina Hurricanes|CHI Chicago Blackhawks|COL Colorado Avalanche|CBJ Columbus Blue Jackets|DAL Dallas Stars|DET Detroit Red Wings|EDM Edmonton Oilers|FLA Florida Panthers|LAK Los Angeles Kings|MIN Minnesota Wild|MTL Montreal Canadiens|NSH Nashville Predators|NJD New Jersey Devils|NJ New Jersey Devils|NYI New York Islanders|NYR New York Rangers|OTT Ottawa Senators|PHI Philadelphia Flyers|PIT Pittsburgh Penguins|SJS San Jose Sharks|SJ San Jose Sharks|SEA Seattle Kraken|STL St. Louis Blues|TBL Tampa Bay Lightning|TB Tampa Bay Lightning|TOR Toronto Maple Leafs|UTA Utah Mammoth|VAN Vancouver Canucks|VGK Vegas Golden Knights|WSH Washington Capitals|WPG Winnipeg Jets";

const BY_CODE = new Map<string, CodedTeam[]>();
for (const [sport, list] of [["Basketball", NBA], ["Football", NFL], ["Baseball", MLB], ["Hockey", NHL]] as const) {
  for (const entry of list.split("|")) {
    const at = entry.indexOf(" ");
    const code = entry.slice(0, at);
    BY_CODE.set(code, [...(BY_CODE.get(code) ?? []), { name: entry.slice(at + 1), sport }]);
  }
}

/** The teams a code names, across sports. Empty for anything that isn't a team code. Case counts: a code prints in capitals. */
export function teamsForCode(word: string): readonly CodedTeam[] {
  return /^[A-Z]{2,3}$/.test(word) ? (BY_CODE.get(word) ?? []) : [];
}

/** Every team the codes name, once. */
export const CODED_TEAM_NAMES: readonly string[] = [...new Set([...BY_CODE.values()].flat().map((team) => team.name))];

const teamNameKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const CODED_TEAM_KEYS = new Set(CODED_TEAM_NAMES.map(teamNameKey));

/** The line is one of those teams' full names and nothing else ("LOS ANGELES DODGERS"). */
export function isCodedTeamName(line: string): boolean {
  return CODED_TEAM_KEYS.has(teamNameKey(line));
}
