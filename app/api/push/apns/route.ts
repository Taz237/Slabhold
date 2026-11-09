import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  APNS_UNAVAILABLE,
  MAX_APNS_DEVICES,
  handleApnsRegister,
  handleApnsRemove,
  isMissingTable,
  type ApnsDeviceWriter,
} from "@/lib/push/apns-handlers";
import { crossSiteRejection } from "@/lib/push/origin";
import { apnsConfigured, requestUserId } from "@/lib/push/server";

export const runtime = "nodejs";

function writer(): ApnsDeviceWriter | null {
  const admin = createSupabaseAdmin();
  if (!admin) return null;
  const table = () => admin.from("push_apns_devices");
  return {
    async upsert(userId, token) {
      try {
        const { error } = await table().upsert(
          { user_id: userId, token, failure_count: 0, created_at: new Date().toISOString() },
          { onConflict: "token" },
        );
        if (error) return { error: error.message, missingTable: isMissingTable(error) };
        const { data } = await table().select("id").eq("user_id", userId).order("created_at", { ascending: false });
        const extra = (data ?? []).map((row) => row.id as string).slice(MAX_APNS_DEVICES);
        if (extra.length) await table().delete().in("id", extra);
        return { error: null };
      } catch {
        return { error: "unexpected" };
      }
    },
    async remove(userId, token) {
      try {
        const { error } = await table().delete().eq("user_id", userId).eq("token", token);
        return error ? { error: error.message, missingTable: isMissingTable(error) } : { error: null };
      } catch {
        return { error: "unexpected" };
      }
    },
  };
}

/** The table is there (its migration is applied separately). Any error reads as no. */
async function tableReady(): Promise<boolean> {
  const admin = createSupabaseAdmin();
  if (!admin) return false;
  try {
    const { error } = await admin.from("push_apns_devices").select("id", { count: "exact", head: true }).limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function reply(result: { status: number; body: Record<string, unknown> }) {
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

/** Whether the iPhone app can turn push on right now. The app keeps its note when it can't. */
export async function GET() {
  const available = apnsConfigured() && (await tableReady());
  return Response.json({ available }, { headers: { "Cache-Control": "no-store" } });
}

/** Save this iPhone's APNs token for the signed-in caller. */
export async function POST(request: Request) {
  if (!apnsConfigured()) return reply(APNS_UNAVAILABLE);
  const forbidden = crossSiteRejection(request);
  if (forbidden) return forbidden;
  const result = await handleApnsRegister({
    available: true,
    userId: await requestUserId(request),
    body: await readJson(request),
    writer: writer(),
  });
  return reply(result);
}

/** This iPhone stops getting pushes for the caller: the Settings switch and sign-out. */
export async function DELETE(request: Request) {
  if (!apnsConfigured()) return reply(APNS_UNAVAILABLE);
  const forbidden = crossSiteRejection(request);
  if (forbidden) return forbidden;
  const result = await handleApnsRemove({
    available: true,
    userId: await requestUserId(request),
    body: await readJson(request),
    writer: writer(),
  });
  return reply(result);
}
