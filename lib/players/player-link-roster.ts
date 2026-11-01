import { prepareRosterIndex, resolvedPlayerHref, type PlayerRef } from "./slug";

export type PlayerLinkRequest = { key: string; name: string; sport: string | null };
export type PlayerLinkReply = { key: string; href: string | null };

/** The names a player link resolves against: the bundled directory, then the card catalog. */
export function linkRoster(
  directory: readonly { name: string; sport: string }[],
  catalog: readonly { playerName: string; sport: string }[],
): PlayerRef[] {
  return [
    ...directory.map((player) => ({ name: player.name, sport: player.sport })),
    ...catalog.map((card) => ({ name: card.playerName, sport: card.sport })),
  ];
}

/** The /p link for each name, or null for a name the roster doesn't know. */
export function answerPlayerLinks(requests: readonly PlayerLinkRequest[], roster: readonly PlayerRef[]): PlayerLinkReply[] {
  return requests.map(({ key, name, sport }) => ({ key, href: resolvedPlayerHref(name, sport, roster) }));
}

/** The roster with its lookup index built in short slices: the fallback when a worker can't start. */
export async function loadLinkRosterInSlices(): Promise<PlayerRef[]> {
  const [{ default: directory }, { CARD_CATALOG }] = await Promise.all([
    import("./directory.json"),
    import("@/lib/card-catalog"),
  ]);
  const roster = linkRoster(directory as { name: string; sport: string }[], CARD_CATALOG);
  await prepareRosterIndex(roster);
  return roster;
}
