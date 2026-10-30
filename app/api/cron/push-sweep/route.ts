import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { pushDispatcher } from "@/lib/push/server";
import { supabasePushStore } from "@/lib/push/supabase-store";
import { runPushSweep } from "@/lib/push/sweep";

export const runtime = "nodejs";
export const maxDuration = 60;

function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  return header === `Bearer ${secret}`;
}

/**
 * Safety net for pushes no flush picked up: overdue rows, trailing summaries,
 * and the 7-day prune. Runs once a day from vercel.json (Vercel sends the
 * Bearer CRON_SECRET itself); flushes sweep as they go. With only the service
 * role set (no VAPID keys) it still prunes the outbox and sends nothing.
 * Auth: Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const dispatcher = pushDispatcher();
  const admin = dispatcher ? null : createSupabaseAdmin();
  const result = await runPushSweep({
    dispatcher,
    prune: admin ? () => supabasePushStore(admin).prune() : null,
  });
  return Response.json(result);
}
