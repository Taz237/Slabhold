import { after } from "next/server";
import { consumeRateLimit } from "@/lib/comps/rate-limit";
import { flushForActor, logCounts, runTailsWhenDue, sweepTails } from "@/lib/push/dispatch";
import { UNAVAILABLE, gateFlush } from "@/lib/push/handlers";
import { crossSiteRejection } from "@/lib/push/origin";
import { pushDispatcher, requestUserId } from "@/lib/push/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** How long after() may wait for a trailing summary's window to close. */
const TAIL_BUDGET_MS = 48_000;

/**
 * Fired (and forgotten) by the actor's app after a follow, like, reply,
 * repost, post or DM. Takes no ids: it sends the caller's own pending outbox
 * rows from the last 10 minutes, sweeps a few overdue ones, then waits in
 * after() to send any trailing summary once its minute is up.
 */
export async function POST(request: Request) {
  const dispatcher = pushDispatcher();
  if (!dispatcher) return Response.json(UNAVAILABLE.body, { status: UNAVAILABLE.status });
  const forbidden = crossSiteRejection(request);
  if (forbidden) return forbidden;
  const userId = await requestUserId(request);
  const gate = await gateFlush({ available: true, userId, consume: consumeRateLimit });
  if (gate.run && userId) {
    after(async () => {
      try {
        const { counts, tails } = await flushForActor(dispatcher, userId);
        await sweepTails(dispatcher, counts);
        if (Math.random() < 0.05) await dispatcher.store.prune();
        logCounts("flush", counts);
        if (tails.length) logCounts("tail", await runTailsWhenDue(dispatcher, tails, TAIL_BUDGET_MS));
      } catch (error) {
        console.warn("[push] flush failed:", error instanceof Error ? error.message : "unknown");
      }
    });
  }
  return Response.json(gate.body, { status: gate.status });
}
