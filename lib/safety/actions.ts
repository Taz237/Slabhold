"use server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer, getAuthUserId } from "@/lib/supabase/server";
import { adminAccess } from "./admin";
import { blockUser } from "./block";
import { deleteReportedTarget, hideReportedPost, reviewReport } from "./moderation";
import { saveReport, type ReportInput } from "./report";

async function sessionClient() {
  const userId = await getAuthUserId();
  const supabase = userId ? await createSupabaseServer() : null;
  return { userId, supabase };
}

export async function submitReport(input: {
  targetType: ReportInput["targetType"];
  targetId: string;
  reportedUserId: string;
  reason: string;
  details?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId, supabase } = await sessionClient();
  if (!userId || !supabase) return { ok: false, error: "Log in to report." };
  return saveReport(
    {
      async insert(row) {
        const { error } = await supabase.from("reports").insert(row);
        if (!error) return {};
        return { error: error.message, code: error.code };
      },
    },
    {
      reporterId: userId,
      targetType: input.targetType,
      targetId: input.targetId,
      reportedUserId: input.reportedUserId,
      reason: input.reason,
      details: input.details,
    },
  );
}

export async function blockAccount(
  blockedId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId, supabase } = await sessionClient();
  if (!userId || !supabase) return { ok: false, error: "Log in to block accounts." };
  const admin = createSupabaseAdmin();
  if (!admin) return { ok: false, error: "Blocking is unavailable right now." };
  return blockUser(
    {
      async insertBlock(blockerId, targetId) {
        const { error } = await supabase.from("blocks").insert({
          blocker_id: blockerId,
          blocked_id: targetId,
        });
        if (!error) return {};
        if (error.code === "23505") return { duplicate: true };
        return { error: error.message };
      },
      async deleteFollow(followerId, followingId) {
        const { error } = await admin
          .from("follows")
          .delete()
          .eq("follower_id", followerId)
          .eq("following_id", followingId);
        return error ? { error: error.message } : {};
      },
    },
    userId,
    blockedId,
  );
}

export async function unblockAccount(
  blockedId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId, supabase } = await sessionClient();
  if (!userId || !supabase) return { ok: false, error: "Log in to unblock accounts." };
  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function muteAccount(
  mutedId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId, supabase } = await sessionClient();
  if (!userId || !supabase) return { ok: false, error: "Log in to mute accounts." };
  if (userId === mutedId) return { ok: false, error: "You can't mute yourself." };
  const { error } = await supabase.from("mutes").insert({
    muter_id: userId,
    muted_id: mutedId,
  });
  if (error && error.code !== "23505") return { ok: false, error: error.message };
  return { ok: true };
}

export async function unmuteAccount(
  mutedId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId, supabase } = await sessionClient();
  if (!userId || !supabase) return { ok: false, error: "Log in to unmute accounts." };
  const { error } = await supabase
    .from("mutes")
    .delete()
    .eq("muter_id", userId)
    .eq("muted_id", mutedId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function viewerIsAdmin(): Promise<boolean> {
  const userId = await getAuthUserId();
  return adminAccess(userId) === "allow";
}

export async function markReportReviewed(reportId: string) {
  return reviewReport(reportId);
}

export async function hideReportPost(reportId: string) {
  return hideReportedPost(reportId);
}

export async function deleteReportTarget(reportId: string) {
  return deleteReportedTarget(reportId);
}
