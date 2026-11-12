import { parseQuickCompParams } from "@/lib/quick-comp/respond";
import type { QuickCompIdentity } from "@/lib/quick-comp/identity";
import type { ScanCompResult } from "./comp";

export const SCAN_COMP_RATE_MESSAGE = "You're scanning quickly. Try again in a few minutes";

export type ScanCompRouteDeps = {
  enabled: () => boolean;
  userId: () => Promise<string | null>;
  /** False when this user is over the scan comp rate. Reads only, but still capped. */
  allow: (userId: string) => Promise<boolean>;
  lookup: (identity: QuickCompIdentity, userId: string) => Promise<ScanCompResult>;
};

const PRIVATE = { "Cache-Control": "private, no-store" };

/** GET /api/scan/comp. Same fields as /api/quick-comp, cached sales only. */
export async function respondScanComp(request: Request, deps: ScanCompRouteDeps): Promise<Response> {
  if (!deps.enabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const userId = await deps.userId();
  if (!userId) return Response.json({ error: "Log in to see sold prices" }, { status: 401 });
  const parsed = parseQuickCompParams(new URL(request.url).searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  if (!(await deps.allow(userId))) {
    return Response.json({ error: SCAN_COMP_RATE_MESSAGE }, { status: 429, headers: PRIVATE });
  }
  const result = await deps.lookup(parsed.identity, userId);
  return Response.json(result, { headers: PRIVATE });
}
