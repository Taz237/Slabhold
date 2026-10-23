import { isTestAccount } from "@/lib/test-accounts";

/**
 * Username, avatar, or a test-handle change should leave the cached board.
 * profiles.is_test is not written by the app. Pass both flags only from a
 * caller that actually changed that column.
 */
export function profileChangeRefreshesBoard(input: {
  beforeUsername: string;
  afterUsername: string;
  beforeAvatar: string | null;
  afterAvatar: string | null;
  beforeTestFlag?: boolean;
  afterTestFlag?: boolean;
}): boolean {
  if (input.beforeUsername.trim() !== input.afterUsername.trim()) return true;
  if ((input.beforeAvatar ?? null) !== (input.afterAvatar ?? null)) return true;
  if (
    input.beforeTestFlag != null &&
    input.afterTestFlag != null &&
    input.beforeTestFlag !== input.afterTestFlag
  ) {
    return true;
  }
  return isTestAccount(input.beforeUsername) !== isTestAccount(input.afterUsername);
}
