import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanVouchText, emptySummary, isVouchHint, isVouchRating, LIST_MAX, LIST_PAGE, SUMMARY_MAX_IDS, vouchErrorCopy, vouchHintOf, type VouchSummary } from "./rules";
import { vouchesMissing } from "./support";
import type { VouchBackend, VouchPage, VouchRow, VouchStatus, VouchWriteResult } from "./types";

type RpcClient = Pick<SupabaseClient, "rpc">;
type DbError = { hint?: string | null; message?: string | null; code?: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

function count(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rows from public.vouch_summaries, by profile id. A row that doesn't read as one is skipped. */
export function summariesFromRows(rows: unknown): Map<string, VouchSummary> {
  const out = new Map<string, VouchSummary>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!isRecord(row) || typeof row.user_id !== "string") continue;
    out.set(row.user_id, {
      userId: row.user_id,
      total: count(row.total),
      positive: count(row.positive),
      neutral: count(row.neutral),
      negative: count(row.negative),
      lastVouchAt: text(row.last_vouch_at),
      followedCount: count(row.followed_count),
      followedSampleUsername: text(row.followed_sample_username),
    });
  }
  return out;
}

/** Rows from public.list_vouches. A row with no id, rating or voucher (a deleted account) is skipped, never shown half-empty. */
export function vouchRowsFromRows(rows: unknown): VouchRow[] {
  if (!Array.isArray(rows)) return [];
  const out: VouchRow[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = text(row.id);
    const createdAt = text(row.created_at);
    const voucherId = text(row.voucher_id);
    const username = text(row.voucher_username);
    if (!id || !createdAt || !voucherId || !username || !isVouchRating(row.rating)) continue;
    const reply = text(row.reply);
    out.push({
      id,
      rating: row.rating,
      note: typeof row.note === "string" ? row.note : "",
      createdAt,
      editedAt: text(row.edited_at),
      reply,
      replyAt: reply ? text(row.reply_at) : null,
      replyEditedAt: reply ? text(row.reply_edited_at) : null,
      voucher: {
        id: voucherId,
        username,
        displayName: text(row.voucher_display_name) ?? username,
        avatarUrl: text(row.voucher_avatar_url),
        accent: text(row.voucher_accent),
        createdAt: text(row.voucher_created_at),
        vouchTotal: count(row.voucher_vouch_total),
      },
      hasLoggedDeal: row.has_logged_deal === true,
    });
  }
  return out;
}

/** The one row public.vouch_status returns. */
export function statusFromRows(rows: unknown): VouchStatus {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!isRecord(row)) return { canVouch: false, reason: null, mine: null };
  const mineId = text(row.my_vouch_id);
  return {
    canVouch: row.can_vouch === true,
    reason: isVouchHint(row.reason) ? row.reason : null,
    mine: mineId && isVouchRating(row.my_rating) ? { id: mineId, rating: row.my_rating, note: typeof row.my_note === "string" ? row.my_note : "" } : null,
  };
}

function refused(error: DbError): VouchWriteResult {
  return { ok: false, error: vouchErrorCopy(error), hint: vouchHintOf(error) };
}

/** Everything goes through the vouch functions: nothing reads or writes public.vouches directly. */
export function remoteVouchBackend(supabase: RpcClient): VouchBackend {
  return {
    async summaries(userIds) {
      const wanted = [...new Set(userIds.filter((id) => UUID.test(id)))];
      const out = new Map<string, VouchSummary>();
      // The function refuses more than 50 ids, so a long screen asks in batches.
      for (let start = 0; start < wanted.length; start += SUMMARY_MAX_IDS) {
        const batch = wanted.slice(start, start + SUMMARY_MAX_IDS);
        const { data, error } = await supabase.rpc("vouch_summaries", { p_user_ids: batch });
        if (error) {
          // Not installed yet: no trust lines rather than a failure.
          if (vouchesMissing(error)) return new Map<string, VouchSummary>();
          throw new Error(error.message);
        }
        const found = summariesFromRows(data);
        for (const id of batch) out.set(id, found.get(id) ?? emptySummary(id));
      }
      return out;
    },
    async list(subjectId, options = {}): Promise<VouchPage> {
      const limit = Math.min(Math.max(Math.floor(options.limit ?? LIST_PAGE), 1), LIST_MAX);
      const { data, error } = await supabase.rpc("list_vouches", {
        p_subject: subjectId,
        p_rating: options.rating ?? null,
        p_before_created: options.before?.createdAt ?? null,
        p_before_id: options.before?.id ?? null,
        p_limit: limit,
      });
      if (error) {
        if (vouchesMissing(error)) return { rows: [], next: null };
        throw new Error(error.message);
      }
      const raw = Array.isArray(data) ? data : [];
      const rows = vouchRowsFromRows(raw);
      // The cursor comes from the last row the database sent, even if that row was skipped here,
      // so a page with an unreadable row still moves on. A short page is the last one.
      const last = raw.length >= limit && isRecord(raw[raw.length - 1]) ? (raw[raw.length - 1] as Record<string, unknown>) : null;
      const createdAt = last ? text(last.created_at) : null;
      const id = last ? text(last.id) : null;
      return { rows, next: createdAt && id ? { createdAt, id } : null };
    },
    async status(subjectId) {
      const { data, error } = await supabase.rpc("vouch_status", { p_subject: subjectId });
      if (error) {
        if (vouchesMissing(error)) return { canVouch: false, reason: null, mine: null };
        throw new Error(error.message);
      }
      return statusFromRows(data);
    },
    async upsert(subjectId, rating, note) {
      const { data, error } = await supabase.rpc("upsert_vouch", { p_subject: subjectId, p_rating: rating, p_note: cleanVouchText(note) });
      if (error) return refused(error);
      return typeof data === "string" && data ? { ok: true, id: data } : { ok: true };
    },
    async remove(subjectId) {
      const { error } = await supabase.rpc("delete_vouch", { p_subject: subjectId });
      // Already gone (removed on another device) is the outcome they asked for.
      if (error && error.hint !== "vouch_not_found") return refused(error);
      return { ok: true };
    },
    async reply(vouchId, body) {
      const { error } = await supabase.rpc("reply_to_vouch", { p_vouch_id: vouchId, p_reply: cleanVouchText(body) });
      return error ? refused(error) : { ok: true };
    },
  };
}
