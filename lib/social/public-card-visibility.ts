/**
 * A server-fetched public card skips the snapshot's block filter.
 * Once the snapshot is ready, hide it when the collector is blocked or is in
 * the hidden-author set (including someone who blocked the viewer).
 */
export function publicCardHiddenFromViewer(input: {
  ready: boolean;
  profileId: string | null | undefined;
  blockedIds: readonly string[];
  hiddenAuthorIds: readonly string[];
}): boolean {
  if (!input.ready || !input.profileId) return false;
  return (
    input.blockedIds.includes(input.profileId) ||
    input.hiddenAuthorIds.includes(input.profileId)
  );
}
