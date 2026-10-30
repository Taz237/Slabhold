import "server-only";

import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
import { cardPageAccessDecision } from "./card-page-access";
import { isUuid } from "./card-value-access";

export type CardPageAccessDeps = {
  getUserId: () => Promise<string | null>;
  /** Minimal select: id (+ ownership). Return true when the viewer may open the page. */
  isOwner: (cardId: string, userId: string) => Promise<boolean | "unavailable">;
  notFound: () => never;
};

async function defaultIsOwner(
  cardId: string,
  userId: string,
): Promise<boolean | "unavailable"> {
  const admin = createSupabaseAdmin();
  if (!admin) return "unavailable";
  const { data, error } = await admin
    .from("cards")
    .select("id")
    .eq("id", cardId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[cards/page] ownership check failed:", error.message);
    return "unavailable";
  }
  return Boolean(data?.id);
}

const defaultDeps: CardPageAccessDeps = {
  getUserId: getAuthUserId,
  isOwner: defaultIsOwner,
  notFound,
};

/** The default checks with the viewer id from a read the page already started. */
export function cardPageAccessWith(getUserId: () => Promise<string | null>): CardPageAccessDeps {
  return { ...defaultDeps, getUserId };
}

/**
 * /cards/[id] is owner-only. Non-owners call notFound() before any comps,
 * cache, value, or Trawl work. Local (non-UUID) ids and logged-out sessions
 * skip so client/local mode still works. Public cards stay on /u/.../cards/[id].
 */
export async function requireCardPageAccess(
  cardId: string,
  deps: CardPageAccessDeps = defaultDeps,
): Promise<void> {
  const userId = await deps.getUserId();
  const owned =
    userId && isUuid(cardId.trim())
      ? await deps.isOwner(cardId.trim(), userId)
      : "skip";
  const decision = cardPageAccessDecision({ cardId, userId, owned });
  if (decision === "notFound") deps.notFound();
}

/**
 * /cards/[id]/posts stays open when a public_cards row exists.
 * A private card is owner-only. Local ids skip so this device's collection still works.
 */
export async function requireCardPostsAccess(cardId: string): Promise<void> {
  const id = cardId.trim();
  if (!isUuid(id)) return;

  const admin = createSupabaseAdmin();
  if (!admin) return;

  const { data: publicRow, error: publicError } = await admin
    .from("public_cards")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (publicError) {
    console.warn("[cards/posts] public check failed:", publicError.message);
    return;
  }
  if (publicRow?.id) return;

  const userId = await getAuthUserId();
  if (!userId) notFound();

  const { data, error } = await admin
    .from("cards")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[cards/posts] ownership check failed:", error.message);
    return;
  }
  if (!data?.id) notFound();
}
