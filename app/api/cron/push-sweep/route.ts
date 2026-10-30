import { flushForActor, logCounts, sweepTails } from "@/lib/push/dispatch";
import { pushDispatcher } from "@/lib/push/server";

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
 * and the 7-day prune. Auth: Authorization: Bearer <CRON_SECRET>. Not on a
 * schedule in vercel.json (the plan allows daily crons only); flushes sweep
 * as they go.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const dispatcher = pushDispatcher();
  if (!dispatcher) return Response.json({ ok: true, available: false });
  // An actor id that matches nothing: only the overdue sweep claims rows.
  const { counts } = await flushForActor(dispatcher, "00000000-0000-0000-0000-000000000000");
  await sweepTails(dispatcher, counts);
  await dispatcher.store.prune();
  logCounts("sweep", counts);
  return Response.json({ ok: true, ...counts });
}
