import { CARD_YEAR_MAX } from "@/lib/card-options";

/**
 * The Older years search on Add card. Typing is a filter, never a check:
 * "199" lists the 1990s, "1990" and "90" put 1990-91 and 1990 on top, and
 * "90-91" or "1990/91" find the season. Ties keep the sport's own order.
 */
export function yearSearchMatches(options: readonly string[], query: string): string[] {
  const typed = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!typed) return [...options];
  const season = seasonKey(typed);
  const century = /^\d{2}$/.test(typed) ? twoDigitYear(typed) : null;
  const ranked: { option: string; rank: number; index: number }[] = [];
  options.forEach((option, index) => {
    const rank = yearRank(option.toLowerCase(), typed, season, century);
    if (rank != null) ranked.push({ option, rank, index });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.map((row) => row.option);
}

/** "1990/91", "1990-1991" and "90-91" all read as "1990-91" or "90-91". */
function seasonKey(typed: string): string | null {
  const match = typed.match(/^(\d{2}|\d{4})[-/](\d{2}|\d{4})$/);
  if (!match) return null;
  return `${match[1]}-${match[2].slice(-2)}`;
}

/** "23" is 2023, "90" is 1990: the newest year a card can have. */
function twoDigitYear(typed: string): string {
  const recent = `20${typed}`;
  return Number(recent) <= CARD_YEAR_MAX ? recent : `19${typed}`;
}

function yearRank(
  option: string,
  typed: string,
  season: string | null,
  century: string | null,
): number | null {
  const start = option.slice(0, 4);
  if (season && option === season) return 0;
  if (start === typed || start === century) return 1;
  if (season && option.endsWith(season)) return 2;
  if (/^\d{1,3}$/.test(typed) && start.startsWith(typed)) return 3;
  if (option.includes(typed)) return 4;
  return null;
}
