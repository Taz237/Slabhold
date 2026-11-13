import type { OwnersAndHunters } from "./people";

/**
 * Owners and hunters as two counts, for the card-added screen after a scan.
 * No names, avatars or lists: only these two numbers. The card page doesn't
 * show owners or hunters.
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
