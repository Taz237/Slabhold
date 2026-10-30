import { consumeRateLimit } from "@/lib/comps/rate-limit";
import { UNAVAILABLE, gateTest } from "@/lib/push/handlers";
import { crossSiteRejection } from "@/lib/push/origin";
import { testPayload } from "@/lib/push/payload";
import { deliver } from "@/lib/push/send";
import { pushDispatcher, requestUserId } from "@/lib/push/server";

export const runtime = "nodejs";

/** "Send a test notification" in Settings: one push to each of the caller's devices. */
export async function POST(request: Request) {
  const dispatcher = pushDispatcher();
  if (!dispatcher) return Response.json(UNAVAILABLE.body, { status: UNAVAILABLE.status });
  const forbidden = crossSiteRejection(request);
  if (forbidden) return forbidden;
  const userId = await requestUserId(request);
  const gate = await gateTest({ available: true, userId, consume: consumeRateLimit });
  if (!gate.run || !userId) return Response.json(gate.body, { status: gate.status });

  const subscriptions = await dispatcher.store.subscriptions(userId);
  if (subscriptions.length === 0) {
    return Response.json({ error: "Turn on push notifications on this device first." }, { status: 409 });
  }
  const result = await deliver({
    sender: dispatcher.sender,
    config: dispatcher.config,
    subscriptions,
    payload: testPayload(Date.now()),
  });
  await dispatcher.store.recordDelivery(result, new Date().toISOString());
  console.info("[push] test", { delivered: result.delivered.length, gone: result.gone.length, failed: result.failed.length });
  if (result.delivered.length === 0) {
    return Response.json({ error: "Your device didn't accept the test. Turn push off and on again." }, { status: 502 });
  }
  return Response.json({ ok: true, delivered: result.delivered.length });
}
