export type ViewerBlock = {
  blockerId: string;
  blockedId: string;
};

export type ViewerMute = {
  muterId: string;
  mutedId: string;
};

/**
 * Accounts hidden from this viewer. Blocks count in both directions.
 * Mutes count when this viewer muted the other account.
 */
export function hiddenIdsForViewer(
  viewerId: string,
  blocks: readonly ViewerBlock[],
  mutes: readonly ViewerMute[],
): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.blockerId === viewerId && block.blockedId) ids.add(block.blockedId);
    if (block.blockedId === viewerId && block.blockerId) ids.add(block.blockerId);
  }
  for (const mute of mutes) {
    if (mute.muterId === viewerId && mute.mutedId) ids.add(mute.mutedId);
  }
  ids.delete(viewerId);
  return [...ids];
}
