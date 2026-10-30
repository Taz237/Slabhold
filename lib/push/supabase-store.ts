import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupRow, GroupState, OutboxRow, OutboxStatus, PushStore, SendContext } from "./dispatch";
import type { PushActor } from "./payload";
import { prefsFromRow, type PrefsRow, type SourceKind } from "./prefs";
import type { DeliveryResult, PushSubscriptionRow } from "./send";

type RawRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  kind: string;
  post_id: string | null;
  notification_id: string | null;
  message_id: string | null;
  created_at: string;
  status: string;
  sent_at: string | null;
  attempts: number;
  group_key: string;
  valid?: boolean;
};

function toRow(raw: RawRow): OutboxRow {
  return {
    id: raw.id,
    recipientId: raw.recipient_id,
    actorId: raw.actor_id,
    kind: raw.kind as SourceKind,
    postId: raw.post_id,
    notificationId: raw.notification_id,
    messageId: raw.message_id,
    createdAt: raw.created_at,
    status: raw.status as OutboxStatus,
    sentAt: raw.sent_at,
    attempts: raw.attempts,
    groupKey: raw.group_key,
  };
}

type RawActor = { id: string; display_name: string | null; username: string | null; avatar_url: string | null };

function toActor(raw: RawActor | null | undefined): PushActor | null {
  if (!raw?.id) return null;
  return { id: raw.id, displayName: raw.display_name, username: raw.username, avatarUrl: raw.avatar_url };
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Errors become thrown errors with the Postgres message only (no row data). */
function check(error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

/** The outbox through the service-role push_* functions; subscriptions through the table. */
export function supabasePushStore(admin: SupabaseClient): PushStore {
  return {
    async claimForActor(actorId, limit) {
      const { data, error } = await admin.rpc("push_claim", { p_actor: actorId, p_limit: limit, p_sweep_limit: 0 });
      check(error, "push_claim");
      return ((data ?? []) as RawRow[]).map(toRow);
    },
    async claimOverdue(limit) {
      const { data, error } = await admin.rpc("push_claim", { p_actor: null, p_limit: 0, p_sweep_limit: limit });
      check(error, "push_claim");
      return ((data ?? []) as RawRow[]).map(toRow);
    },
    async context(row): Promise<SendContext | null> {
      const { data, error } = await admin.rpc("push_context", { p_id: row.id });
      check(error, "push_context");
      if (!data) return null;
      const raw = data as Record<string, unknown>;
      const post = raw.post as { hidden?: boolean } | null;
      return {
        sourceExists: raw.source_exists === true,
        recipientExists: raw.recipient_exists === true,
        actor: toActor(raw.actor as RawActor | null),
        post: post ? { hidden: post.hidden === true } : null,
        text: typeof raw.text === "string" ? raw.text : null,
        messageKind: raw.message_kind === "card_preview" ? "card_preview" : raw.message_kind ? "text" : null,
        blocked: raw.blocked === true,
        muted: raw.muted === true,
        prefs: prefsFromRow((raw.prefs as PrefsRow | null) ?? null),
        subscriptionCount: count(raw.subscription_count),
        badge: count(raw.badge),
      };
    },
    async groupState(recipientId, groupKey, actorId): Promise<GroupState> {
      const { data, error } = await admin.rpc("push_group_state", {
        p_recipient: recipientId,
        p_group_key: groupKey,
        p_actor: actorId,
      });
      check(error, "push_group_state");
      const raw = (data ?? {}) as Record<string, unknown>;
      return {
        lastPushAt: typeof raw.last_push_at === "string" ? raw.last_push_at : null,
        sentLastMinute: count(raw.sent_last_minute),
        sentLastHour: count(raw.sent_last_hour),
        dmUnread: count(raw.dm_unread),
      };
    },
    async groupRows(recipientId, groupKey): Promise<GroupRow[]> {
      const { data, error } = await admin.rpc("push_group_rows", { p_recipient: recipientId, p_group_key: groupKey });
      check(error, "push_group_rows");
      return ((data ?? []) as RawRow[]).map((raw) => ({ ...toRow(raw), valid: raw.valid === true }));
    },
    async mark(ids, status, sentAt) {
      if (ids.length === 0) return;
      const { error } = await admin.rpc("push_mark", { p_ids: ids, p_status: status, p_sent_at: sentAt });
      check(error, "push_mark");
    },
    async subscriptions(recipientId): Promise<PushSubscriptionRow[]> {
      const { data, error } = await admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", recipientId)
        .limit(20);
      check(error, "push_subscriptions");
      return (data ?? []) as PushSubscriptionRow[];
    },
    async recordDelivery(result: DeliveryResult, at: string) {
      if (result.gone.length) {
        const { error } = await admin.from("push_subscriptions").delete().in("id", result.gone);
        check(error, "push_subscriptions delete");
      }
      if (result.delivered.length) {
        const { error } = await admin
          .from("push_subscriptions")
          .update({ last_success_at: at, failure_count: 0 })
          .in("id", result.delivered);
        check(error, "push_subscriptions success");
      }
      if (result.failed.length) {
        const { data } = await admin.from("push_subscriptions").select("id, failure_count").in("id", result.failed);
        for (const row of (data ?? []) as { id: string; failure_count: number }[]) {
          await admin
            .from("push_subscriptions")
            .update({ failure_count: (row.failure_count ?? 0) + 1 })
            .eq("id", row.id);
        }
      }
    },
    async actors(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await admin
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", [...ids]);
      check(error, "profiles");
      return ((data ?? []) as RawActor[]).map(toActor).filter((actor): actor is PushActor => Boolean(actor));
    },
    async dueTails(limit) {
      const { data, error } = await admin.rpc("push_due_tails", { p_limit: limit });
      check(error, "push_due_tails");
      return ((data ?? []) as { recipient_id: string; group_key: string }[]).map((row) => ({
        recipientId: row.recipient_id,
        groupKey: row.group_key,
      }));
    },
    async takeLease(recipientId, groupKey, seconds) {
      const { data, error } = await admin.rpc("push_take_lease", {
        p_recipient: recipientId,
        p_group_key: groupKey,
        p_seconds: seconds,
      });
      check(error, "push_take_lease");
      return data === true;
    },
    async releaseLease(recipientId, groupKey) {
      const { error } = await admin.rpc("push_release_lease", { p_recipient: recipientId, p_group_key: groupKey });
      check(error, "push_release_lease");
    },
    async prune() {
      const { error } = await admin.rpc("push_prune");
      check(error, "push_prune");
    },
  };
}
