import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { UNAVAILABLE, handleSubscribe, handleUnsubscribe, type SubscriptionWriter } from "@/lib/push/handlers";
import { crossSiteRejection } from "@/lib/push/origin";
import { pushAvailable, requestUserId } from "@/lib/push/server";
import { createSubscriptionWriter } from "@/lib/push/subscribe-writer";

export const runtime = "nodejs";

function subscriptionWriter(): SubscriptionWriter | null {
  const admin = createSupabaseAdmin();
  if (!admin) return null;
  const table = () => admin.from("push_subscriptions");
  return createSubscriptionWriter({
    async find(endpoint) {
      const { data, error } = await table().select("user_id, p256dh, auth").eq("endpoint", endpoint).maybeSingle();
      return { row: data ?? null, error: error ? error.message : null };
    },
    async insert(row) {
      const { error } = await table().insert(row);
      return { error: error ? error.message : null, duplicate: error?.code === "23505" };
    },
    async update(endpoint, userId, patch) {
      const { data, error } = await table().update(patch).eq("endpoint", endpoint).eq("user_id", userId).select("id");
      return { error: error ? error.message : null, count: data?.length ?? 0 };
    },
    async deleteOwned(endpoint, userId, auth) {
      const { data, error } = await table()
        .delete()
        .eq("endpoint", endpoint)
        .eq("user_id", userId)
        .eq("auth", auth)
        .select("id");
      return { error: error ? error.message : null, count: data?.length ?? 0 };
    },
    async idsNewestFirst(userId) {
      const { data } = await table().select("id").eq("user_id", userId).order("created_at", { ascending: false });
      return (data ?? []).map((item) => item.id as string);
    },
    async deleteIds(ids) {
      await table().delete().in("id", [...ids]);
    },
    async remove(userId, endpoint) {
      const { error } = await table().delete().eq("user_id", userId).eq("endpoint", endpoint);
      return { error: error ? error.message : null };
    },
  });
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
  if (!available) return Response.json(UNAVAILABLE.body, { status: UNAVAILABLE.status });
  const forbidden = crossSiteRejection(request);
  if (forbidden) return forbidden;
  const result = await handleSubscribe({
    available,
    userId: await requestUserId(request),
    body: await readJson(request),
    userAgent: request.headers.get("user-agent"),
    writer: subscriptionWriter(),
  });
  return Response.json(result.body, { status: result.status });
}

/** This device stops getting pushes: the Settings switch, and every sign-out. */
export async function DELETE(request: Request) {
  const available = pushAvailable();
  if (!available) return Response.json(UNAVAILABLE.body, { status: UNAVAILABLE.status });
  const forbidden = crossSiteRejection(request);
  if (forbidden) return forbidden;
  const result = await handleUnsubscribe({
    available,
    userId: await requestUserId(request),
    body: await readJson(request),
    writer: subscriptionWriter(),
  });
  return Response.json(result.body, { status: result.status });
}
