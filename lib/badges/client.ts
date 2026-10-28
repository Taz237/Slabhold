import type { BadgeReveal } from "./reveal";

export type BadgeCheckResult =
  | { available: false }
  | {
      available: true;
      earnedCount: number;
      total: number;
      /** The pins the profile shows now, auto pins included. */
      pinned: string[];
      reveal: BadgeReveal | null;
    };

/** Ask the server to check the signed-in user's badges. Never throws. */
export async function requestBadgeCheck(): Promise<BadgeCheckResult | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/api/badges", { method: "POST", keepalive: true });
    if (!response.ok) return null;
    return (await response.json()) as BadgeCheckResult;
  } catch {
    return null;
  }
}

/** Fire-and-forget check after a card add, a post, or a follow. */
export function pingBadgeCheck() {
  void requestBadgeCheck();
}
