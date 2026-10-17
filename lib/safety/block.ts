export const BLOCKED_INTERACTION = "You can't interact with this account.";

export type BlockWrite = {
  insertBlock(
    blockerId: string,
    blockedId: string,
  ): Promise<{ error?: string; duplicate?: boolean }>;
  deleteFollow(followerId: string, followingId: string): Promise<{ error?: string }>;
};

/**
 * Insert the block and remove follows in both directions.
 * Unblocking does not call this, so follows stay gone.
 */
export async function blockUser(
  db: BlockWrite,
  blockerId: string,
  blockedId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!blockerId || !blockedId || blockerId === blockedId) {
    return { ok: false, error: "You can't block yourself." };
  }
  const inserted = await db.insertBlock(blockerId, blockedId);
  if (inserted.error) return { ok: false, error: inserted.error };
  const outgoing = await db.deleteFollow(blockerId, blockedId);
  if (outgoing.error) return { ok: false, error: outgoing.error };
  const incoming = await db.deleteFollow(blockedId, blockerId);
  if (incoming.error) return { ok: false, error: incoming.error };
  return { ok: true };
}
