import "server-only";

import type { SafetyRelations } from "@/lib/safety/can-notify";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isActorCardAlert,
  type WantAlertDb,
  type WantMatchEvent,
  type WantRow,
} from "./notify-want-matches";
import { storedWantSourceType } from "./owned-card";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CardLink = {
  id: string;
  userId: string;
  isPublic: boolean;
  username: string | null;
};

async function loadCardLink(
  id: string,
  cache: Map<string, CardLink | null>,
): Promise<CardLink | null> {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  const admin = createSupabaseAdmin();
  if (!admin) {
    cache.set(id, null);
    return null;
  }
  const { data, error } = await admin
    .from("cards")
    .select("id, user_id, is_public")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    cache.set(id, null);
    return null;
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("username")
    .eq("id", data.user_id)
    .maybeSingle();
  const link: CardLink = {
    id: data.id as string,
    userId: data.user_id as string,
    isPublic: Boolean(data.is_public),
    username: (profile?.username as string | undefined) ?? null,
  };
  cache.set(id, link);
  return link;
}

function blockSafety(admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>): SafetyRelations {
  return {
    async isBlocked(a, b) {
      if (!UUID_RE.test(a) || !UUID_RE.test(b)) return true;
      if (a === b) return false;
      const { data, error } = await admin
        .from("blocks")
        .select("blocker_id")
        .or(
          `and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`,
        )
        .limit(1);
      if (error) return true;
      return (data?.length ?? 0) > 0;
    },
    async isMuted(actorId, recipientId) {
      if (!UUID_RE.test(actorId) || !UUID_RE.test(recipientId)) return true;
      const { data, error } = await admin
        .from("mutes")
        .select("muter_id")
        .eq("muter_id", recipientId)
        .eq("muted_id", actorId)
        .limit(1);
      if (error) return true;
      return (data?.length ?? 0) > 0;
    },
  };
}

function saleHref(want: WantRow, link: CardLink | null, fallback: string): string {
  if (!link) return fallback || "/collection";
  if (link.userId === want.userId) return `/cards/${link.id}`;
  if (link.isPublic && link.username) return `/u/${link.username}/cards/${link.id}`;
  return "/collection";
}

/** Service-role adapter. Returns null when the admin client is unconfigured. */
export function createSupabaseWantDb(): WantAlertDb | null {
  const admin = createSupabaseAdmin();
  if (!admin) return null;
  const cards = new Map<string, CardLink | null>();

  return {
    async wantsForKey(cardKey) {
      const { data, error } = await admin
        .from("want_list")
        .select("id, user_id, card_key, target_price, created_at, source_card_id")
        .eq("card_key", cardKey);
      if (error) throw new Error(error.message);
      return (data ?? []).map(
        (row): WantRow => ({
          id: row.id as string,
          userId: row.user_id as string,
          cardKey: row.card_key as string,
          targetPrice:
            row.target_price == null ? null : Number(row.target_price),
          createdAt: row.created_at as string,
          sourceCardId: (row.source_card_id as string | null) ?? null,
        }),
      );
    },

    async alertsToday(userId, sinceIso) {
      const { count, error } = await admin
        .from("want_alerts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", sinceIso);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    async recentActorCardAlert(query) {
      // notifications keep actor_id and card_key after the card row is deleted.
      // notifications_recipient_idx (recipient_id, created_at) covers this read.
      const { data, error } = await admin
        .from("notifications")
        .select("metadata")
        .eq("recipient_id", query.userId)
        .eq("actor_id", query.actorId)
        .eq("kind", "want_alert")
        .gte("created_at", query.sinceIso);
      if (error) throw new Error(error.message);
      return (data ?? []).some((row) => isActorCardAlert(row.metadata, query.cardKey));
    },

    async insertAlert(row) {
      const { data, error } = await admin
        .from("want_alerts")
        .insert({
          want_id: row.wantId,
          user_id: row.userId,
          source_type: storedWantSourceType(row.sourceType),
          source_id: row.sourceId,
          card_id: row.cardId ?? null,
          created_at: row.createdAt,
        })
        .select("id")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") return false;
        throw new Error(error.message);
      }
      return Boolean(data?.id);
    },

    async insertNotification(row) {
      const { error } = await admin.from("notifications").insert({
        recipient_id: row.recipientId,
        actor_id: row.actorId,
        kind: "want_alert",
        post_id: row.postId,
        preview: row.preview,
        href: row.href,
        metadata: row.metadata ?? null,
      });
      if (error) throw new Error(error.message);
    },

    async deleteAlert(wantId, sourceType, sourceId, cardId) {
      let query = admin
        .from("want_alerts")
        .delete()
        .eq("want_id", wantId)
        .eq("source_type", storedWantSourceType(sourceType))
        .eq("source_id", sourceId);
      query = cardId ? query.eq("card_id", cardId) : query.is("card_id", null);
      await query;
    },

    safety: blockSafety(admin),

    async isFollower(userId, actorId) {
      if (!UUID_RE.test(userId) || !UUID_RE.test(actorId)) return false;
      const { data, error } = await admin
        .from("follows")
        .select("follower_id")
        .eq("follower_id", userId)
        .eq("following_id", actorId)
        .maybeSingle();
      if (error) return false;
      return Boolean(data);
    },

    async hrefFor(want, event: WantMatchEvent) {
      const id = want.sourceCardId || event.cardId || "";
      if (!id) return event.href || "/collection";
      const link = await loadCardLink(id, cards);
      return saleHref(want, link, event.href);
    },
  };
}
