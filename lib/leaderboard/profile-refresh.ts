import { isTestAccount } from "@/lib/test-accounts";

/** Username, avatar, the is_test flag, or a test-handle change should leave the cached board. */
export function profileChangeRefreshesBoard(input: {
  beforeUsername: string;
  afterUsername: string;
  beforeAvatar: string | null;
  afterAvatar: string | null;
  beforeTestFlag: boolean;
  afterTestFlag: boolean;
}): boolean {
  if (input.beforeUsername.trim() !== input.afterUsername.trim()) return true;
  if ((input.beforeAvatar ?? null) !== (input.afterAvatar ?? null)) return true;
  if (input.beforeTestFlag !== input.afterTestFlag) return true;
  return isTestAccount(input.beforeUsername) !== isTestAccount(input.afterUsername);
}
