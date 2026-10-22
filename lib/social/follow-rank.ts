import { isTestAccount, normalizeAccountHandle, NOT_SUGGESTED_HANDLES } from "../test-accounts";

/** Official account that stays available even when it does not overlap. */
export const OPTIONAL_SUGGESTION_HANDLE = "slabhold";

/** Updates account kept out of follow suggestions. The old handle is in NOT_SUGGESTED_HANDLES. */
export const HIDDEN_SUGGESTION_HANDLE = "slabholdupdates";

/**
 * Best signal per interest. Higher wins the one-line reason.
 * The total score is the sum of these across the viewer's picks.
 */
export const MATCH_WEIGHT = {
  playerRookie: 100,
  playerCollection: 80,
  teamPost: 70,
  playerPost: 50,
  playerWant: 40,
  teamWant: 30,
  sportCollection: 20,
  sportPost: 10,
} as const;

/** Ranking uses the earliest picks only. Later rows are stored but not scored. */
export const INTEREST_RANK_LIMIT = 25;

export type InterestKind = "sport" | "team" | "player";

export type CollectInterest = {
  kind: InterestKind;
  value: string;
};

export type RankedCollector = {
  id: string;
  username: string;
  displayName: string;
  reason: string | null;
  score: number;
};

export type CollectorCandidate = {
  id: string;
  username: string;
  displayName: string;
  bio?: string | null;
  createdAt?: string | null;
  /** profiles.is_test. Hidden from suggestions. */
  isTest?: boolean;
  /** Either direction of a block with the viewer. */
  blocked?: boolean;
  /** Viewer muted this account. */
  muted?: boolean;
  /** profiles.show_as_hunter. Wants count only when this is true. */
  showAsHunter?: boolean;
};

/** Public collection rows only. Private cards must be omitted or marked isPublic false. */
export type RankCard = {
  userId: string;
  player: string;
  sport: string;
  isRookie?: boolean;
  isPublic: boolean;
};

export type RankPost = {
  userId: string;
  body: string;
  player?: string | null;
  /** Set when posts.hidden_at is set. Hidden posts do not rank. */
  hiddenAt?: string | null;
};

export type RankWant = {
  userId: string;
  label: string;
};

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/** Lowercase, unaccented, punctuation collapsed. Matches public.norm closely enough to rank. */
export function normInterest(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Already-normalized name with dots, spaces, hyphens, and apostrophes removed. */
export function compactNorm(norm: string): string {
  return norm.replace(/ /g, "");
}

/** "C.J. Stroud", "CJ Stroud", and "C J Stroud" share one key. Accents are ignored. */
export function compactInterest(value: string): string {
  return compactNorm(normInterest(value));
}

/** Same sport only. A blank sport does not attach to Baseball or Hockey. */
export function playerSportsCompatible(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Tie-break when two spellings are equally common.
 * Fewer punctuation marks, then code-point order. Argument order does not matter.
 */
export function preferPlayerSpelling(left: string, right: string): string {
  const leftMarks = punctuationMarks(left);
  const rightMarks = punctuationMarks(right);
  if (leftMarks !== rightMarks) return leftMarks < rightMarks ? left : right;
  if (left === right) return left;
  return left < right ? left : right;
}

/** The spelling that appears most often. Ties use preferPlayerSpelling. */
export function majorityPlayerSpelling(spellings: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const spelling of spellings) {
    counts.set(spelling, (counts.get(spelling) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const [spelling, count] of counts) {
    if (best == null || count > bestCount) {
      best = spelling;
      bestCount = count;
    } else if (count === bestCount) {
      best = preferPlayerSpelling(best, spelling);
    }
  }
  return best ?? "";
}

function punctuationMarks(value: string): number {
  let count = 0;
  for (const char of value) {
    if (char === "." || char === "'" || char === "\u2019" || char === "-") count += 1;
  }
  return count;
}

/** Last name, dropping Jr./Sr./II/III/IV. "Victor Wembanyama" → "Wembanyama". */
export function interestShortName(value: string): string {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return value.trim();
  const last = tokens[tokens.length - 1]?.replace(/\./g, "").toLowerCase() ?? "";
  if (tokens.length > 1 && NAME_SUFFIXES.has(last)) {
    return tokens[tokens.length - 2] ?? value.trim();
  }
  return tokens[tokens.length - 1] ?? value.trim();
}

/** "Chiefs" → "Posts about the Chiefs". Multi-word clubs stay without "the". */
export function teamPostReason(team: string): string {
  const name = team.trim();
  if (!name) return "Posts about a team";
  if (/\s/.test(name)) return `Posts about ${name}`;
  return `Posts about the ${name}`;
}

export function matchReason(kind: InterestKind, value: string, weight: number): string | null {
  const name = value.trim();
  if (!name || weight <= 0) return null;
  const short = interestShortName(name);
  if (weight === MATCH_WEIGHT.playerRookie) return `Collects ${short} rookies`;
  if (weight === MATCH_WEIGHT.playerCollection) return `Collects ${short}`;
  if (weight === MATCH_WEIGHT.teamPost) return teamPostReason(name);
  if (weight === MATCH_WEIGHT.playerPost) return `Posts about ${short}`;
  if (weight === MATCH_WEIGHT.playerWant) return `Wants ${short}`;
  if (weight === MATCH_WEIGHT.teamWant) return `Wants ${name}`;
  if (weight === MATCH_WEIGHT.sportCollection) return `Collects ${name}`;
  if (weight === MATCH_WEIGHT.sportPost) return `Posts about ${name}`;
  return null;
}

/**
 * Test and QA accounts stay out of follow suggestions.
 * @slabhold stays. The updates account (@slabholdupdates, formerly @grokbotreview)
 * is on the not-suggested list only: it is not a test account, and its posts stay visible.
 * A handle or bio that merely contains "test" is still a real collector.
 */
export function hiddenFromSuggestions(profile: {
  username: string;
  bio?: string | null;
  isTest?: boolean;
}): boolean {
  const handle = normalizeAccountHandle(profile.username);
  if (!handle) return true;
  if (handle === OPTIONAL_SUGGESTION_HANDLE) return false;
  if ((NOT_SUGGESTED_HANDLES as readonly string[]).includes(handle)) return true;
  if (handle === HIDDEN_SUGGESTION_HANDLE) return true;
  if (profile.isTest) return true;
  if (isTestAccount(profile.username)) return true;
  return false;
}

function textHas(haystack: string, needle: string): boolean {
  const normNeedle = normInterest(needle);
  if (!normNeedle) return false;
  return normInterest(haystack).includes(normNeedle);
}

function bestWeight(
  personId: string,
  interest: CollectInterest,
  cards: readonly RankCard[],
  posts: readonly RankPost[],
  wants: readonly RankWant[],
  showAsHunter: boolean,
): number {
  const value = interest.value.trim();
  if (!value) return 0;
  const norm = normInterest(value);
  const publicCards = cards.filter((card) => card.userId === personId && card.isPublic);
  const ownPosts = posts.filter((post) => post.userId === personId && !post.hiddenAt);
  const ownWants = showAsHunter ? wants.filter((want) => want.userId === personId) : [];

  if (interest.kind === "player") {
    const samePlayer = publicCards.filter((card) => normInterest(card.player) === norm);
    if (samePlayer.some((card) => card.isRookie)) return MATCH_WEIGHT.playerRookie;
    if (samePlayer.length > 0) return MATCH_WEIGHT.playerCollection;
    if (
      ownPosts.some(
        (post) => textHas(post.body, value) || (post.player ? normInterest(post.player) === norm : false),
      )
    ) {
      return MATCH_WEIGHT.playerPost;
    }
    if (ownWants.some((want) => textHas(want.label, value))) return MATCH_WEIGHT.playerWant;
    return 0;
  }

  if (interest.kind === "team") {
    if (ownPosts.some((post) => textHas(post.body, value))) return MATCH_WEIGHT.teamPost;
    if (ownWants.some((want) => textHas(want.label, value))) return MATCH_WEIGHT.teamWant;
    return 0;
  }

  if (publicCards.some((card) => card.sport.toLowerCase() === value.toLowerCase())) {
    return MATCH_WEIGHT.sportCollection;
  }
  if (ownPosts.some((post) => textHas(post.body, value))) return MATCH_WEIGHT.sportPost;
  return 0;
}

/**
 * Rank collectors by overlap with the viewer's picks.
 * Collection overlap uses public cards only. The result has no card fields.
 * @slabhold is appended when the limit would otherwise drop them.
 */
export function rankCollectors(
  candidates: readonly CollectorCandidate[],
  interests: readonly CollectInterest[],
  signals: {
    cards?: readonly RankCard[];
    posts?: readonly RankPost[];
    wants?: readonly RankWant[];
  },
  input: {
    viewerId?: string | null;
    followingIds?: Iterable<string>;
    limit?: number;
  } = {},
): RankedCollector[] {
  const viewerId = input.viewerId ?? null;
  const following = new Set(input.followingIds ?? []);
  const cards = signals.cards ?? [];
  const posts = signals.posts ?? [];
  const wants = signals.wants ?? [];
  const picks = interests
    .filter((interest) => interest.value.trim().length > 0)
    .slice(0, INTEREST_RANK_LIMIT);

  const eligible = candidates.filter((person) => {
    if (!person.id) return false;
    if (viewerId && person.id === viewerId) return false;
    if (following.has(person.id)) return false;
    if (person.blocked) return false;
    if (person.muted) return false;
    if (hiddenFromSuggestions(person)) return false;
    return true;
  });

  const ranked = eligible.map((person) => {
    const hits = picks
      .map((interest) => ({
        interest,
        weight: bestWeight(person.id, interest, cards, posts, wants, person.showAsHunter === true),
      }))
      .filter((hit) => hit.weight > 0)
      .sort(
        (a, b) =>
          b.weight - a.weight || a.interest.value.localeCompare(b.interest.value),
      );
    const best = hits[0];
    return {
      id: person.id,
      username: person.username,
      displayName: person.displayName,
      reason: best ? matchReason(best.interest.kind, best.interest.value, best.weight) : null,
      score: hits.reduce((sum, hit) => sum + hit.weight, 0),
      createdAt: person.createdAt ?? "",
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.username.localeCompare(b.username);
  });

  const limit =
    input.limit == null || !Number.isFinite(input.limit)
      ? ranked.length
      : Math.max(0, Math.floor(input.limit));
  const sliced = ranked.slice(0, limit).map(strip);
  const hold = ranked.find(
    (person) => normalizeAccountHandle(person.username) === OPTIONAL_SUGGESTION_HANDLE,
  );
  if (hold && !sliced.some((person) => person.id === hold.id)) sliced.push(strip(hold));
  return sliced;
}

function strip(person: {
  id: string;
  username: string;
  displayName: string;
  reason: string | null;
  score: number;
}): RankedCollector {
  return {
    id: person.id,
    username: person.username,
    displayName: person.displayName,
    reason: person.reason,
    score: person.score,
  };
}
