import "server-only";

import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { userHref } from "@/lib/social/user-href";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
import { adminAccess, parseAdminIds } from "./admin";
import { REPORT_REASONS, REPORT_TARGET_GONE, REPORT_VOUCH_GONE } from "./report";
import { reportedAccountFor } from "./vouch-report";

export type OpenReportRow = {
  id: string;
  createdAt: string;
  waitingLabel: string;
  stale: boolean;
  reason: string;
  details: string | null;
  targetType: string;
  targetId: string;
  reporter: string;
  reported: string;
  preview: string | null;
  href: string | null;
  canModeratePost: boolean;
  canDelete: boolean;
  /** A report on a vouch that is still showing: it can be hidden. */
  canHideVouch: boolean;
  /** A report on a reply to a vouch that is still showing: the reply can be taken off. */
  canRemoveVouchReply: boolean;
};

type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reported_user_id: string;
  reason: string;
  details: string | null;
  created_at: string;
};

export function reportAge(createdAt: string, now = Date.now()): { label: string; stale: boolean } {
  const ms = Math.max(0, now - new Date(createdAt).getTime());
  const stale = ms >= 24 * 60 * 60 * 1000;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return { label: `${Math.max(1, minutes)}m`, stale };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { label: `${hours}h`, stale };
  const days = Math.floor(hours / 24);
  return { label: `${days}d ${hours % 24}h`, stale };
}

function reasonLabel(reason: string) {
  return REPORT_REASONS.find((item) => item.id === reason)?.label ?? reason;
}

/** Test seams. Production callers pass nothing. */
export type ModeratorDeps = {
  getUserId?: () => Promise<string | null>;
  createAdmin?: () => SupabaseClient | null;
  adminIds?: string;
};

async function requireModerator(deps: ModeratorDeps = {}) {
  const userId = await (deps.getUserId ?? getAuthUserId)();
  if (adminAccess(userId, deps.adminIds) !== "allow" || !userId) notFound();
  const admin = (deps.createAdmin ?? createSupabaseAdmin)();
  if (!admin) return { userId, admin: null as null };
  return { userId, admin };
}

export async function loadOpenReports(now = Date.now(), deps: ModeratorDeps = {}): Promise<OpenReportRow[]> {
  const { admin } = await requireModerator(deps);
  if (!admin) return [];
  const { data, error } = await admin
    .from("reports")
    .select(
      "id, reporter_id, target_type, target_id, reported_user_id, reason, details, created_at",
    )
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ReportRow[];
  const userIds = [
    ...new Set(rows.flatMap((row) => [row.reporter_id, row.reported_user_id])),
  ];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const profiles = await admin.from("profiles").select("id, username").in("id", userIds);
    if (profiles.error) throw new Error(profiles.error.message);
    for (const profile of profiles.data ?? []) {
      names.set(profile.id as string, `@${profile.username as string}`);
    }
  }

  const postIds = rows.filter((row) => row.target_type === "post").map((row) => row.target_id);
  const replyIds = rows.filter((row) => row.target_type === "reply").map((row) => row.target_id);
  const postPreview = new Map<string, string>();
  const replyPreview = new Map<string, { body: string; postId: string | null }>();
  if (postIds.length > 0) {
    const posts = await admin.from("posts").select("id, content").in("id", postIds);
    if (posts.error) throw new Error(posts.error.message);
    for (const post of posts.data ?? []) {
      postPreview.set(post.id as string, (post.content as string) ?? "");
    }
  }
  if (replyIds.length > 0) {
    const replies = await admin.from("comments").select("id, body, post_id").in("id", replyIds);
    if (replies.error) throw new Error(replies.error.message);
    for (const reply of replies.data ?? []) {
      replyPreview.set(reply.id as string, {
        body: (reply.body as string) ?? "",
        postId: (reply.post_id as string | null) ?? null,
      });
    }
  }

  // Vouches: the note (or the reply) as the preview, and a link to the vouch on its subject's page.
  const vouchIds = [
    ...new Set(rows.filter((row) => row.target_type === "vouch" || row.target_type === "vouch_reply").map((row) => row.target_id)),
  ];
  type VouchRow = { note: string; reply: string | null; subjectId: string; hidden: boolean; replyHidden: boolean };
  const vouchRows = new Map<string, VouchRow>();
  if (vouchIds.length > 0) {
    const vouches = await admin.from("vouches").select("id, note, reply, subject_id, hidden_at, reply_hidden_at").in("id", vouchIds);
    // The vouches table isn't in every database yet: those reports show as "Target unavailable".
    if (!vouches.error) {
      for (const vouch of vouches.data ?? []) {
        vouchRows.set(vouch.id as string, {
          note: (vouch.note as string | null) ?? "",
          reply: (vouch.reply as string | null) ?? null,
          subjectId: vouch.subject_id as string,
          hidden: vouch.hidden_at != null,
          replyHidden: vouch.reply_hidden_at != null,
        });
      }
      const subjectIds = [...new Set([...vouchRows.values()].map((vouch) => vouch.subjectId))].filter((id) => !names.has(id));
      if (subjectIds.length > 0) {
        const subjects = await admin.from("profiles").select("id, username").in("id", subjectIds);
        if (subjects.error) throw new Error(subjects.error.message);
        for (const profile of subjects.data ?? []) names.set(profile.id as string, `@${profile.username as string}`);
      }
    }
  }

  return rows.map((row) => {
    const age = reportAge(row.created_at, now);
    const vouch = row.target_type === "vouch" || row.target_type === "vouch_reply" ? vouchRows.get(row.target_id) : undefined;
    let preview: string | null = null;
    let href: string | null = null;
    if (row.target_type === "post") {
      preview = postPreview.get(row.target_id) ?? null;
      href = `/posts/${row.target_id}`;
    } else if (row.target_type === "reply") {
      const reply = replyPreview.get(row.target_id);
      preview = reply?.body ?? null;
      href = reply?.postId ? `/posts/${reply.postId}` : null;
    } else if (row.target_type === "vouch" || row.target_type === "vouch_reply") {
      const subject = vouch ? names.get(vouch.subjectId) : undefined;
      preview = (row.target_type === "vouch" ? vouch?.note : vouch?.reply) || null;
      href = vouch && subject ? vouchHref(subject.slice(1), row.target_id) : null;
    } else {
      const reportedName = names.get(row.reported_user_id);
      href = reportedName ? userHref(reportedName.slice(1)) : null;
    }
    return {
      id: row.id,
      createdAt: row.created_at,
      waitingLabel: age.label,
      stale: age.stale,
      reason: reasonLabel(row.reason),
      details: row.details,
      targetType: row.target_type,
      targetId: row.target_id,
      reporter: names.get(row.reporter_id) ?? "Unknown",
      reported: names.get(row.reported_user_id) ?? "Unknown",
      preview,
      href,
      canModeratePost: row.target_type === "post",
      canDelete: row.target_type === "post" || row.target_type === "reply",
      canHideVouch: row.target_type === "vouch" && Boolean(vouch) && !vouch?.hidden,
      canRemoveVouchReply: row.target_type === "vouch_reply" && Boolean(vouch?.reply) && !vouch?.replyHidden,
    };
  });
}

/** A vouch on its subject's vouches page. */
export function vouchHref(subjectUsername: string, vouchId: string): string {
  return `${userHref(subjectUsername)}/vouches#vouch-${encodeURIComponent(vouchId)}`;
}

async function stamp(
  reportId: string,
  adminId: string,
  status: "reviewed" | "actioned",
  admin: SupabaseClient | null = createSupabaseAdmin(),
) {
  if (!admin) return "Moderation is unavailable right now.";
  const { error } = await admin
    .from("reports")
    .update({
      status,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  return error ? error.message : null;
}

export async function reviewReport(reportId: string): Promise<{ error?: string }> {
  const { userId, admin } = await requireModerator();
  if (!admin) return { error: "Moderation is unavailable right now." };
  const failed = await stamp(reportId, userId, "reviewed");
  return failed ? { error: failed } : {};
}

export async function hideReportedPost(reportId: string): Promise<{ error?: string }> {
  const { userId, admin } = await requireModerator();
  if (!admin) return { error: "Moderation is unavailable right now." };
  const { data, error } = await admin
    .from("reports")
    .select("target_type, target_id")
    .eq("id", reportId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data || data.target_type !== "post") return { error: "This report isn't about a post." };
  const hidden = await admin
    .from("posts")
    .update({ hidden_at: new Date().toISOString(), hidden_by: userId })
    .eq("id", data.target_id as string);
  if (hidden.error) return { error: hidden.error.message };
  const failed = await stamp(reportId, userId, "actioned");
  return failed ? { error: failed } : {};
}

export async function deleteReportedTarget(reportId: string): Promise<{ error?: string }> {
  const { userId, admin } = await requireModerator();
  if (!admin) return { error: "Moderation is unavailable right now." };
  const { data, error } = await admin
    .from("reports")
    .select("target_type, target_id")
    .eq("id", reportId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "That report is gone." };
  if (data.target_type === "post") {
    const removed = await admin.from("posts").delete().eq("id", data.target_id as string);
    if (removed.error) return { error: removed.error.message };
  } else if (data.target_type === "reply") {
    const removed = await admin.from("comments").delete().eq("id", data.target_id as string);
    if (removed.error) return { error: removed.error.message };
  } else {
    return { error: "This report isn't about a post or reply." };
  }
  const failed = await stamp(reportId, userId, "actioned");
  return failed ? { error: failed } : {};
}

export const VOUCH_REPORT_GONE = "That vouch is gone.";

/** The vouch a report is about, when the report is of the kind asked for. */
async function reportedVouchId(
  admin: SupabaseClient,
  reportId: string,
  kind: "vouch" | "vouch_reply",
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await admin.from("reports").select("target_type, target_id").eq("id", reportId).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "That report is gone." };
  if (data.target_type !== kind) {
    return { error: kind === "vouch" ? "This report isn't about a vouch." : "This report isn't about a reply to a vouch." };
  }
  return { id: String(data.target_id ?? "") };
}

/**
 * Hides a reported vouch (service role): it drops out of every count and list.
 * The vouch stays in the table, so it can be shown again by clearing hidden_at.
 */
export async function hideReportedVouch(reportId: string, deps: ModeratorDeps = {}): Promise<{ error?: string }> {
  const { userId, admin } = await requireModerator(deps);
  if (!admin) return { error: "Moderation is unavailable right now." };
  const target = await reportedVouchId(admin, reportId, "vouch");
  if ("error" in target) return { error: target.error };
  const hidden = await admin
    .from("vouches")
    .update({ hidden_at: new Date().toISOString(), hidden_by: userId })
    .eq("id", target.id)
    .select("id");
  if (hidden.error) return { error: hidden.error.message };
  if ((hidden.data ?? []).length === 0) return { error: VOUCH_REPORT_GONE };
  const failed = await stamp(reportId, userId, "actioned", admin);
  return failed ? { error: failed } : {};
}

/** Takes a reported reply off its vouch (service role). The vouch itself stays. */
export async function removeReportedVouchReply(reportId: string, deps: ModeratorDeps = {}): Promise<{ error?: string }> {
  const { userId, admin } = await requireModerator(deps);
  if (!admin) return { error: "Moderation is unavailable right now." };
  const target = await reportedVouchId(admin, reportId, "vouch_reply");
  if ("error" in target) return { error: target.error };
  const hidden = await admin
    .from("vouches")
    .update({ reply_hidden_at: new Date().toISOString() })
    .eq("id", target.id)
    .not("reply", "is", null)
    .select("id");
  if (hidden.error) return { error: hidden.error.message };
  if ((hidden.data ?? []).length === 0) return { error: VOUCH_REPORT_GONE };
  const failed = await stamp(reportId, userId, "actioned", admin);
  return failed ? { error: failed } : {};
}

export const SUSPEND_TARGET_GONE = "This post is gone. Suspend from a report on the account";
export const SUSPEND_VOUCH_GONE = "This vouch is gone. Suspend from a report on the account";
export const SUSPEND_AUTHOR_MISMATCH = "This report names a different account than the author";

/** Supabase Auth's built-in ban, about 100 years. Lifted in the dashboard (Unban). */
export const SUSPEND_BAN_DURATION = "876000h";

/**
 * Suspends the reported account: an Auth ban so they can't log in, and every
 * post of theirs hidden the way hideReportedPost hides one.
 */
export async function suspendReportedUser(
  reportId: string,
  deps: ModeratorDeps = {},
): Promise<{ error?: string }> {
  const { userId, admin } = await requireModerator(deps);
  if (!admin) return { error: "Moderation is unavailable right now." };
  const { data, error } = await admin
    .from("reports")
    .select("target_type, target_id, reported_user_id")
    .eq("id", reportId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "That report is gone." };
  // reports.reported_user_id is set by the reporter's client. Trust the row's author instead.
  const author = await reportedAccountFor(
    String(data.target_type ?? ""),
    String(data.target_id ?? ""),
    async (table, id) => {
      const found = await admin.from(table).select("user_id").eq("id", id).maybeSingle();
      if (found.error) return { userId: null, error: found.error.message };
      return { userId: typeof found.data?.user_id === "string" ? found.data.user_id : null };
    },
    {
      // A vouch report: the voucher (or, for a reply, the subject) from the real row.
      async lookup(id) {
        const found = await admin.from("vouches").select("voucher_id, subject_id, reply").eq("id", id).maybeSingle();
        if (found.error) return { error: found.error.message };
        if (typeof found.data?.voucher_id !== "string" || typeof found.data?.subject_id !== "string") return null;
        return { voucherId: found.data.voucher_id, subjectId: found.data.subject_id, hasReply: found.data.reply != null };
      },
    },
  );
  if ("error" in author) {
    if (author.error === REPORT_VOUCH_GONE) return { error: SUSPEND_VOUCH_GONE };
    return { error: author.error === REPORT_TARGET_GONE ? SUSPEND_TARGET_GONE : author.error };
  }
  const reportedId = author.userId;
  if (reportedId !== data.reported_user_id) return { error: SUSPEND_AUTHOR_MISMATCH };
  const adminIds = parseAdminIds(deps.adminIds ?? process.env.ADMIN_USER_IDS);
  if (reportedId === userId || adminIds.includes(reportedId)) {
    return { error: "You can't suspend a moderator account." };
  }
  const banned = await admin.auth.admin.updateUserById(reportedId, {
    ban_duration: SUSPEND_BAN_DURATION,
  });
  if (banned.error) return { error: banned.error.message };
  const hidden = await admin
    .from("posts")
    .update({ hidden_at: new Date().toISOString(), hidden_by: userId })
    .eq("user_id", reportedId)
    .is("hidden_at", null);
  if (hidden.error) return { error: hidden.error.message };
  const failed = await stamp(reportId, userId, "actioned", admin);
  return failed ? { error: failed } : {};
}
