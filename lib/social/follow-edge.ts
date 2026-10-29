import type { FollowEdge } from "./types";

/**
 * Follows with the viewer's edge to one person set on or off. Used to paint
 * a follow right away and to roll it back if the server says no.
 */
export function withFollowEdge(
  follows: readonly FollowEdge[],
  viewerId: string,
  userId: string,
  on: boolean,
  createdAt: string,
): FollowEdge[] {
  const without = follows.filter((edge) => !(edge.followerId === viewerId && edge.followingId === userId));
  if (!on) return without;
  const existing = follows.find((edge) => edge.followerId === viewerId && edge.followingId === userId);
  return [...without, existing ?? { followerId: viewerId, followingId: userId, createdAt }];
}
