/** Slug aliases and shared-name keys. No directory import, so the proxy stays small. */

export const AMBIGUOUS_PLAYER_KEYS = new Set([
  "bradensmith",
  "bryanhudson",
  "garrettwilson",
  "jadenbradley",
  "josealvarado",
  "justinbarron",
  "masonmiller",
  "spencerjones",
  "taylorward",
  "tylerdavis",
  "willsmith",
]);

/** Hyphenation of an apostrophe, redirected to the canonical slug. */
export const PLAYER_SLUG_ALIASES: Record<string, string> = {
  "a-ja-wilson": "aja-wilson",
  "a-shawn-robinson": "ashawn-robinson",
  "aidan-o-connell": "aidan-oconnell",
  "al-zillion-hamilton": "alzillion-hamilton",
  "amar-e-stoudemire": "amare-stoudemire",
  "ar-darius-washington": "ardarius-washington",
  "ar-maj-reed-adams": "armaj-reed-adams",
  "azareye-h-thomas": "azareyeh-thomas",
  "brian-o-neill": "brian-oneill",
  "cam-ron-silmon-craig": "camron-silmon-craig",
  "car-lin-vigers": "carlin-vigers",
  "charle-edouard-d-astous": "charle-edouard-dastous",
  "connor-o-toole": "connor-otoole",
  "cor-dale-flott": "cordale-flott",
  "d-andre-swift": "dandre-swift",
  "d-angelo-ponds": "dangelo-ponds",
  "d-anthony-bell": "danthony-bell",
  "d-arco-perkins-mcallister": "darco-perkins-mcallister",
  "d-marco-jackson": "dmarco-jackson",
  "da-shawn-hand": "dashawn-hand",
  "da-veawn-armstead": "daveawn-armstead",
  "day-ron-sharpe": "dayron-sharpe",
  "de-aaron-fox": "deaaron-fox",
  "de-andre-hunter": "deandre-hunter",
  "de-anthony-melton": "deanthony-melton",
  "de-von-achane": "devon-achane",
  "de-zhaun-stribling": "dezhaun-stribling",
  "del-shawn-phillips": "delshawn-phillips",
  "dont-e-thornton-jr": "donte-thornton-jr",
  "dre-mont-jones": "dremont-jones",
  "drew-o-connor": "drew-oconnor",
  "eric-o-neill": "eric-oneill",
  "flau-jae-johnson": "flaujae-johnson",
  "henry-to-oto-o": "henry-tootoo",
  "j-mari-taylor": "jmari-taylor",
  "ja-kobe-walter": "jakobe-walter",
  "ja-kobi-gillespie": "jakobi-gillespie",
  "ja-kobi-lane": "jakobi-lane",
  "ja-marcus-ingram": "jamarcus-ingram",
  "ja-marr-chase": "jamarr-chase",
  "ja-mori-maclin": "jamori-maclin",
  "ja-quan-mcmillian": "jaquan-mcmillian",
  "ja-seem-reed": "jaseem-reed",
  "ja-sir-taylor": "jasir-taylor",
  "ja-tavion-sanders": "jatavion-sanders",
  "jae-sean-tate": "jaesean-tate",
  "jake-o-brien": "jake-obrien",
  "jay-viar-suggs": "jayviar-suggs",
  "jeffrey-m-ba": "jeffrey-mba",
  "jer-zhan-newton": "jerzhan-newton",
  "ji-ayir-brown": "jiayir-brown",
  "k-andre-miller": "kandre-miller",
  "k-lavon-chaisson": "klavon-chaisson",
  "k-von-wallace": "kvon-wallace",
  "ka-imi-fairbairn": "kaimi-fairbairn",
  "ke-bryan-hayes": "kebryan-hayes",
  "ke-shawn-williams": "keshawn-williams",
  "kei-trel-clark": "keitrel-clark",
  "kel-el-ware": "kelel-ware",
  "l-jarius-sneed": "ljarius-sneed",
  "liam-o-brien": "liam-obrien",
  "lil-jordan-humphrey": "liljordan-humphrey",
  "logan-o-connor": "logan-oconnor",
  "logan-o-hoppe": "logan-ohoppe",
  "nae-qwan-tomlin": "naeqwan-tomlin",
  "o-cyrus-torrence": "ocyrus-torrence",
  "patrick-o-connell": "patrick-oconnell",
  "qwan-tez-stiggers": "qwantez-stiggers",
  "riley-o-brien": "riley-obrien",
  "royce-o-neale": "royce-oneale",
  "ryan-o-hearn": "ryan-ohearn",
  "ryan-o-reilly": "ryan-oreilly",
  "sai-vion-jones": "saivion-jones",
  "shaquille-o-neal": "shaquille-oneal",
  "skyler-brind-amour": "skyler-brindamour",
  "t-vondre-sweat": "tvondre-sweat",
  "ta-niya-latson": "taniya-latson",
  "te-cory-couch": "tecory-couch",
  "travis-d-arnaud": "travis-darnaud",
  "tre-davious-white": "tredavious-white",
  "tre-von-moehrig": "trevon-moehrig",
  "ty-ron-hopper": "tyron-hopper",
  "wan-dale-robinson": "wandale-robinson",
  "za-darius-smith": "zadarius-smith",
  "zachary-l-heureux": "zachary-lheureux",
};

const SPORT_SUFFIXES = ["basketball", "baseball", "football", "hockey", "soccer"];

function normalizePlayerSegment(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 120) return "";
  let value = trimmed;
  try {
    value = decodeURIComponent(trimmed);
  } catch {
    return "";
  }
  value = value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\./g, "");
  value = value.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  if (!value || value.length > 80) return "";
  return value;
}

/** Canonical /p path when this URL is an alias or an unneeded sport suffix. */
export function playerCanonicalPath(pathname: string): string | null {
  const cut = pathname.split("?")[0]?.split("#")[0] ?? "";
  const parts = cut.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "p" || !parts[1]) return null;
  let raw = parts[1];
  try {
    raw = decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
  const normalized = normalizePlayerSegment(raw);
  if (!normalized) return null;
  let target = PLAYER_SLUG_ALIASES[normalized] ?? normalized;
  for (const sport of SPORT_SUFFIXES) {
    const suffix = `-${sport}`;
    if (!target.endsWith(suffix) || target.length <= suffix.length) continue;
    const base = target.slice(0, -suffix.length);
    const compact = base.replace(/-/g, "");
    if (!base || AMBIGUOUS_PLAYER_KEYS.has(compact)) break;
    target = PLAYER_SLUG_ALIASES[base] ?? base;
    break;
  }
  if (!target || raw === target) return null;
  return `/p/${target}`;
}
