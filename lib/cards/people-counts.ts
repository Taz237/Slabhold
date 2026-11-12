import type { OwnersAndHunters } from "./people";

/**
 * Owners and hunters as two counts, for the card-added screen after a scan.
 * No names, avatars or lists: only these numbers leave the server
 * (/api/cards/people/counts). The card page doesn't show owners or hunters.
 */

export type PeopleCounts = {
  /** Other collectors with a public copy, the viewer left out. */
  owners: number;
  /** Null when this viewer can't read want lists. */
  hunters: number | null;
};

export function peopleCounts(people: OwnersAndHunters | null): PeopleCounts | null {
  if (!people) return null;
  const others = (list: { count: number; includesViewer?: boolean }) =>
    Math.max(0, list.count - (list.includesViewer ? 1 : 0));
  return {
    owners: others(people.owners),
    hunters: people.hunters ? others(people.hunters) : null,
  };
}

const number = new Intl.NumberFormat("en-US");

/** "4 collectors own this · 2 are hunting it". Null when there is nothing to say. */
export function peopleCountsLine(counts: PeopleCounts | null): string | null {
  if (!counts) return null;
  const owners = counts.owners;
  const hunters = counts.hunters ?? 0;
  if (owners <= 0 && hunters <= 0) return null;
  const parts: string[] = [];
  if (owners > 0) {
    parts.push(owners === 1 ? "1 collector owns this" : `${number.format(owners)} collectors own this`);
  }
  if (hunters > 0) {
    const count = number.format(hunters);
    if (owners > 0) parts.push(hunters === 1 ? "1 is hunting it" : `${count} are hunting it`);
    else parts.push(hunters === 1 ? "1 collector is hunting it" : `${count} collectors are hunting it`);
  }
  return parts.join(" · ");
}
