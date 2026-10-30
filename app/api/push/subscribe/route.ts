import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { handleSubscribe, handleUnsubscribe, type SubscriptionWriter } from "@/lib/push/handlers";
import { pushAvailable, requestUserId } from "@/lib/push/server";

export const runtime = "nodejs";

/** Most devices one account keeps. The oldest goes first. */
const MAX_DEVICES = 10;

function subscriptionWriter(): SubscriptionWriter | null {
  const admin = createSupabaseAdmin();
  if (!admin) return null;
  return {
    async upsert(row) {
      const { error } = await admin
        .from("push_subscriptions")
        .upsert(
          { ...row, failure_count: 0, created_at: new Date().toISOString() },
          { onConflict: "endpoint" },
        );
      if (error) return { error: error.message };
      const { data } = await admin
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", row.user_id)
        .order("created_at", { ascending: false });
      const extra = (data ?? []).slice(MAX_DEVICES).map((item) => item.id as string);
      if (extra.length) await admin.from("push_subscriptions").delete().in("id", extra);
      return { error: null };
    },
    async remove(userId, endpoint) {
      const { error } = await admin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", endpoint);
      return { error: error ? error.message : null };
    },
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Whether push works right now. The app hides push UI when it doesn't. */
export async function GET() {
  return Response.json({ available: pushAvailable() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const available = pushAvailable();
  const userId = available ? await requestUserId(request) : null;
  const result = await handleSubscribe({
    available,
    userId,
    body: await readJson(request),
    userAgent: request.headers.get("user-agent"),
    writer: available ? subscriptionWriter() : null,
  });
  return Response.json(result.body, { status: result.status });
}

/** This device stops getting pushes: the Settings switch, and every sign-out. */
export async function DELETE(request: Request) {
  const available = pushAvailable();
  const userId = available ? await requestUserId(request) : null;
  const result = await handleUnsubscribe({
    available,
    userId,
    body: await readJson(request),
    writer: available ? subscriptionWriter() : null,
  });
  return Response.json(result.body, { status: result.status });
}
