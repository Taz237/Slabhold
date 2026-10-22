import "server-only";

import { notFound } from "next/navigation";
import { userHref } from "@/lib/social/user-href";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/supabase/server";
import { adminAccess } from "./admin";
import { REPORT_REASONS } from "./report";

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

async function requireModerator() {
  const userId = await getAuthUserId();
  if (adminAccess(userId) !== "allow" || !userId) notFound();
  const admin = createSupabaseAdmin();
  if (!admin) return { userId, admin: null as null };
  return { userId, admin };
}

export async function loadOpenReports(now = Date.now()): Promise<OpenReportRow[]> {
  const { admin } = await requireModerator();
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

  return rows.map((row) => {
    const age = reportAge(row.created_at, now);
    let preview: string | null = null;
    let href: string | null = null;
    if (row.target_type === "post") {
      preview = postPreview.get(row.target_id) ?? null;
      href = `/posts/${row.target_id}`;
    } else if (row.target_type === "reply") {
      const reply = replyPreview.get(row.target_id);
      preview = reply?.body ?? null;
      href = reply?.postId ? `/posts/${reply.postId}` : null;
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
    };
  });
}

async function stamp(
  reportId: string,
  adminId: string,
  status: "reviewed" | "actioned",
) {
  const admin = createSupabaseAdmin();
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
