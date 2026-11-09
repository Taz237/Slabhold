import { consumeRateLimit } from "@/lib/comps/rate-limit";
import { UNAVAILABLE, gateTest } from "@/lib/push/handlers";
import { crossSiteRejection } from "@/lib/push/origin";
import { deliverToUser } from "@/lib/push/dispatch";
import { testPayload } from "@/lib/push/payload";
import { pushDispatcher, requestUserId } from "@/lib/push/server";

export const runtime = "nodejs";

/** "Send a test notification" in Settings: one push to each of the caller's devices, web and iPhone. */
export async function POST(request: Request) {
  const dispatcher = pushDispatcher();
  if (!dispatcher) return Response.json(UNAVAILABLE.body, { status: UNAVAILABLE.status });
  const forbidden = crossSiteRejection(request);
  if (forbidden) return forbidden;
  const userId = await requestUserId(request);
  const gate = await gateTest({ available: true, userId, consume: consumeRateLimit });
  if (!gate.run || !userId) return Response.json(gate.body, { status: gate.status });

  // Web subscriptions (when VAPID is set) and iPhone app devices (when APNs is set).
  const result = await deliverToUser(dispatcher, userId, testPayload(Date.now()), Date.now());
  if (result.devices === 0) {
    return Response.json({ error: "Turn on push notifications on this device first." }, { status: 409 });
  }
  console.info("[push] test", { delivered: result.delivered, gone: result.gone, failed: result.failed });
  if (result.delivered === 0) {
    return Response.json({ error: "Your device didn't accept the test. Turn push off and on again." }, { status: 502 });
  }
  return Response.json({ ok: true, delivered: result.delivered });
}
